'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth/context'
import { revokeSessionByToken, SESSION_COOKIE } from '@/server/auth/session'
import { getEnv } from '@/server/env'
import {
  errorState,
  formDataToObject,
  parseInput,
  runAction,
  type ActionState,
} from '@/server/action-state'
import { recordAudit } from '@/server/modules/audit/service'
import { changePasswordSchema, loginSchema } from '@/shared/schemas/auth'

import { changePassword, login } from './service'

/** Server Actions de autenticação. Camada fina sobre `service.ts`. */

async function requestMetadata() {
  const headerList = await headers()
  const forwarded = headerList.get('x-forwarded-for')

  return {
    ipAddress: forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? null,
    userAgent: headerList.get('user-agent'),
  }
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // `secure` quebraria o login em http://localhost durante o desenvolvimento.
    secure: getEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function loginAction(_previous: unknown, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const input = parseInput(loginSchema, formDataToObject(formData))
    const metadata = await requestMetadata()

    const { session } = await login(input.email, input.password, metadata)
    await setSessionCookie(session.token, session.expiresAt)

    return { status: 'success' as const }
  })

  // O redirect fica fora do `runAction` de propósito: ele funciona lançando uma
  // exceção, e engolir isso dentro do tratamento de erro travaria o login.
  if (result.status === 'success') {
    redirect(sanitizeRedirect(formData.get('redirectTo')))
  }

  return result
}

/**
 * Só aceita caminho interno.
 *
 * Sem esta checagem, `/login?redirectTo=https://site-falso` transformaria a
 * tela de login em um redirecionador aberto — recurso clássico de phishing
 * para dar aparência legítima ao link.
 */
function sanitizeRedirect(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '/dashboard'

  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return '/dashboard'
  // `//host` e `/\host` são absolutos para o navegador.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return '/dashboard'

  return trimmed
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const context = await getAuthContext()

  if (token) await revokeSessionByToken(token)

  if (context) {
    const metadata = await requestMetadata()
    await recordAudit({
      actor: { id: context.user.id, email: context.user.email },
      action: 'logout',
      entityType: 'session',
      entityId: context.sessionId,
      entityLabel: context.user.email,
      ...metadata,
    })
  }

  cookieStore.delete(SESSION_COOKIE)
  redirect('/login')
}

export async function changePasswordAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await getAuthContext()
    if (!context) return errorState('Sessão expirada. Entre novamente.')

    const input = parseInput(changePasswordSchema, formDataToObject(formData))
    const metadata = await requestMetadata()

    await changePassword(input.currentPassword, input.newPassword, {
      ...metadata,
      userId: context.user.id,
      userEmail: context.user.email,
    })

    return {
      status: 'success' as const,
      message: 'Senha alterada. As outras sessões foram encerradas.',
    }
  })
}
