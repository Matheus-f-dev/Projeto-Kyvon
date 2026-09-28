'use client'

import { Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
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
import { createOpportunityAction, updateOpportunityAction } from '@/server/modules/crm/actions'
import type { OpportunityInput } from '@/shared/schemas/crm'

export interface OpportunityFormOptions {
  owners: { id: string; name: string }[]
  sources: { id: string; name: string }[]
  serviceTypes: { id: string; name: string }[]
}

export interface OpportunityFormDefaults extends Partial<OpportunityInput> {
  id?: string
  clientLabel?: string
  clientCode?: string
}

/**
 * Diálogo de criar/editar oportunidade.
 *
 * O cliente é selecionado por um combobox pesquisável (não um `<select>`
 * carregado com todos os clientes) e, assim que escolhido, busca os contatos
 * daquele cliente para o segundo seletor — sem exigir round-trip de página.
 */
export function OpportunityFormDialog({
  options,
  defaultValues,
  lockClient = false,
  trigger,
  defaultOpen = false,
}: {
  options: OpportunityFormOptions
  defaultValues?: OpportunityFormDefaults
  /** Trava o cliente quando o diálogo é aberto a partir da página do próprio cliente. */
  lockClient?: boolean
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const isEdit = Boolean(defaultValues?.id)
  const [open, setOpen] = useState(defaultOpen)
  const [state, formAction] = useUpsertFormAction(
    isEdit ? updateOpportunityAction.bind(null, defaultValues!.id!) : createOpportunityAction,
    open,
    setOpen,
  )

  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([])
  const [selectedClientId, setSelectedClientId] = useState(defaultValues?.clientId ?? '')
  const latestRequestRef = useRef(0)

  /**
   * Busca os contatos do cliente selecionado.
   *
   * O contador em `latestRequestRef` garante que só a resposta mais recente
   * decida o estado: sem ele, trocar de cliente rapidamente poderia deixar a
   * lista de um cliente anterior sobrescrever a do atual, se a resposta mais
   * antiga chegar depois. Nenhum `setState` roda de forma síncrona no início
   * da função — só depois de um `await` — evitando a renderização em cascata
   * que a regra `react-hooks/set-state-in-effect` sinaliza.
   */
  const loadContacts = useCallback(async (clientId: string) => {
    const requestId = ++latestRequestRef.current

    // Sempre passa por um `await`, mesmo sem cliente selecionado: nenhuma
    // chamada a `setContacts` fica alcançável de forma síncrona a partir do
    // efeito que dispara esta função — é o que a regra
    // `react-hooks/set-state-in-effect` exige.
    const payload = await (clientId
      ? fetch(`/api/clients/${clientId}/contacts`)
          .then((response) => (response.ok ? response.json() : { contacts: [] }))
          .catch(() => ({ contacts: [] }))
      : Promise.resolve({ contacts: [] as { id: string; name: string }[] }))

    if (latestRequestRef.current === requestId) {
      setContacts((payload as { contacts: { id: string; name: string }[] }).contacts)
    }
  }, [])

  // Recarrega os contatos disponíveis sempre que o cliente selecionado muda —
  // um evento de UI (escolha do usuário), não sincronização contínua de estado.
  useEffect(() => {
    void loadContacts(selectedClientId)
  }, [selectedClientId, loadContacts])

  const defaultClientOption: ComboboxOption | undefined =
    defaultValues?.clientId && defaultValues.clientLabel
      ? {
          id: defaultValues.clientId,
          label: defaultValues.clientLabel,
          sublabel: defaultValues.clientCode,
        }
      : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<Plus />}>
            Nova oportunidade
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="lg">
        <DialogHeader
          title={isEdit ? 'Editar oportunidade' : 'Nova oportunidade'}
          description="Negociação específica com um cliente."
        />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <Field label="Título" required error={state.fieldErrors?.title?.[0]}>
              {(props) => (
                <Input {...props} name="title" defaultValue={defaultValues?.title} required />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cliente" required error={state.fieldErrors?.clientId?.[0]}>
                {() => (
                  <Combobox
                    name="clientId"
                    endpoint="/api/clients/options"
                    placeholder="Buscar cliente…"
                    defaultValue={defaultClientOption}
                    required
                    disabled={lockClient}
                    onSelect={(option) => setSelectedClientId(option?.id ?? '')}
                  />
                )}
              </Field>

              <Field label="Contato" error={state.fieldErrors?.contactId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="contactId"
                    defaultValue={defaultValues?.contactId ?? ''}
                    disabled={contacts.length === 0}
                  >
                    <option value="">
                      {contacts.length === 0 ? 'Selecione um cliente primeiro' : 'Não informado'}
                    </option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Serviço" error={state.fieldErrors?.serviceTypeId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="serviceTypeId"
                    defaultValue={defaultValues?.serviceTypeId ?? ''}
                  >
                    <option value="">Não informado</option>
                    {options.serviceTypes.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Valor estimado (R$)" error={state.fieldErrors?.estimatedValue?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="estimatedValue"
                    inputMode="decimal"
                    defaultValue={defaultValues?.estimatedValue}
                    placeholder="0,00"
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
                    {options.owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Probabilidade (%)" error={state.fieldErrors?.probability?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="probability"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={defaultValues?.probability}
                  />
                )}
              </Field>

              <Field label="Próxima ação" error={state.fieldErrors?.nextAction?.[0]}>
                {(props) => (
                  <Input {...props} name="nextAction" defaultValue={defaultValues?.nextAction} />
                )}
              </Field>

              <Field label="Data da próxima ação" error={state.fieldErrors?.nextActionAt?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="nextActionAt"
                    type="date"
                    defaultValue={defaultValues?.nextActionAt}
                  />
                )}
              </Field>
            </div>

            <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  rows={3}
                  defaultValue={defaultValues?.description}
                />
              )}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar alterações' : 'Criar oportunidade'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
