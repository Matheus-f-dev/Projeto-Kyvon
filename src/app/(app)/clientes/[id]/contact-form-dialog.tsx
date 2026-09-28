'use client'

import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'

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
import { CheckboxField } from '@/components/ui/toggle'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import { createContactAction, updateContactAction } from '@/server/modules/clients/actions'
import type { ContactInput } from '@/shared/schemas/clients'

interface ContactFormDialogProps {
  clientId: string
  defaultValues?: Partial<ContactInput> & { id?: string }
  trigger?: ReactNode
}

export function ContactFormDialog({ clientId, defaultValues, trigger }: ContactFormDialogProps) {
  const isEdit = Boolean(defaultValues?.id)
  const [open, setOpen] = useState(false)
  const [state, formAction] = useUpsertFormAction(
    isEdit ? updateContactAction.bind(null, defaultValues!.id!) : createContactAction,
    open,
    setOpen,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="sm" icon={<Plus />}>
            Contato
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="sm">
        <DialogHeader title={isEdit ? 'Editar contato' : 'Novo contato'} />
        <form action={formAction} className="contents">
          <input type="hidden" name="clientId" value={clientId} />

          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <Field label="Nome" required error={state.fieldErrors?.name?.[0]}>
              {(props) => (
                <Input {...props} name="name" defaultValue={defaultValues?.name} required />
              )}
            </Field>

            <Field label="Cargo" error={state.fieldErrors?.jobTitle?.[0]}>
              {(props) => (
                <Input {...props} name="jobTitle" defaultValue={defaultValues?.jobTitle} />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail" error={state.fieldErrors?.email?.[0]}>
                {(props) => (
                  <Input {...props} name="email" type="email" defaultValue={defaultValues?.email} />
                )}
              </Field>
              <Field label="Telefone" error={state.fieldErrors?.phone?.[0]}>
                {(props) => <Input {...props} name="phone" defaultValue={defaultValues?.phone} />}
              </Field>
            </div>

            <div className="flex flex-col gap-2.5">
              <CheckboxField
                name="isPrimary"
                value="true"
                defaultChecked={defaultValues?.isPrimary ?? false}
                label="Contato principal"
                description="Aparece em destaque e vira o padrão de aprovação."
              />
              <CheckboxField
                name="canApprove"
                value="true"
                defaultChecked={defaultValues?.canApprove ?? true}
                label="Pode aprovar materiais"
                description="Fica disponível como aprovador em fluxos de aprovação."
              />
            </div>

            <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
              {(props) => (
                <Textarea {...props} name="notes" rows={2} defaultValue={defaultValues?.notes} />
              )}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar' : 'Adicionar contato'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
