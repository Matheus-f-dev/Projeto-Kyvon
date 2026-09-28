import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

import { ApprovalDrawerLoader } from '@/components/approvals/approval-drawer-loader'
import { ApprovalFormDialog } from '@/components/approvals/approval-form-dialog'
import { ApprovalLink } from '@/components/approvals/approval-link'
import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { EntityCode } from '@/components/ui/misc'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { formatDeadline, formatRelative, isOverdue } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { countApprovalShortcuts, listApprovals } from '@/server/modules/approvals/queries'
import { listOpenProjectOptions } from '@/server/modules/projects/queries'
import { listUsersWithPermission } from '@/server/modules/users/queries'
import { APPROVAL_STATUS } from '@/shared/domain'
import { approvalListFilterSchema, approvalStatusValues } from '@/shared/schemas/approvals'

export const metadata: Metadata = { title: 'Aprovações' }
export const dynamic = 'force-dynamic'

/**
 * Aprovações.
 *
 * Responde "o que está parado esperando validação?". Abre em "Em aberto" —
 * aguardando decisão ou aguardando a nova versão da equipe —, porque é o que
 * pede ação; o histórico completo fica em "Todas".
 */
export default async function AprovacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  if (!context.can('approvals.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="approvals.read" />
      </PageContainer>
    )
  }

  const parsed = approvalListFilterSchema.safeParse(params)
  const filter = parsed.success ? parsed.data : {}
  const canCreate = context.can('approvals.write')
  const canDecide = context.can('approvals.decide')

  const [result, shortcuts, projects, approvers] = await Promise.all([
    listApprovals(context, filter),
    countApprovalShortcuts(context),
    canCreate
      ? listOpenProjectOptions({
          involvedUserId: context.can('projects.delete') ? undefined : context.user.id,
        })
      : Promise.resolve([]),
    canCreate ? listUsersWithPermission('approvals.decide') : Promise.resolve([]),
  ])

  const shortcut = filter.status ? undefined : (filter.filtro ?? 'abertas')
  const hasFilters = Boolean(filter.q || filter.status || filter.projectId)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Aprovações"
        description="Materiais aguardando validação — da equipe ou do cliente — com todas as versões preservadas."
        actions={
          canCreate &&
          projects.length > 0 && (
            <ApprovalFormDialog
              projects={projects}
              approvers={approvers}
              defaultOpen={params.nova === '1'}
            />
          )
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/aprovacoes" active={shortcut === 'abertas'} count={shortcuts.open}>
          Em aberto
        </Chip>
        {canDecide && (
          <Chip
            href="/aprovacoes?filtro=minhas"
            active={shortcut === 'minhas'}
            count={shortcuts.mine}
          >
            Aguardando minha decisão
          </Chip>
        )}
        <Chip href="/aprovacoes?filtro=todas" active={shortcut === 'todas'}>
          Todas
        </Chip>
      </div>

      <Panel>
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar por título, código ou projeto…" />
            <ListFilterSelect
              paramKey="status"
              placeholder="Status"
              options={approvalStatusValues.map((value) => ({
                value,
                label: APPROVAL_STATUS[value].label,
              }))}
            />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={filter.q} />
          ) : (
            <EmptyState
              icon={<ShieldCheck />}
              title={
                shortcut === 'minhas'
                  ? 'Nada aguardando sua decisão'
                  : 'Nenhuma aprovação em aberto'
              }
              description="Aprovações são pedidas de dentro do projeto, com o material anexado a cada versão."
            />
          )
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Aprovação</TH>
                    <TH className="hidden lg:table-cell">Projeto</TH>
                    <TH>Quem aprova</TH>
                    <TH>Prazo</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((approval) => {
                    const open =
                      approval.status === 'pending' || approval.status === 'changes_requested'
                    const late = open && isOverdue(approval.dueDate)
                    return (
                      <TR key={approval.id} interactive>
                        <td className="max-w-0 px-3 py-2">
                          <ApprovalLink approvalId={approval.id} className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1.5">
                              <EntityCode code={approval.code} />
                              <span className="text-2xs text-muted font-mono">
                                v{approval.currentVersion}
                              </span>
                            </span>
                            <span className="text-strong truncate font-medium hover:underline">
                              {approval.title}
                            </span>
                            <span className="text-2xs text-subtle truncate">
                              {approval.requesterName ? `${approval.requesterName} · ` : ''}
                              atualizada {formatRelative(approval.updatedAt)}
                            </span>
                          </ApprovalLink>
                        </td>
                        <TD className="hidden lg:table-cell">
                          <Link
                            href={`/projetos/${approval.project.id}`}
                            className="flex flex-col hover:underline"
                          >
                            <span className="text-default truncate text-xs">
                              {approval.project.name}
                            </span>
                            <span className="text-2xs text-subtle truncate">
                              {approval.clientName}
                            </span>
                          </Link>
                        </TD>
                        <TD>
                          <span className="flex flex-col">
                            <span className="truncate text-xs">{approval.approverName ?? '—'}</span>
                            {approval.approverIsClient && (
                              <span className="text-2xs text-subtle">Cliente</span>
                            )}
                          </span>
                        </TD>
                        <TD>
                          <span className={cn('text-xs', late && 'text-danger-text font-medium')}>
                            {open && approval.dueDate ? formatDeadline(approval.dueDate) : '—'}
                          </span>
                        </TD>
                        <TD>
                          <StatusBadge map={APPROVAL_STATUS} value={approval.status} />
                        </TD>
                      </TR>
                    )
                  })}
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

      {params.aprovacao && <ApprovalDrawerLoader context={context} approvalId={params.aprovacao} />}
    </PageContainer>
  )
}

function Chip({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  count?: number
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
        <span className="text-2xs font-semibold" data-tabular>
          {count}
        </span>
      )}
    </Link>
  )
}
