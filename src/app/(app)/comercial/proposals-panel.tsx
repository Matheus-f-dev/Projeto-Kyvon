'use client'

import { Send } from 'lucide-react'

import { ConfirmButton, ReasonButton } from '@/components/ui/confirm-button'
import { EntityCode } from '@/components/ui/misc'
import { EmptyState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  acceptProposalAction,
  rejectProposalAction,
  sendProposalAction,
} from '@/server/modules/crm/actions'
import type { ProposalRow } from '@/server/modules/crm/queries'
import { PROPOSAL_STATUS } from '@/shared/domain'

import { ProposalFormDialog } from './proposal-form-dialog'

export function ProposalsPanel({
  opportunityId,
  proposals,
  canWrite,
}: {
  opportunityId: string
  proposals: ProposalRow[]
  canWrite: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-2xs text-subtle font-semibold tracking-wide uppercase">
          Propostas ({proposals.length})
        </span>
        {canWrite && <ProposalFormDialog opportunityId={opportunityId} />}
      </div>

      {proposals.length === 0 ? (
        <EmptyState
          compact
          title="Nenhuma proposta ainda"
          description="Cada envio cria uma versão nova — a anterior nunca é sobrescrita."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="border-line rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-strong flex items-center gap-1.5 text-sm font-medium">
                    v{proposal.version} · {proposal.title}
                  </span>
                  <span className="text-2xs text-muted flex items-center gap-1.5">
                    <EntityCode code={proposal.code} />
                    {proposal.totalValue !== null && (
                      <span>{formatCurrency(proposal.totalValue)}</span>
                    )}
                    {proposal.validUntil && (
                      <span>válida até {formatDate(proposal.validUntil)}</span>
                    )}
                  </span>
                </div>
                <StatusBadge map={PROPOSAL_STATUS} value={proposal.status} />
              </div>

              {canWrite && proposal.status === 'draft' && (
                <div className="mt-2.5 flex gap-2">
                  <ConfirmButton
                    label="Enviar"
                    icon={<Send />}
                    title="Enviar proposta ao cliente"
                    description="Marca esta versão como enviada e avança a oportunidade."
                    action={() => sendProposalAction(proposal.id)}
                  />
                </div>
              )}

              {canWrite && proposal.status === 'sent' && (
                <div className="mt-2.5 flex gap-2">
                  <ConfirmButton
                    label="Marcar como aceita"
                    variant="secondary"
                    title="Registrar aceite da proposta"
                    action={() => acceptProposalAction(proposal.id)}
                  />
                  <ReasonButton
                    label="Recusar"
                    title="Registrar recusa da proposta"
                    reasonLabel="Motivo da recusa"
                    action={(reason) => {
                      const formData = new FormData()
                      formData.set('proposalId', proposal.id)
                      formData.set('reason', reason)
                      return rejectProposalAction(formData)
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
