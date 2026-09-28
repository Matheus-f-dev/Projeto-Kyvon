'use client'

import { ConfirmButton } from '@/components/ui/confirm-button'
import { activateAddendumAction } from '@/server/modules/contracts/actions'

export function ActivateAddendumButton({
  addendumId,
  contractId,
}: {
  addendumId: string
  contractId: string
}) {
  return (
    <ConfirmButton
      label="Ativar"
      title="Ativar aditivo"
      description="O aditivo passa a valer: novo prazo, valor e dias de suporte são aplicados ao contrato. Não é possível desfazer."
      confirmLabel="Ativar aditivo"
      action={() => activateAddendumAction(addendumId, contractId)}
    />
  )
}
