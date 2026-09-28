import { Headphones, Plus } from 'lucide-react'

import { TicketFormDialog } from '@/components/support/ticket-form-dialog'
import { TicketLink } from '@/components/support/ticket-link'
import { Button } from '@/components/ui/button'
import { EntityCode } from '@/components/ui/misc'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { listProjectTickets, listTicketClientOptions } from '@/server/modules/support/queries'
import { listUsersWithPermission } from '@/server/modules/users/queries'
import { OPEN_SUPPORT_STATUSES, SUPPORT_PRIORITY, SUPPORT_STATUS } from '@/shared/domain'

/**
 * Chamados do projeto. Aparece depois do lançamento — quando o suporte começa
 * — ou antes, se já houver chamado: um chamado nunca fica sem aparecer no
 * projeto a que pertence. Abrir daqui já traz o cliente preenchido.
 */
export async function ProjectTicketsPanel({
  projectId,
  client,
  canOpen,
  currentUserId,
  canAssign,
  launched,
}: {
  projectId: string
  client: { id: string; name: string }
  canOpen: boolean
  currentUserId: string
  canAssign: boolean
  launched: boolean
}) {
  const [tickets, agents, options] = await Promise.all([
    listProjectTickets(projectId),
    canOpen ? listUsersWithPermission('support.write') : Promise.resolve([]),
    canOpen ? listTicketClientOptions(client.id) : Promise.resolve(undefined),
  ])
  if (tickets.length === 0 && !launched) return null

  const open = tickets.filter((ticket) => OPEN_SUPPORT_STATUSES.includes(ticket.status)).length

  return (
    <Panel>
      <PanelHeader
        title="Chamados"
        description={
          tickets.length === 0 ? undefined : open > 0 ? `${open} em aberto` : 'Nenhum em aberto'
        }
        actions={
          canOpen && options ? (
            <TicketFormDialog
              client={{ id: client.id, label: client.name }}
              options={options}
              agents={agents}
              currentUserId={currentUserId}
              canAssign={canAssign}
              trigger={
                <Button variant="ghost" size="sm" icon={<Plus />}>
                  Abrir
                </Button>
              }
            />
          ) : undefined
        }
      />
      {tickets.length === 0 ? (
        <EmptyState compact icon={<Headphones />} title="Nenhum chamado" />
      ) : (
        <ul className="divide-y divide-[var(--line-subtle)]">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <TicketLink
                ticketId={ticket.id}
                className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-strong truncate text-sm font-medium">{ticket.title}</span>
                  <span className="text-2xs text-muted flex items-center gap-1.5 truncate">
                    <EntityCode code={ticket.code} /> · {SUPPORT_PRIORITY[ticket.priority].label}
                    {ticket.overdue && (
                      <span className="text-danger-text font-medium">· prazo vencido</span>
                    )}
                    {ticket.assignee && <> · {ticket.assignee.name}</>}
                  </span>
                </div>
                <StatusBadge map={SUPPORT_STATUS} value={ticket.status} />
              </TicketLink>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
