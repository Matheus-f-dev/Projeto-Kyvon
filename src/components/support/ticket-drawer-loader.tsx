import type { AuthContext } from '@/server/auth/context'
import { getTicketDetail, listTicketClientOptions } from '@/server/modules/support/queries'
import { listUsersWithPermission } from '@/server/modules/users/queries'

import { MissingTicketDrawer, TicketDrawer } from './ticket-drawer'

/** Carrega o drawer de chamado (`?chamado=`) com as permissões das actions de suporte. */
export async function TicketDrawerLoader({
  context,
  ticketId,
}: {
  context: AuthContext
  ticketId: string
}) {
  const ticket = await getTicketDetail(context, ticketId)
  if (!ticket) return <MissingTicketDrawer />

  const canWrite = context.can('support.write')
  const [agents, options] = await Promise.all([
    canWrite ? listUsersWithPermission('support.write') : Promise.resolve([]),
    canWrite
      ? listTicketClientOptions(ticket.client.id)
      : Promise.resolve({ projects: [], contacts: [] }),
  ])

  // O responsável atual continua como opção mesmo se deixou de atender.
  const current = ticket.assignee
  const agentOptions =
    current && !agents.some((agent) => agent.id === current.id)
      ? [...agents, { id: current.id, name: `${current.name} (não atende mais)` }]
      : agents

  return (
    <TicketDrawer
      ticket={ticket}
      agents={agentOptions}
      options={options}
      currentUserId={context.user.id}
      permissions={{ canWrite, canAssign: context.can('support.assign') }}
    />
  )
}
