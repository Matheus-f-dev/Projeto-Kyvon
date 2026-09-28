import type { AuthContext } from '@/server/auth/context'
import {
  getApprovalDetail,
  listApproverContacts,
  listProjectTaskOptions,
} from '@/server/modules/approvals/queries'
import { isInvolvedInProject } from '@/server/modules/tasks/service'
import { listUsersWithPermission } from '@/server/modules/users/queries'

import { ApprovalDrawer, MissingApprovalDrawer } from './approval-drawer'

/**
 * Carrega e renderiza o drawer de aprovação no servidor — usado por toda
 * página que aceita `?aprovacao=`. As permissões seguem as mesmas regras que
 * as actions impõem (`approvals/actions.ts`).
 */
export async function ApprovalDrawerLoader({
  context,
  approvalId,
}: {
  context: AuthContext
  approvalId: string
}) {
  const approval = await getApprovalDetail(context, approvalId)
  if (!approval) return <MissingApprovalDrawer />

  const canWriteBase = context.can('approvals.write')
  const [involved, approvers, contacts, tasks] = await Promise.all([
    canWriteBase && !context.can('projects.delete')
      ? isInvolvedInProject(approval.project.id, context.user.id)
      : Promise.resolve(true),
    canWriteBase ? listUsersWithPermission('approvals.decide') : Promise.resolve([]),
    canWriteBase ? listApproverContacts(approval.client.id) : Promise.resolve([]),
    canWriteBase ? listProjectTaskOptions(approval.project.id) : Promise.resolve([]),
  ])

  // O aprovador atual continua como opção mesmo se perdeu a permissão ou a
  // autorização — senão salvar qualquer campo o trocaria sem ninguém pedir.
  // O servidor recusa manter um aprovador inválido, com mensagem clara.
  const current = approval.approverUser
  const approverOptions =
    current && !approvers.some((user) => user.id === current.id)
      ? [...approvers, { id: current.id, name: `${current.name} (sem permissão para aprovar)` }]
      : approvers
  const contact = approval.approverContact
  const contactOptions =
    contact && !contacts.some((item) => item.id === contact.id)
      ? [
          ...contacts,
          { id: contact.id, name: `${contact.name} (não autorizado)`, jobTitle: contact.jobTitle },
        ]
      : contacts

  return (
    <ApprovalDrawer
      approval={approval}
      approvers={approverOptions}
      options={{ tasks, contacts: contactOptions }}
      currentUserId={context.user.id}
      permissions={{
        canWrite: canWriteBase && involved,
        canDecide: context.can('approvals.decide'),
      }}
    />
  )
}
