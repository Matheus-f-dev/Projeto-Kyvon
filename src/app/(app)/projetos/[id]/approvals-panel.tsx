import { Plus, ShieldCheck } from 'lucide-react'

import { ApprovalFormDialog } from '@/components/approvals/approval-form-dialog'
import { ApprovalLink } from '@/components/approvals/approval-link'
import { Button } from '@/components/ui/button'
import { EntityCode } from '@/components/ui/misc'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { formatDeadline, isOverdue } from '@/lib/format'
import {
  listApproverContacts,
  listProjectApprovals,
  listProjectTaskOptions,
} from '@/server/modules/approvals/queries'
import { listUsersWithPermission } from '@/server/modules/users/queries'
import { APPROVAL_STATUS } from '@/shared/domain'

/**
 * Aprovações do projeto, em aberto primeiro.
 *
 * É daqui que se pede aprovação de um material: o projeto já está definido,
 * então o formulário só pergunta o que é e quem decide.
 */
export async function ProjectApprovalsPanel({
  projectId,
  clientId,
  canRequest,
  defaultOpen,
}: {
  projectId: string
  clientId: string
  canRequest: boolean
  defaultOpen: boolean
}) {
  const [items, approvers, contacts, tasks] = await Promise.all([
    listProjectApprovals(projectId),
    canRequest ? listUsersWithPermission('approvals.decide') : Promise.resolve([]),
    canRequest ? listApproverContacts(clientId) : Promise.resolve([]),
    canRequest ? listProjectTaskOptions(projectId) : Promise.resolve([]),
  ])

  const open = items.filter(
    (item) => item.status === 'pending' || item.status === 'changes_requested',
  ).length

  return (
    <Panel>
      <PanelHeader
        title="Aprovações"
        description={
          items.length === 0 ? undefined : open > 0 ? `${open} em aberto` : 'Todas resolvidas'
        }
        actions={
          canRequest ? (
            <ApprovalFormDialog
              projectId={projectId}
              approvers={approvers}
              options={{ tasks, contacts }}
              defaultOpen={defaultOpen}
              trigger={
                <Button variant="ghost" size="sm" icon={<Plus />}>
                  Pedir
                </Button>
              }
            />
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState compact icon={<ShieldCheck />} title="Nenhuma aprovação pedida" />
      ) : (
        <ul className="divide-y divide-[var(--line-subtle)]">
          {items.map((item) => {
            const pending = item.status === 'pending' || item.status === 'changes_requested'
            return (
              <li key={item.id}>
                <ApprovalLink
                  approvalId={item.id}
                  className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-strong truncate text-sm font-medium">{item.title}</span>
                    <span className="text-2xs text-muted flex items-center gap-1.5 truncate">
                      <EntityCode code={item.code} /> v{item.currentVersion}
                      {item.approverName && <> · {item.approverName}</>}
                      {pending && item.dueDate && (
                        <span
                          className={cn(isOverdue(item.dueDate) && 'text-danger-text font-medium')}
                        >
                          · {formatDeadline(item.dueDate)}
                        </span>
                      )}
                    </span>
                  </div>
                  <StatusBadge map={APPROVAL_STATUS} value={item.status} />
                </ApprovalLink>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
