'use client'

import { Lock, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import { createContractAction, updateContractAction } from '@/server/modules/contracts/actions'
import { PAYMENT_METHOD } from '@/shared/domain'
import { paymentMethodValues, type ContractInput } from '@/shared/schemas/contracts'

export interface ContractFormDefaults extends Partial<ContractInput> {
  id?: string
  /** Escopo e valor ficam só-leitura: o contrato já foi ativado (regra 8). */
  scopeLocked?: boolean
}

/**
 * Criar ou editar contrato.
 *
 * Com o contrato ativo, escopo, entregáveis e valor aparecem **só-leitura** —
 * não desabilitados. Campo desabilitado não entra no `FormData`; o servidor
 * interpretaria a ausência como "apagar o escopo" e recusaria a edição
 * inteira. Só-leitura envia o valor intacto, e o service confirma que nada
 * mudou.
 */
export function ContractFormDialog({
  owners,
  defaultValues,
  trigger,
  defaultOpen = false,
  canSeeValues,
}: {
  owners: { id: string; name: string }[]
  defaultValues?: ContractFormDefaults
  trigger?: ReactNode
  defaultOpen?: boolean
  canSeeValues: boolean
}) {
  const isEdit = Boolean(defaultValues?.id)
  const locked = Boolean(defaultValues?.scopeLocked)
  const [open, setOpen] = useState(defaultOpen)

  // Na criação, a própria action redireciona para o contrato novo.
  const [state, formAction] = useUpsertFormAction(
    isEdit ? updateContractAction.bind(null, defaultValues!.id!) : createContractAction,
    open,
    setOpen,
  )

  const lockedClass = locked ? 'bg-hover text-muted cursor-not-allowed' : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<Plus />}>
            Novo contrato
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="lg">
        <DialogHeader
          title={isEdit ? 'Editar contrato' : 'Novo contrato'}
          description={
            isEdit
              ? undefined
              : 'Contratos que nascem de uma oportunidade ganha são criados pelo Comercial — use isto só para contratos sem origem no pipeline.'
          }
        />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-5">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <FieldGroup>
              <Field label="Título" required error={state.fieldErrors?.title?.[0]}>
                {(props) => (
                  <Input {...props} name="title" defaultValue={defaultValues?.title} required />
                )}
              </Field>

              {!isEdit && (
                <Field label="Cliente" required error={state.fieldErrors?.clientId?.[0]}>
                  {() => (
                    <Combobox
                      name="clientId"
                      endpoint="/api/clients/options"
                      placeholder="Buscar cliente…"
                      required
                    />
                  )}
                </Field>
              )}
            </FieldGroup>

            <FieldGroup
              title="Escopo contratado"
              description={
                locked ? undefined : 'Depois de ativado, escopo e valor só mudam por aditivo.'
              }
            >
              {locked && (
                <p className="bg-neutral-soft text-muted flex items-center gap-1.5 rounded-md px-3 py-2 text-xs">
                  <Lock className="size-3.5 shrink-0" />
                  Contrato ativo: escopo, entregáveis e valor são imutáveis. Registre a mudança como
                  aditivo.
                </p>
              )}
              <Field label="Escopo" error={state.fieldErrors?.scope?.[0]}>
                {(props) => (
                  <Textarea
                    {...props}
                    name="scope"
                    rows={4}
                    defaultValue={defaultValues?.scope}
                    readOnly={locked}
                    className={lockedClass}
                  />
                )}
              </Field>
              <Field label="Entregáveis" error={state.fieldErrors?.deliverables?.[0]}>
                {(props) => (
                  <Textarea
                    {...props}
                    name="deliverables"
                    rows={2}
                    defaultValue={defaultValues?.deliverables}
                    readOnly={locked}
                    className={lockedClass}
                  />
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Responsabilidades" error={state.fieldErrors?.responsibilities?.[0]}>
                  {(props) => (
                    <Textarea
                      {...props}
                      name="responsibilities"
                      rows={2}
                      defaultValue={defaultValues?.responsibilities}
                    />
                  )}
                </Field>
                <Field label="Fora do escopo" error={state.fieldErrors?.exclusions?.[0]}>
                  {(props) => (
                    <Textarea
                      {...props}
                      name="exclusions"
                      rows={2}
                      defaultValue={defaultValues?.exclusions}
                    />
                  )}
                </Field>
              </div>
            </FieldGroup>

            {canSeeValues && (
              <FieldGroup title="Financeiro">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Valor total (R$)" error={state.fieldErrors?.totalValue?.[0]}>
                    {(props) => (
                      <Input
                        {...props}
                        name="totalValue"
                        inputMode="decimal"
                        placeholder="0,00"
                        defaultValue={defaultValues?.totalValue}
                        readOnly={locked}
                        className={lockedClass}
                      />
                    )}
                  </Field>
                  <Field label="Forma de pagamento" error={state.fieldErrors?.paymentMethod?.[0]}>
                    {(props) => (
                      <NativeSelect
                        {...props}
                        name="paymentMethod"
                        defaultValue={defaultValues?.paymentMethod ?? ''}
                      >
                        <option value="">Não definida</option>
                        {paymentMethodValues.map((value) => (
                          <option key={value} value={value}>
                            {PAYMENT_METHOD[value].label}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </Field>
                  <Field label="Parcelas" error={state.fieldErrors?.installments?.[0]}>
                    {(props) => (
                      <Input
                        {...props}
                        name="installments"
                        type="number"
                        min={1}
                        max={60}
                        defaultValue={defaultValues?.installments}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Condições de pagamento" error={state.fieldErrors?.paymentTerms?.[0]}>
                  {(props) => (
                    <Textarea
                      {...props}
                      name="paymentTerms"
                      rows={2}
                      defaultValue={defaultValues?.paymentTerms}
                    />
                  )}
                </Field>
              </FieldGroup>
            )}

            <FieldGroup title="Vigência e suporte">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Início" error={state.fieldErrors?.startDate?.[0]}>
                  {(props) => (
                    <Input
                      {...props}
                      name="startDate"
                      type="date"
                      defaultValue={defaultValues?.startDate}
                    />
                  )}
                </Field>
                <Field label="Término" error={state.fieldErrors?.endDate?.[0]}>
                  {(props) => (
                    <Input
                      {...props}
                      name="endDate"
                      type="date"
                      defaultValue={defaultValues?.endDate}
                    />
                  )}
                </Field>
                <Field label="Revisões incluídas" error={state.fieldErrors?.revisionsIncluded?.[0]}>
                  {(props) => (
                    <Input
                      {...props}
                      name="revisionsIncluded"
                      type="number"
                      min={0}
                      defaultValue={defaultValues?.revisionsIncluded}
                    />
                  )}
                </Field>
                <Field
                  label="Dias de suporte"
                  hint="Começa a contar no lançamento do projeto."
                  error={state.fieldErrors?.supportDays?.[0]}
                >
                  {(props) => (
                    <Input
                      {...props}
                      name="supportDays"
                      type="number"
                      min={0}
                      defaultValue={defaultValues?.supportDays}
                    />
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
                      {owners.map((owner) => (
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
                  <Textarea {...props} name="notes" rows={2} defaultValue={defaultValues?.notes} />
                )}
              </Field>
            </FieldGroup>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar alterações' : 'Criar contrato'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
