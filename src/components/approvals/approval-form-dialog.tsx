'use client'

import { Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

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
import { idleState, type ActionState } from '@/server/action-state'
import { createApprovalAction, updateApprovalAction } from '@/server/modules/approvals/actions'

export interface ApprovalProjectOptions {
  tasks: { id: string; code: string; title: string }[]
  contacts: { id: string; name: string; jobTitle: string | null }[]
}

export interface ApprovalFormDefaults {
  id: string
  title: string
  description: string | null
  taskId: string | null
  approverUserId: string | null
  approverContactId: string | null
  dueDate: string | null
}

/**
 * Pedir aprovação (ou editar os dados de uma em aberto).
 *
 * Quem aprova pode ser alguém da equipe (decide no sistema) ou um contato do
 * cliente autorizado a aprovar (a equipe registra a decisão dele). O material
 * não entra aqui: depois de criar, o drawer abre na v1 para anexar os arquivos.
 */
export function ApprovalFormDialog({
  projectId,
  projects,
  approvers,
  options: fixedOptions,
  defaultValues,
  trigger,
  defaultOpen = false,
}: {
  /** Projeto fixo — criação de dentro do projeto, ou edição. */
  projectId?: string
  /** Para escolher o projeto quando ele não está fixo. */
  projects?: { id: string; code: string; name: string }[]
  approvers: { id: string; name: string }[]
  /** Tarefas e contatos do projeto fixo. Sem projeto fixo, são buscados ao escolher. */
  options?: ApprovalProjectOptions
  defaultValues?: ApprovalFormDefaults
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEdit = Boolean(defaultValues)

  const [open, setOpen] = useState(defaultOpen)
  const [loaded, setLoaded] = useState<ApprovalProjectOptions | undefined>(fixedOptions)
  const [loading, setLoading] = useState(false)

  const options = fixedOptions ?? loaded

  const selectProject = async (id: string) => {
    setLoaded(undefined)
    if (!id) return
    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${id}/approval-options`)
      if (!response.ok) throw new Error()
      setLoaded((await response.json()) as ApprovalProjectOptions)
    } catch {
      toast.error('Não foi possível carregar as opções do projeto.')
    } finally {
      setLoading(false)
    }
  }

  const submit = async (previous: ActionState<unknown>, formData: FormData) => {
    const result: ActionState<unknown> = isEdit
      ? await updateApprovalAction(defaultValues!.id, previous, formData)
      : await createApprovalAction(previous, formData)

    if (result.status === 'success') {
      toast.success(result.message ?? 'Salvo.')
      setOpen(false)
      const created = result.data as { id?: string } | undefined
      if (created?.id) {
        // Abre o drawer da nova aprovação na página atual, para anexar a v1.
        const params = new URLSearchParams(searchParams.toString())
        params.delete('novaAprovacao')
        params.set('aprovacao', created.id)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      } else {
        router.refresh()
      }
    }
    return result
  }

  const [state, formAction] = useActionState(submit, idleState as ActionState<unknown>)
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<Plus />}>
            Pedir aprovação
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="lg">
        <DialogHeader
          title={isEdit ? 'Editar aprovação' : 'Pedir aprovação'}
          description={
            isEdit
              ? 'O material e as decisões das versões não mudam — só os dados do pedido.'
              : 'Depois de criar, anexe o material da v1.'
          }
        />
        <form action={formAction} className="contents">
          {projectId && !isEdit && <input type="hidden" name="projectId" value={projectId} />}

          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            {!projectId && !isEdit && projects && (
              <Field label="Projeto" required error={errors?.projectId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="projectId"
                    defaultValue=""
                    required
                    onChange={(event) => void selectProject(event.target.value)}
                  >
                    <option value="" disabled>
                      Selecione o projeto
                    </option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} · {project.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            )}

            <Field label="O que está sendo aprovado" required error={errors?.title?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  defaultValue={defaultValues?.title}
                  placeholder="Ex.: Layout da home — desktop e mobile"
                  required
                  autoFocus
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Aprovador da equipe"
                hint="Decide pelo sistema."
                error={errors?.approverUserId?.[0]}
              >
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="approverUserId"
                    defaultValue={defaultValues?.approverUserId ?? ''}
                  >
                    <option value="">Ninguém da equipe</option>
                    {approvers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field
                label="Aprovador do cliente"
                hint={
                  options && options.contacts.length === 0
                    ? 'Nenhum contato autorizado a aprovar neste cliente.'
                    : 'A equipe registra a decisão dele.'
                }
                error={errors?.approverContactId?.[0]}
              >
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="approverContactId"
                    defaultValue={defaultValues?.approverContactId ?? ''}
                    disabled={!options || loading}
                  >
                    <option value="">{options ? 'Nenhum contato' : 'Escolha o projeto'}</option>
                    {options?.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                        {contact.jobTitle ? ` · ${contact.jobTitle}` : ''}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Tarefa de origem" error={errors?.taskId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="taskId"
                    defaultValue={defaultValues?.taskId ?? ''}
                    disabled={!options || loading}
                  >
                    <option value="">Sem tarefa</option>
                    {options?.tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.code} · {task.title}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Prazo para decisão" error={errors?.dueDate?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    name="dueDate"
                    defaultValue={defaultValues?.dueDate ?? ''}
                  />
                )}
              </Field>
            </div>

            <Field label="Contexto" error={errors?.description?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  rows={3}
                  defaultValue={defaultValues?.description ?? ''}
                  placeholder="O que precisa ser avaliado, critérios, referências."
                />
              )}
            </Field>

            {!isEdit && (
              <Field
                label="Observações da v1"
                hint="Onde olhar, o que já está resolvido, links do protótipo."
                error={errors?.notes?.[0]}
              >
                {(props) => <Textarea {...props} name="notes" rows={3} />}
              </Field>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar' : 'Criar e anexar material'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
