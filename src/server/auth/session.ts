import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { and, eq, isNull, lt, or } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { sessions, users } from '@/server/db/schema'
import { getEnv } from '@/server/env'

/**
 * Sessões opacas em banco (ADR-003).
 *
 * O token sorteado vai para o cookie; o banco guarda só o HMAC-SHA256 dele.
 * Um vazamento da tabela `sessions` não produz sessões utilizáveis, porque
 * reverter o HMAC exige o `AUTH_SECRET`, que vive fora do banco.
 */

export { SESSION_COOKIE } from '@/shared/auth-cookie'

const TOKEN_BYTES = 32
/** Renova a validade quando já passou desta fração do tempo total. */
const ROLLING_RENEWAL_THRESHOLD = 0.5
/** Evita um UPDATE a cada requisição só para registrar o último uso. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000

export interface SessionMetadata {
  ipAddress?: string | null
  userAgent?: string | null
}

export interface CreatedSession {
  /** Valor que vai para o cookie. Só existe aqui — nunca é persistido. */
  token: string
  sessionId: string
  expiresAt: Date
}

function hashToken(token: string): string {
  return createHmac('sha256', getEnv().AUTH_SECRET).update(token).digest('hex')
}

function ttlMs(): number {
  return getEnv().SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
}

export async function createSession(
  userId: string,
  metadata: SessionMetadata = {},
): Promise<CreatedSession> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlMs())

  const [created] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,
    })
    .returning({ id: sessions.id })

  if (!created) throw new Error('Não foi possível criar a sessão.')

  return { token, sessionId: created.id, expiresAt }
}

export interface ActiveSession {
  sessionId: string
  userId: string
  expiresAt: Date
}

/**
 * Valida o token e devolve a sessão ativa, ou `null`.
 *
 * Também renova a validade de forma deslizante: quem usa o sistema todo dia não
 * é deslogado no sétimo dia; quem some por uma semana precisa entrar de novo.
 */
export async function validateSessionToken(token: string): Promise<ActiveSession | null> {
  if (!token || token.length < 16) return null

  const tokenHash = hashToken(token)

  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
    columns: {
      id: true,
      userId: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
    with: {
      user: { columns: { id: true, status: true, deletedAt: true } },
    },
  })

  if (!row) return null

  // A busca já foi por igualdade indexada; a comparação em tempo constante é
  // defesa em profundidade contra oráculo de temporização no lookup.
  const expected = Buffer.from(row.tokenHash, 'utf8')
  const provided = Buffer.from(tokenHash, 'utf8')
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null

  if (row.revokedAt) return null
  if (row.expiresAt.getTime() <= Date.now()) return null
  if (!row.user || row.user.deletedAt || row.user.status !== 'active') return null

  const now = Date.now()
  const total = ttlMs()
  const remaining = row.expiresAt.getTime() - now

  let expiresAt = row.expiresAt
  const shouldRenew = remaining < total * ROLLING_RENEWAL_THRESHOLD
  const shouldTouch = now - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS

  if (shouldRenew || shouldTouch) {
    expiresAt = shouldRenew ? new Date(now + total) : row.expiresAt
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date(now), expiresAt })
      .where(eq(sessions.id, row.id))
  }

  return { sessionId: row.id, userId: row.userId, expiresAt }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
}

/** Usado ao suspender um usuário ou quando ele troca a senha. */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
}

/** Limpeza de sessões mortas. Chamada por rotina administrativa. */
export async function purgeExpiredSessions(): Promise<number> {
  const removed = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, new Date()), lt(sessions.revokedAt, new Date())))
    .returning({ id: sessions.id })

  return removed.length
}

export async function listUserSessions(userId: string) {
  return db.query.sessions.findMany({
    where: and(eq(sessions.userId, userId), isNull(sessions.revokedAt)),
    columns: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: (table, { desc }) => [desc(table.lastUsedAt)],
  })
}

export async function touchUserLogin(userId: string): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId))
}
