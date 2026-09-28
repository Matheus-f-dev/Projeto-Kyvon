'use client'

import { Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

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
import { idleState, type ActionState } from '@/server/action-state'
import { createTicketAction, updateTicketAction } from '@/server/modules/support/actions'
import type { TicketClientOptions } from '@/server/modules/support/queries'
import { SUPPORT_CATEGORY, SUPPORT_PRIORITY, SUPPORT_SLA_HOURS } from '@/shared/domain'
import { supportCategoryValues, supportPriorityValues } from '@/shared/schemas/support'

export interface TicketFormDefaults {
  id: string
  title: string
  description: string
  projectId: string | null
  requesterContactId: string | null
  category: (typeof supportCategoryValues)[number]
  priority: (typeof supportPriorityValues)[number]
  assigneeId: string | null
}

/**
 * Abrir (ou editar) um chamado.
 *
 * O cliente é escolhido primeiro; projetos e contatos vêm dele. O prazo de
 * atendimento não é digitado — sai da prioridade, e o texto de ajuda mostra
 * quanto é, para ninguém escolher "Crítica" sem saber o que isso promete.
 */
export function TicketFormDialog({
  client: fixedClient,
  options: fixedOptions,
  agents,
  currentUserId,
  canAssign,
  defaultValues,
  trigger,
  defaultOpen = false,
}: {
  /** Cliente fixo (edição, ou abertura a partir do cliente/projeto). */
  client?: ComboboxOption
  options?: TicketClientOptions
  agents: { id: string; name: string }[]
  currentUserId: string
  canAssign: boolean
  defaultValues?: TicketFormDefaults
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEdit = Boolean(defaultValues)

  const [open, setOpen] = useState(defaultOpen)
  const [loaded, setLoaded] = useState<TicketClientOptions | undefined>(fixedOptions)
  const [loading, setLoading] = useState(false)
  const options = fixedOptions ?? loaded

  const selectClient = async (id: string | undefined) => {
    setLoaded(undefined)
    if (!id) return
    setLoading(true)
    try {
      const response = await fetch(`/api/clients/${id}/support-options`)
      if (!response.ok) throw new Error()
      setLoaded((await response.json()) as TicketClientOptions)
    } catch {
      toast.error('Não foi possível carregar projetos e contatos do cliente.')
    } finally {
      setLoading(false)
    }
  }

  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result: ActionState<unknown> = isEdit
        ? await updateTicketAction(defaultValues!.id, previous, formData)
        : await createTicketAction(previous, formData)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Salvo.')
        setOpen(false)
        const created = result.data as { id?: string } | undefined
        if (created?.id) {
          const params = new URLSearchParams(searchParams.toString())
          params.delete('novo')
          params.set('chamado', created.id)
          router.push(`${pathname}?${params.toString()}`, { scroll: false })
        } else {
          router.refresh()
        }
      }
      return result
    },
    idleState as ActionState<unknown>,
  )
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  // Sem `support.assign`, só dá para assumir — mas o responsável atual continua
  // na lista, senão salvar qualquer campo o removeria.
  const assignable = canAssign
    ? agents
    : agents.filter((agent) => agent.id === currentUserId || agent.id === defaultValues?.assigneeId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<Plus />}>
            Novo chamado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader title={isEdit ? 'Editar chamado' : 'Novo chamado'} />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            {!isEdit && (
              <Field label="Cliente" required error={errors?.clientId?.[0]}>
                {() =>
                  fixedClient ? (
                    <>
                      <input type="hidden" name="clientId" value={fixedClient.id} />
                      <Input value={fixedClient.label} disabled readOnly />
                    </>
                  ) : (
                    <Combobox
                      name="clientId"
                      endpoint="/api/clients/options"
                      placeholder="Buscar cliente…"
                      required
                      onSelect={(option) => void selectClient(option?.id)}
                    />
                  )
                }
              </Field>
            )}

            <Field label="Resumo" required error={errors?.title?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  defaultValue={defaultValues?.title}
                  required
                  placeholder="Ex.: Formulário de contato não envia"
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoria" required error={errors?.category?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="category"
                    defaultValue={defaultValues?.category ?? 'bug'}
                  >
                    {supportCategoryValues.map((value) => (
                      <option key={value} value={value}>
                        {SUPPORT_CATEGORY[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Prioridade" error={errors?.priority?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="priority"
                    defaultValue={defaultValues?.priority ?? 'medium'}
                  >
                    {supportPriorityValues.map((value) => (
                      <option key={value} value={value}>
                        {SUPPORT_PRIORITY[value].label} · resposta em {SUPPORT_SLA_HOURS[value]}h
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Projeto" error={errors?.projectId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="projectId"
                    defaultValue={defaultValues?.projectId ?? ''}
                    disabled={!options || loading}
                  >
                    <option value="">{options ? 'Sem projeto' : 'Escolha o cliente'}</option>
                    {options?.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} · {project.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Quem pediu" error={errors?.requesterContactId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="requesterContactId"
                    defaultValue={defaultValues?.requesterContactId ?? ''}
                    disabled={!options || loading}
                  >
                    <option value="">{options ? 'Não informado' : 'Escolha o cliente'}</option>
                    {options?.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                        {contact.jobTitle ? ` · ${contact.jobTitle}` : ''}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field
                label="Responsável"
                hint={
                  canAssign
                    ? undefined
                    : 'Você pode assumir; atribuir a outra pessoa requer permissão.'
                }
                error={errors?.assigneeId?.[0]}
              >
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="assigneeId"
                    defaultValue={defaultValues?.assigneeId ?? ''}
                  >
                    <option value="">Sem responsável</option>
                    {assignable.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>

            <Field label="O que o cliente relatou" required error={errors?.description?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  rows={5}
                  defaultValue={defaultValues?.description}
                  required
                  placeholder="O que acontece, onde, desde quando, como reproduzir."
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar' : 'Abrir chamado'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
