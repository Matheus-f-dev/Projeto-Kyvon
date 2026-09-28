import { z } from 'zod'
import type { NextRequest } from 'next/server'

import { requireAuth } from '@/server/auth/context'
import { handler, jsonOk } from '@/server/http'
import { ValidationError } from '@/server/errors'
import {
  countUnread,
  listNotifications,
  markAllAsRead,
  markAsRead,
} from '@/server/modules/notifications/service'

export const dynamic = 'force-dynamic'

/** Lista as notificações do usuário logado e o total de não lidas. */
export const GET = handler(async (request: NextRequest) => {
  const context = await requireAuth()

  const onlyUnread = request.nextUrl.searchParams.get('unread') === '1'

  const [items, unreadCount] = await Promise.all([
    listNotifications(context.user.id, { onlyUnread, limit: 20 }),
    countUnread(context.user.id),
  ])

  return jsonOk({ items, unreadCount })
})

const markSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
])

/** Marca como lida. O service filtra por usuário — ninguém marca a do outro. */
export const POST = handler(async (request: NextRequest) => {
  const context = await requireAuth()

  const parsed = markSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new ValidationError('Informe "all: true" ou uma lista de ids.')
  }

  if ('all' in parsed.data) {
    await markAllAsRead(context.user.id)
  } else {
    await markAsRead(context.user.id, parsed.data.ids)
  }

  return jsonOk({ unreadCount: await countUnread(context.user.id) })
})
