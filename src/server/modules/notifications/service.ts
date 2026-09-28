import { and, count, desc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { notifications } from '@/server/db/schema'

/**
 * Notificações.
 *
 * Regra de produto: notificação sem ação é spam. Toda notificação leva a um
 * lugar (`link`) e existe porque alguém precisa **fazer** algo. Por isso o
 * `notify` descarta silenciosamente o caso em que o destinatário é o próprio
 * autor — ninguém precisa ser avisado do que acabou de fazer.
 */

type NotificationInsert = typeof notifications.$inferInsert

export interface NotifyInput {
  userId: string
  type: NotificationInsert['type']
  title: string
  body?: string | null
  actorId?: string | null
  entityType?: NotificationInsert['entityType']
  entityId?: string | null
  link?: string | null
}

export async function notify(input: NotifyInput, tx: Database = db): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return

  await tx.insert(notifications).values(toRow(input))
}

/** Envia para vários destinatários em um único INSERT. */
export async function notifyMany(inputs: readonly NotifyInput[], tx: Database = db): Promise<void> {
  const rows = inputs
    .filter((input) => !(input.actorId && input.actorId === input.userId))
    .map(toRow)

  if (rows.length === 0) return
  await tx.insert(notifications).values(rows)
}

function toRow(input: NotifyInput): NotificationInsert {
  return {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    actorId: input.actorId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
  }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface NotificationListItem {
  id: string
  type: NotificationInsert['type']
  title: string
  body: string | null
  link: string | null
  readAt: Date | null
  createdAt: Date
  actor: { id: string; name: string; avatarUrl: string | null } | null
}

export async function listNotifications(
  userId: string,
  options: { onlyUnread?: boolean; limit?: number } = {},
): Promise<NotificationListItem[]> {
  const limit = Math.min(options.limit ?? 20, 50)

  const rows = await db.query.notifications.findMany({
    where: options.onlyUnread
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit,
    with: { actor: { columns: { id: true, name: true, avatarUrl: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt,
    createdAt: row.createdAt,
    actor: row.actor ?? null,
  }))
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))

  return row?.total ?? 0
}

/** Marca como lida. O `userId` no WHERE impede marcar a notificação de outro. */
export async function markAsRead(userId: string, notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, notificationIds),
        isNull(notifications.readAt),
      ),
    )
}

export async function markAllAsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
}

/** Expurgo de notificações lidas antigas. Chamado por rotina administrativa. */
export async function purgeOldNotifications(olderThanDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

  // Só apaga o que já foi lido: uma notificação nunca lida continua pendente
  // por mais antiga que seja.
  const removed = await db
    .delete(notifications)
    .where(and(lt(notifications.createdAt, cutoff), isNotNull(notifications.readAt)))
    .returning({ id: notifications.id })

  return removed.length
}
