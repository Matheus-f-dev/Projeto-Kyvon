import { db, type Database } from '@/server/db/client'
import { auditLogs } from '@/server/db/schema'
import type { AuthContext } from '@/server/auth/context'

/**
 * Log de auditoria.
 *
 * Responde "quem mudou o quê, quando, de que valor para qual". Não tem rota de
 * exclusão — nem para ADMIN (`docs/permissions.md`, seção 6).
 */

type EntityType = (typeof auditLogs.$inferInsert)['entityType']
type AuditAction = (typeof auditLogs.$inferInsert)['action']

export type FieldChanges = Record<string, { from: unknown; to: unknown }>

export interface RecordAuditInput {
  actor: Pick<AuthContext['user'], 'id' | 'email'> | null
  action: AuditAction
  entityType: EntityType
  entityId?: string | null
  entityLabel?: string | null
  changes?: FieldChanges | null
  ipAddress?: string | null
  userAgent?: string | null
}

export async function recordAudit(input: RecordAuditInput, tx: Database = db): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId: input.actor?.id ?? null,
    // O e-mail é copiado para o log continuar legível se o usuário for excluído.
    actorEmail: input.actor?.email ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    entityLabel: input.entityLabel ?? null,
    changes: input.changes ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  })
}

/**
 * Compara dois estados e devolve só o que realmente mudou.
 *
 * Registrar o objeto inteiro a cada alteração transformaria a auditoria em
 * ruído: a pergunta que ela responde é "o que mudou", não "como estava tudo".
 *
 * `fields` limita explicitamente o que é auditável — impede que um
 * `password_hash` ou um campo interno vaze para o log por descuido.
 */
export function diffChanges<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): FieldChanges | null {
  const changes: FieldChanges = {}

  for (const field of fields) {
    if (!(field in after)) continue

    const from = before?.[field]
    const to = after[field]
    if (isEqual(from, to)) continue

    changes[field] = { from: normalize(from), to: normalize(to) }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined) return null
  return value
}

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/

function isNumericLike(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && NUMERIC_TEXT.test(value.trim())
}

function toTimestamp(value: unknown): number | null {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false

  if (a instanceof Date || b instanceof Date) {
    const left = toTimestamp(a)
    const right = toTimestamp(b)
    return left !== null && right !== null && left === right
  }

  // Colunas `numeric` voltam do Postgres como string. Sem esta comparação
  // numérica, trocar 1000 por "1000.00" apareceria na auditoria como mudança.
  if (isNumericLike(a) && isNumericLike(b)) return Number(a) === Number(b)

  return false
}
