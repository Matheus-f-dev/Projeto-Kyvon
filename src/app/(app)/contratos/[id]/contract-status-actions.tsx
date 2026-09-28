'use client'

import { ConfirmButton, ReasonButton } from '@/components/ui/confirm-button'
import { changeContractStatusAction } from '@/server/modules/contracts/actions'
import {
  CONTRACT_TRANSITION_LABEL,
  CONTRACT_TRANSITIONS,
  type ContractStatus,
} from '@/shared/domain'

const DESCRIPTIONS: Partial<Record<ContractStatus, string>> = {
  awaiting_signature: 'O contrato fica aguardando a assinatura do cliente.',
  active:
    'Sem data de início definida, o contrato começa hoje. Depois de ativo, escopo e valor só mudam por aditivo.',
  suspended: 'O contrato fica pausado até ser reativado.',
  closed: 'Encerra o contrato. O registro permanece no histórico e não pode ser reaberto.',
  draft: 'Volta a ser editável livremente.',
}

/**
 * Botões de transição de status.
 *
 * Mostra só as transições válidas a partir do status atual — a mesma matriz
 * que o service impõe. Cancelar exige motivo; o resto, só confirmação.
 */
export function ContractStatusActions({
  contractId,
  status,
}: {
  contractId: string
  status: ContractStatus
}) {
  const transitions = CONTRACT_TRANSITIONS[status]
  if (transitions.length === 0) return null

  const submit = (next: ContractStatus, cancellationReason?: string) => {
    const formData = new FormData()
    formData.set('contractId', contractId)
    formData.set('status', next)
    if (cancellationReason) formData.set('cancellationReason', cancellationReason)
    return changeContractStatusAction(formData)
  }

  return (
    <>
      {transitions.map((next) =>
        next === 'cancelled' ? (
          <ReasonButton
            key={next}
            label={CONTRACT_TRANSITION_LABEL[next]}
            title="Cancelar contrato"
            description="O contrato não é excluído: fica no histórico como cancelado, com o motivo registrado."
            reasonLabel="Motivo do cancelamento"
            confirmLabel="Cancelar contrato"
            action={(reason) => submit(next, reason)}
          />
        ) : (
          <ConfirmButton
            key={next}
            label={CONTRACT_TRANSITION_LABEL[next]}
            variant={next === 'active' ? 'primary' : 'secondary'}
            title={CONTRACT_TRANSITION_LABEL[next]}
            description={DESCRIPTIONS[next]}
            action={() => submit(next)}
          />
        ),
      )}
    </>
  )
}
