'use client'

import { X } from 'lucide-react'

import { ReasonButton } from '@/components/ui/confirm-button'
import { discardLeadAction } from '@/server/modules/crm/actions'

export function DiscardLeadButton({ leadId }: { leadId: string }) {
  return (
    <ReasonButton
      label="Descartar"
      icon={<X />}
      title="Descartar lead"
      reasonLabel="Motivo do descarte"
      action={(reason) => {
        const formData = new FormData()
        formData.set('leadId', leadId)
        formData.set('reason', reason)
        return discardLeadAction(formData)
      }}
    />
  )
}
