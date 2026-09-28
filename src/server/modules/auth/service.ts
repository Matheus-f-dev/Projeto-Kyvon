import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { hashPassword, needsRehash, verifyPassword } from '@/server/auth/password'
import {
  createSession,
  revokeAllUserSessions,
  touchUserLogin,
  type CreatedSession,
} from '@/server/auth/session'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { AppError, RateLimitError } from '@/server/errors'
import { recordAudit } from '@/server/modules/audit/service'
import { loginByEmailLimiter, loginByIpLimiter } from '@/server/security/rate-limit'

/**
 * Regras de autenticação.
 *
 * Duas decisões de segurança que valem explicar:
 *
 * 1. **Resposta única para qualquer falha.** E-mail inexistente, senha errada e
 *    conta suspensa devolvem a mesma mensagem. Diferenciar transformaria a tela
 *    de login em um verificador de quem trabalha na Kyvon.
 *
 * 2. **Custo de verificação constante.** Quando o e-mail não existe, ainda
 *    assim fazemos um hash descartável. Sem isso, o tempo de resposta denunciaria
 *    quais e-mails estão cadastrados.
 */

const GENERIC_FAILURE = 'E-mail ou senha incorretos.'

/**
 * Hash descartável com os parâmetros **correntes**, gerado uma vez e reusado.
 *
 * Verificar contra ele quando o e-mail não existe faz a resposta custar o mesmo
 * tempo de um login real. Um literal fixo no código envelheceria: ao endurecer
 * os parâmetros de scrypt, o caminho "usuário inexistente" ficaria mais rápido
 * que o caminho real e voltaria a denunciar quais e-mails existem.
 */
let dummyHash: Promise<string> | undefined

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'))
  return dummyHash
}

export interface LoginContext {
  ipAddress: string | null
  userAgent: string | null
}

export interface LoginSuccess {
  session: CreatedSession
  userId: string
}

export async function login(
  email: string,
  password: string,
  context: LoginContext,
): Promise<LoginSuccess> {
  const normalizedEmail = email.trim().toLowerCase()
  const ip = context.ipAddress ?? 'desconhecido'

  // Limita por e-mail **e** por IP: só por IP, um escritório inteiro atrás de
  // um NAT se bloqueia junto; só por e-mail, dá para varrer contas trocando o alvo.
  const [byEmail, byIp] = await Promise.all([
    loginByEmailLimiter.check(`login:email:${normalizedEmail}`),
    loginByIpLimiter.check(`login:ip:${ip}`),
  ])

  if (!byEmail.allowed || !byIp.allowed) {
    const retryAfter = Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds)
    await recordAudit({
      actor: null,
      action: 'login_failed',
      entityType: 'user',
      entityLabel: normalizedEmail,
      changes: { reason: { from: null, to: 'rate_limited' } },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })
    throw new RateLimitError(retryAfter, 'Muitas tentativas. Aguarde alguns minutos.')
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
    columns: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
      deletedAt: true,
    },
  })

  const passwordMatches = await verifyPassword(
    password,
    user?.passwordHash ?? (await getDummyHash()),
  )

  const canLogin = Boolean(user) && !user?.deletedAt && user?.status === 'active'

  if (!user || !passwordMatches || !canLogin) {
    await recordAudit({
      actor: null,
      action: 'login_failed',
      entityType: 'user',
      entityId: user?.id ?? null,
      entityLabel: normalizedEmail,
      changes: {
        reason: {
          from: null,
          to: !user ? 'unknown_email' : !passwordMatches ? 'wrong_password' : 'inactive_account',
        },
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    throw new AppError('unauthorized', GENERIC_FAILURE)
  }

  // Login bem-sucedido zera o contador — quem acertou não deve ficar penalizado
  // pelas tentativas anteriores.
  await loginByEmailLimiter.reset(`login:email:${normalizedEmail}`)

  // Parâmetros de hash endurecidos desde o cadastro? Regrava agora, enquanto a
  // senha em claro está disponível.
  if (needsRehash(user.passwordHash)) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, user.id))
  }

  const session = await createSession(user.id, {
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  })

  await touchUserLogin(user.id)

  await recordAudit({
    actor: { id: user.id, email: user.email },
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  })

  return { session, userId: user.id }
}

export interface ChangePasswordContext extends LoginContext {
  userId: string
  userEmail: string
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  context: ChangePasswordContext,
): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, context.userId),
    columns: { id: true, passwordHash: true },
  })

  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError('validation', 'A senha atual está incorreta.', {
      currentPassword: ['A senha atual está incorreta.'],
    })
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, user.id))

  // Trocar a senha derruba as outras sessões: é o gesto que a pessoa faz quando
  // suspeita que alguém tem acesso à conta.
  await revokeAllUserSessions(user.id)

  await recordAudit({
    actor: { id: context.userId, email: context.userEmail },
    action: 'update',
    entityType: 'user',
    entityId: user.id,
    entityLabel: context.userEmail,
    changes: { password: { from: '********', to: '********' } },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  })
}
