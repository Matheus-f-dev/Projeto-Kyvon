import type { Metadata } from 'next'
import Link from 'next/link'
import { Headphones } from 'lucide-react'

import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { TicketDrawerLoader } from '@/components/support/ticket-drawer-loader'
import { TicketFormDialog } from '@/components/support/ticket-form-dialog'
import { TicketLink } from '@/components/support/ticket-link'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EntityCode } from '@/components/ui/misc'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { countTicketShortcuts, listTickets, type TicketRow } from '@/server/modules/support/queries'
import { listUsersWithPermission } from '@/server/modules/users/queries'
import {
  OPEN_SUPPORT_STATUSES,
  SUPPORT_CATEGORY,
  SUPPORT_PRIORITY,
  SUPPORT_STATUS,
} from '@/shared/domain'
import {
  supportCategoryValues,
  supportPriorityValues,
  supportStatusValues,
  ticketListFilterSchema,
} from '@/shared/schemas/support'

export const metadata: Metadata = { title: 'Suporte' }
export const dynamic = 'force-dynamic'

/**
 * Suporte.
 *
 * A fila, na ordem em que precisa ser atendida: abertos primeiro, os mais
 * urgentes e com prazo mais próximo no topo. "Atrasados" são os que passaram
 * do prazo de primeira resposta sem ninguém responder.
 */
export default async function SuportePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  if (!context.can('support.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="support.read" />
      </PageContainer>
    )
  }

  const parsed = ticketListFilterSchema.safeParse(params)
  const filter = parsed.success ? parsed.data : {}
  const canWrite = context.can('support.write')

  const [result, shortcuts, agents] = await Promise.all([
    listTickets(context, filter),
    countTicketShortcuts(context),
    canWrite ? listUsersWithPermission('support.write') : Promise.resolve([]),
  ])

  const shortcut = filter.status ? undefined : (filter.filtro ?? 'abertos')
  const hasFilters = Boolean(filter.q || filter.status || filter.priority || filter.category)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Suporte"
        description="Chamados pós-lançamento, com prazo de primeira resposta pela prioridade."
        actions={
          canWrite && (
            <TicketFormDialog
              agents={agents}
              currentUserId={context.user.id}
              canAssign={context.can('support.assign')}
              defaultOpen={params.novo === '1'}
            />
          )
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/suporte" active={shortcut === 'abertos'} count={shortcuts.open}>
          Abertos
        </Chip>
        <Chip href="/suporte?filtro=meus" active={shortcut === 'meus'} count={shortcuts.mine}>
          Meus
        </Chip>
        <Chip
          href="/suporte?filtro=atrasados"
          active={shortcut === 'atrasados'}
          count={shortcuts.overdue}
          danger
        >
          Prazo vencido
        </Chip>
        <Chip href="/suporte?filtro=todos" active={shortcut === 'todos'}>
          Todos
        </Chip>
      </div>

      <Panel>
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar por título, código ou cliente…" />
            <ListFilterSelect
              paramKey="status"
              placeholder="Status"
              options={supportStatusValues.map((value) => ({
                value,
                label: SUPPORT_STATUS[value].label,
              }))}
            />
            <ListFilterSelect
              paramKey="priority"
              placeholder="Prioridade"
              options={supportPriorityValues.map((value) => ({
                value,
                label: SUPPORT_PRIORITY[value].label,
              }))}
            />
            <ListFilterSelect
              paramKey="category"
              placeholder="Categoria"
              options={supportCategoryValues.map((value) => ({
                value,
                label: SUPPORT_CATEGORY[value].label,
              }))}
            />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={filter.q} />
          ) : (
            <EmptyState
              icon={<Headphones />}
              title={
                shortcut === 'atrasados'
                  ? 'Nenhum chamado com prazo vencido'
                  : 'Nenhum chamado em aberto'
              }
              description="Chamados abertos pela equipe a partir do contato do cliente aparecem aqui."
            />
          )
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Chamado</TH>
                    <TH className="hidden lg:table-cell">Cliente</TH>
                    <TH>Prioridade</TH>
                    <TH className="hidden md:table-cell">Responsável</TH>
                    <TH>Prazo</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((ticket) => (
                    <TR key={ticket.id} interactive>
                      <td className="max-w-0 px-3 py-2">
                        <TicketLink ticketId={ticket.id} className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5">
                            <EntityCode code={ticket.code} />
                            <Badge tone={SUPPORT_CATEGORY[ticket.category].tone} size="sm">
                              {SUPPORT_CATEGORY[ticket.category].label}
                            </Badge>
                          </span>
                          <span className="text-strong truncate font-medium hover:underline">
                            {ticket.title}
                          </span>
                        </TicketLink>
                      </td>
                      <TD className="hidden lg:table-cell">
                        <Link
                          href={`/clientes/${ticket.client.id}`}
                          className="flex flex-col hover:underline"
                        >
                          <span className="text-default truncate text-xs">
                            {ticket.client.name}
                          </span>
                          {ticket.project && (
                            <span className="text-2xs text-subtle truncate">
                              {ticket.project.name}
                            </span>
                          )}
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={SUPPORT_PRIORITY[ticket.priority].tone} size="sm">
                          {SUPPORT_PRIORITY[ticket.priority].label}
                        </Badge>
                      </TD>
                      <TD className="hidden md:table-cell">
                        {ticket.assignee ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar name={ticket.assignee.name} size="xs" />
                            <span className="hidden truncate text-xs xl:inline">
                              {ticket.assignee.name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-2xs text-warning-text font-medium">
                            Sem responsável
                          </span>
                        )}
                      </TD>
                      <TD>
                        <SlaCell ticket={ticket} />
                      </TD>
                      <TD>
                        <StatusBadge map={SUPPORT_STATUS} value={ticket.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </Panel>

      {params.chamado && <TicketDrawerLoader context={context} ticketId={params.chamado} />}
    </PageContainer>
  )
}

function SlaCell({ ticket }: { ticket: TicketRow }) {
  const open = OPEN_SUPPORT_STATUSES.includes(ticket.status)
  if (!open || !ticket.dueAt) return <span className="text-subtle text-xs">—</span>
  if (ticket.firstResponseAt) return <span className="text-muted text-xs">Respondido</span>

  const late = ticket.overdue
  return (
    <span className={cn('text-xs', late ? 'text-danger-text font-medium' : 'text-muted')}>
      {late ? 'Vencido ' : 'Responder '}
      {formatRelative(ticket.dueAt)}
    </span>
  )
}

function Chip({
  href,
  active,
  count,
  danger = false,
  children,
}: {
  href: string
  active: boolean
  count?: number
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-brand-border bg-brand-soft text-brand-text'
          : 'border-line text-muted hover:border-line-strong hover:text-strong',
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className={cn('text-2xs font-semibold', danger && 'text-danger-text')} data-tabular>
          {count}
        </span>
      )}
    </Link>
  )
}
