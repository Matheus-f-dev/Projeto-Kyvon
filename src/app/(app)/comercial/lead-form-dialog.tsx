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
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import { createLeadAction } from '@/server/modules/crm/actions'

export interface LeadFormOptions {
  owners: { id: string; name: string }[]
  sources: { id: string; name: string }[]
  serviceTypes: { id: string; name: string }[]
}

export function LeadFormDialog({
  options,
  trigger,
  defaultOpen = false,
}: {
  options: LeadFormOptions
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [state, formAction] = useUpsertFormAction(createLeadAction, open, setOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="md" icon={<Plus />}>
            Novo lead
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="md">
        <DialogHeader title="Novo lead" description="Contato ainda não qualificado." />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" required error={state.fieldErrors?.name?.[0]}>
                {(props) => <Input {...props} name="name" required />}
              </Field>
              <Field label="Empresa" error={state.fieldErrors?.companyName?.[0]}>
                {(props) => <Input {...props} name="companyName" />}
              </Field>
              <Field label="E-mail" error={state.fieldErrors?.email?.[0]}>
                {(props) => <Input {...props} name="email" type="email" />}
              </Field>
              <Field label="Telefone" error={state.fieldErrors?.phone?.[0]}>
                {(props) => <Input {...props} name="phone" />}
              </Field>
              <Field label="Origem" error={state.fieldErrors?.sourceId?.[0]}>
                {(props) => (
                  <NativeSelect {...props} name="sourceId" defaultValue="">
                    <option value="">Não informada</option>
                    {options.sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Serviço de interesse" error={state.fieldErrors?.serviceTypeId?.[0]}>
                {(props) => (
                  <NativeSelect {...props} name="serviceTypeId" defaultValue="">
                    <option value="">Não informado</option>
                    {options.serviceTypes.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field
                label="Responsável"
                error={state.fieldErrors?.ownerId?.[0]}
                className="sm:col-span-2"
              >
                {(props) => (
                  <NativeSelect {...props} name="ownerId" defaultValue="">
                    <option value="">Eu mesmo</option>
                    {options.owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>

            <Field label="Mensagem / observações" error={state.fieldErrors?.message?.[0]}>
              {(props) => <Textarea {...props} name="message" rows={3} />}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Cadastrar lead</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
