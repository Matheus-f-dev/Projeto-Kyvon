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
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import { createAddendumAction } from '@/server/modules/contracts/actions'
import { ADDENDUM_TYPE } from '@/shared/domain'
import { addendumTypeValues } from '@/shared/schemas/contracts'

type AddendumType = (typeof addendumTypeValues)[number]

/**
 * Novo aditivo.
 *
 * Os campos mudam com o tipo: aditivo de valor pede o delta, de prazo pede a
 * nova data. O aditivo nasce em rascunho e só altera o contrato quando é
 * ativado — até lá é uma proposta de mudança, não uma mudança.
 */
export function AddendumFormDialog({
  contractId,
  canSeeValues,
}: {
  contractId: string
  canSeeValues: boolean
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AddendumType>('scope')
  const [state, formAction] = useUpsertFormAction(createAddendumAction, open, setOpen)

  const availableTypes = addendumTypeValues.filter((value) => value !== 'value' || canSeeValues)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" icon={<Plus />}>
          Aditivo
        </Button>
      </DialogTrigger>

      <DialogContent size="md">
        <DialogHeader
          title="Novo aditivo"
          description="Nasce como rascunho. O contrato só muda quando o aditivo for ativado."
        />
        <form action={formAction} className="contents">
          <input type="hidden" name="contractId" value={contractId} />

          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <Field label="Tipo" required error={state.fieldErrors?.type?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="type"
                    value={type}
                    onChange={(event) => setType(event.target.value as AddendumType)}
                  >
                    {availableTypes.map((value) => (
                      <option key={value} value={value}>
                        {ADDENDUM_TYPE[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Título" required error={state.fieldErrors?.title?.[0]}>
                {(props) => <Input {...props} name="title" required />}
              </Field>
            </div>

            {type === 'value' && (
              <Field
                label="Variação de valor (R$)"
                hint="Use valor negativo para redução. O total do contrato passa a ser base + aditivos ativos."
                error={state.fieldErrors?.valueDelta?.[0]}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="valueDelta"
                    inputMode="decimal"
                    placeholder="0,00"
                    required
                  />
                )}
              </Field>
            )}

            {type === 'deadline' && (
              <Field label="Novo término" required error={state.fieldErrors?.newEndDate?.[0]}>
                {(props) => <Input {...props} name="newEndDate" type="date" required />}
              </Field>
            )}

            <Field
              label="Dias adicionais de suporte"
              hint="Opcional — somados ao período de suporte do contrato."
              error={state.fieldErrors?.additionalSupportDays?.[0]}
            >
              {(props) => <Input {...props} name="additionalSupportDays" type="number" min={0} />}
            </Field>

            <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
              {(props) => <Textarea {...props} name="description" rows={3} />}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Criar aditivo</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
