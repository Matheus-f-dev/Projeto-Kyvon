import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { hashPassword, needsRehash, verifyPassword } from '@/server/auth/password'
import {
  createSession,
  revokeAllUserSessions,
  revokeSession,
  validateSessionToken,
} from '@/server/auth/session'
import { db } from '@/server/db/client'
import { sessions, users } from '@/server/db/schema'
import { AppError, RateLimitError } from '@/server/errors'
import { login } from '@/server/modules/auth/service'
import { __resetAllRateLimits } from '@/server/security/rate-limit'

import { createTestUser } from './helpers'

const METADATA = { ipAddress: '10.0.0.1', userAgent: 'vitest' }

beforeEach(() => {
  // Os limitadores guardam estado em memória entre os testes.
  __resetAllRateLimits()
})

describe('hash de senha', () => {
  it('produz hashes diferentes para a mesma senha', async () => {
    const first = await hashPassword('MesmaSenha@2026')
    const second = await hashPassword('MesmaSenha@2026')

    expect(first).not.toBe(second)
    expect(first.startsWith('scrypt$')).toBe(true)
  })

  it('valida a senha correta e recusa a errada', async () => {
    const hash = await hashPassword('Correta@2026')

    expect(await verifyPassword('Correta@2026', hash)).toBe(true)
    expect(await verifyPassword('Errada@2026', hash)).toBe(false)
  })

  it('não lança com hash ausente ou corrompido', async () => {
    expect(await verifyPassword('x', null)).toBe(false)
    expect(await verifyPassword('x', 'lixo')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$a$b$c$d$e')).toBe(false)
  })

  it('detecta hash gerado com parâmetros fracos', async () => {
    expect(needsRehash(await hashPassword('Qualquer@2026'))).toBe(false)
    expect(needsRehash('scrypt$1024$8$1$YWJj$YWJj')).toBe(true)
  })
})

describe('sessão', () => {
  it('valida o token recém-criado', async () => {
    const user = await createTestUser('dev')
    const session = await createSession(user.id, METADATA)

    const active = await validateSessionToken(session.token)

    expect(active?.userId).toBe(user.id)
    expect(active?.sessionId).toBe(session.sessionId)
  })

  it('guarda apenas o hash do token no banco', async () => {
    const user = await createTestUser('dev')
    const session = await createSession(user.id, METADATA)

    const [row] = await db
      .select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(eq(sessions.id, session.sessionId))
      .limit(1)

    expect(row?.tokenHash).toBeDefined()
    expect(row?.tokenHash).not.toBe(session.token)
    expect(row?.tokenHash).toHaveLength(64)
  })

  it('recusa token inválido', async () => {
    expect(await validateSessionToken('token-que-nao-existe-mas-e-longo')).toBeNull()
    expect(await validateSessionToken('')).toBeNull()
  })

  it('recusa sessão revogada', async () => {
    const user = await createTestUser('dev')
    const session = await createSession(user.id, METADATA)

    await revokeSession(session.sessionId)

    expect(await validateSessionToken(session.token)).toBeNull()
  })

  it('recusa sessão expirada', async () => {
    const user = await createTestUser('dev')
    const session = await createSession(user.id, METADATA)

    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, session.sessionId))

    expect(await validateSessionToken(session.token)).toBeNull()
  })

  it('recusa sessão de usuário suspenso', async () => {
    const user = await createTestUser('dev')
    const session = await createSession(user.id, METADATA)

    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, user.id))

    expect(await validateSessionToken(session.token)).toBeNull()
  })

  it('revoga todas as sessões do usuário de uma vez', async () => {
    const user = await createTestUser('dev')
    const first = await createSession(user.id, METADATA)
    const second = await createSession(user.id, METADATA)

    await revokeAllUserSessions(user.id)

    expect(await validateSessionToken(first.token)).toBeNull()
    expect(await validateSessionToken(second.token)).toBeNull()
  })
})

describe('login', () => {
  it('autentica com credenciais corretas', async () => {
    const user = await createTestUser('comercial', { password: 'Correta@2026' })

    const result = await login(user.email, 'Correta@2026', METADATA)

    expect(result.userId).toBe(user.id)
    expect(await validateSessionToken(result.session.token)).not.toBeNull()
  })

  it('aceita e-mail com maiúsculas e espaços', async () => {
    const user = await createTestUser('comercial', { password: 'Correta@2026' })

    const result = await login(`  ${user.email.toUpperCase()} `, 'Correta@2026', METADATA)

    expect(result.userId).toBe(user.id)
  })

  it('devolve a mesma mensagem para senha errada e e-mail inexistente', async () => {
    const user = await createTestUser('comercial', { password: 'Correta@2026' })

    const senhaErrada = await login(user.email, 'Errada@2026', METADATA).catch(
      (error: unknown) => error,
    )
    const emailInexistente = await login('ninguem@kyvon.com.br', 'Errada@2026', METADATA).catch(
      (error: unknown) => error,
    )

    expect(senhaErrada).toBeInstanceOf(AppError)
    expect(emailInexistente).toBeInstanceOf(AppError)
    // Mensagens idênticas: a tela de login não pode revelar quais e-mails existem.
    expect((senhaErrada as AppError).message).toBe((emailInexistente as AppError).message)
  })

  it('recusa usuário suspenso', async () => {
    const user = await createTestUser('comercial', { password: 'Correta@2026' })
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, user.id))

    await expect(login(user.email, 'Correta@2026', METADATA)).rejects.toBeInstanceOf(AppError)
  })

  it('bloqueia após tentativas demais no mesmo e-mail', async () => {
    const user = await createTestUser('comercial', { password: 'Correta@2026' })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login(user.email, 'Errada@2026', METADATA).catch(() => undefined)
    }

    // Sexta tentativa é barrada antes mesmo de conferir a senha — inclusive a correta.
    await expect(login(user.email, 'Correta@2026', METADATA)).rejects.toBeInstanceOf(RateLimitError)
  })

  it('libera o contador do e-mail após um login bem-sucedido', async () => {
    const user = await createTestUser('comercial', { password: 'Correta@2026' })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await login(user.email, 'Errada@2026', METADATA).catch(() => undefined)
    }

    await login(user.email, 'Correta@2026', METADATA)

    // Zerado: as três falhas anteriores não contam mais.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await login(user.email, 'Errada@2026', METADATA).catch(() => undefined)
    }

    await expect(login(user.email, 'Correta@2026', METADATA)).resolves.toBeDefined()
  })
})
