'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input, Textarea } from '@/components/ui/input'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import { createProposalAction } from '@/server/modules/crm/actions'

/**
 * Nova versão de proposta.
 *
 * Não existe "editar proposta": cada envio é uma versão nova (regra 7 do
 * produto, aplicada aqui também às propostas). O histórico de versões
 * anteriores nunca é tocado.
 */
export function ProposalFormDialog({ opportunityId }: { opportunityId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useUpsertFormAction(createProposalAction, open, setOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" icon={<Plus />}>
          Nova versão
        </Button>
      </DialogTrigger>

      <DialogContent size="lg">
        <DialogHeader title="Nova versão de proposta" />
        <form action={formAction} className="contents">
          <input type="hidden" name="opportunityId" value={opportunityId} />

          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <Field label="Título" required error={state.fieldErrors?.title?.[0]}>
              {(props) => <Input {...props} name="title" required />}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor total (R$)" error={state.fieldErrors?.totalValue?.[0]}>
                {(props) => (
                  <Input {...props} name="totalValue" inputMode="decimal" placeholder="0,00" />
                )}
              </Field>
              <Field
                label="Duração estimada (dias)"
                error={state.fieldErrors?.estimatedDurationDays?.[0]}
              >
                {(props) => <Input {...props} name="estimatedDurationDays" type="number" min={1} />}
              </Field>
              <Field label="Válida até" error={state.fieldErrors?.validUntil?.[0]}>
                {(props) => <Input {...props} name="validUntil" type="date" />}
              </Field>
            </div>

            <Field label="Escopo" error={state.fieldErrors?.scope?.[0]}>
              {(props) => <Textarea {...props} name="scope" rows={4} />}
            </Field>
            <Field label="Entregáveis" error={state.fieldErrors?.deliverables?.[0]}>
              {(props) => <Textarea {...props} name="deliverables" rows={2} />}
            </Field>
            <Field label="Condições de pagamento" error={state.fieldErrors?.paymentTerms?.[0]}>
              {(props) => <Textarea {...props} name="paymentTerms" rows={2} />}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Criar proposta</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
