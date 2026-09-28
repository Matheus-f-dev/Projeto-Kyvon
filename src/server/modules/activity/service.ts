import { db, type Database } from '@/server/db/client'
import { activities } from '@/server/db/schema'

/**
 * Feed de atividade.
 *
 * Diferente da auditoria: a auditoria é registro de conformidade (valor
 * anterior → novo, imutável, restrito a `audit.read`); o feed é narrativa
 * operacional, escrita para ser lida no dashboard e na página do cliente.
 *
 * `entityLabel` guarda o nome no momento do evento de propósito — assim o feed
 * continua fazendo sentido depois que a entidade é renomeada ou removida.
 */

type ActivityInsert = typeof activities.$inferInsert

export interface RecordActivityInput {
  actorId: string | null
  verb: ActivityInsert['verb']
  entityType: ActivityInsert['entityType']
  entityId: string
  entityLabel: string
  summary: string
  projectId?: string | null
  clientId?: string | null
  metadata?: Record<string, unknown> | null
}

export async function recordActivity(input: RecordActivityInput, tx: Database = db): Promise<void> {
  await tx.insert(activities).values({
    actorId: input.actorId,
    verb: input.verb,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: truncate(input.entityLabel, 200),
    summary: truncate(input.summary, 300),
    projectId: input.projectId ?? null,
    clientId: input.clientId ?? null,
    metadata: input.metadata ?? null,
  })
}

export async function recordActivities(
  inputs: readonly RecordActivityInput[],
  tx: Database = db,
): Promise<void> {
  if (inputs.length === 0) return

  await tx.insert(activities).values(
    inputs.map((input) => ({
      actorId: input.actorId,
      verb: input.verb,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: truncate(input.entityLabel, 200),
      summary: truncate(input.summary, 300),
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? null,
      metadata: input.metadata ?? null,
    })),
  )
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
