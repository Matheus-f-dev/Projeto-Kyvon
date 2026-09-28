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
import { createClientAction, updateClientAction } from '@/server/modules/clients/actions'
import { clientStatusValues, type ClientInput } from '@/shared/schemas/clients'
import { CLIENT_STATUS } from '@/shared/domain'

export interface ClientFormOptions {
  owners: { id: string; name: string }[]
  sources: { id: string; name: string }[]
}

export interface ClientFormDefaults extends Partial<ClientInput> {
  id?: string
}

interface ClientFormDialogProps {
  options: ClientFormOptions
  defaultValues?: ClientFormDefaults
  trigger?: ReactNode
  defaultOpen?: boolean
}

/**
 * Diálogo de criar/editar cliente.
 *
 * Um só componente para as duas ações: a presença de `defaultValues.id`
 * decide qual Server Action é chamada. Evita duas cópias quase idênticas do
 * mesmo formulário divergindo ao longo do tempo.
 */
export function ClientFormDialog({
  options,
  defaultValues,
  trigger,
  defaultOpen = false,
}: ClientFormDialogProps) {
  const isEdit = Boolean(defaultValues?.id)
  const [open, setOpen] = useState(defaultOpen)
  const [state, formAction] = useUpsertFormAction(
    isEdit ? updateClientAction.bind(null, defaultValues!.id!) : createClientAction,
    open,
    setOpen,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<Plus />}>
            Novo cliente
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="lg">
        <DialogHeader
          title={isEdit ? 'Editar cliente' : 'Novo cliente'}
          description="Dados cadastrais e comerciais do cliente."
        />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Razão social"
                required
                error={state.fieldErrors?.name?.[0]}
                className="sm:col-span-2"
              >
                {(props) => (
                  <Input {...props} name="name" defaultValue={defaultValues?.name} required />
                )}
              </Field>

              <Field label="Nome fantasia" error={state.fieldErrors?.tradeName?.[0]}>
                {(props) => (
                  <Input {...props} name="tradeName" defaultValue={defaultValues?.tradeName} />
                )}
              </Field>

              <Field label="CNPJ / CPF" error={state.fieldErrors?.document?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="document"
                    defaultValue={defaultValues?.document}
                    placeholder="Somente números"
                  />
                )}
              </Field>

              <Field label="E-mail" error={state.fieldErrors?.email?.[0]}>
                {(props) => (
                  <Input {...props} name="email" type="email" defaultValue={defaultValues?.email} />
                )}
              </Field>

              <Field label="Telefone" error={state.fieldErrors?.phone?.[0]}>
                {(props) => <Input {...props} name="phone" defaultValue={defaultValues?.phone} />}
              </Field>

              <Field label="Site" error={state.fieldErrors?.website?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="website"
                    defaultValue={defaultValues?.website}
                    placeholder="https://"
                  />
                )}
              </Field>

              <Field label="Segmento" error={state.fieldErrors?.segment?.[0]}>
                {(props) => (
                  <Input {...props} name="segment" defaultValue={defaultValues?.segment} />
                )}
              </Field>

              <Field label="Cidade" error={state.fieldErrors?.addressCity?.[0]}>
                {(props) => (
                  <Input {...props} name="addressCity" defaultValue={defaultValues?.addressCity} />
                )}
              </Field>

              <Field label="UF" error={state.fieldErrors?.addressState?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="addressState"
                    maxLength={2}
                    defaultValue={defaultValues?.addressState}
                  />
                )}
              </Field>

              <Field label="Status" error={state.fieldErrors?.status?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="status"
                    defaultValue={defaultValues?.status ?? 'prospect'}
                  >
                    {clientStatusValues.map((value) => (
                      <option key={value} value={value}>
                        {CLIENT_STATUS[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Origem" error={state.fieldErrors?.sourceId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="sourceId"
                    defaultValue={defaultValues?.sourceId ?? ''}
                  >
                    <option value="">Não informada</option>
                    {options.sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Responsável" error={state.fieldErrors?.ownerId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="ownerId"
                    defaultValue={defaultValues?.ownerId ?? ''}
                  >
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

            <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
              {(props) => (
                <Textarea {...props} name="notes" defaultValue={defaultValues?.notes} rows={3} />
              )}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
