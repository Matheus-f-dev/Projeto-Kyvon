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
import { createTaskAction, updateTaskAction } from '@/server/modules/tasks/actions'
import { TASK_PRIORITY, TASK_TYPE } from '@/shared/domain'
import { taskPriorityValues, taskTypeValues, type UpdateTaskInput } from '@/shared/schemas/tasks'

export interface TaskFormDefaults extends Partial<UpdateTaskInput> {
  id?: string
}

/**
 * Criar ou editar tarefa.
 *
 * Criada de dentro de um projeto, a tarefa já nasce nele e oferece as etapas
 * dele; criada de fora (lista geral), pede o projeto primeiro. Atribuir a
 * outra pessoa só aparece para quem tem `tasks.assign` — o servidor confere
 * de novo.
 */
export function TaskFormDialog({
  projectId,
  projects,
  stages = [],
  users,
  currentUserId,
  canAssign,
  defaultValues,
  trigger,
  defaultOpen = false,
}: {
  /** Projeto fixo (criação de dentro do projeto ou edição). */
  projectId?: string
  /** Lista para escolher o projeto quando ele não está fixo. */
  projects?: { id: string; code: string; name: string }[]
  stages?: { id: string; name: string }[]
  users: { id: string; name: string }[]
  currentUserId: string
  canAssign: boolean
  defaultValues?: TaskFormDefaults
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const isEdit = Boolean(defaultValues?.id)
  const [open, setOpen] = useState(defaultOpen)
  const [state, formAction] = useUpsertFormAction(
    isEdit ? updateTaskAction.bind(null, defaultValues!.id!) : createTaskAction,
    open,
    setOpen,
  )

  // Sem `tasks.assign`, a pessoa só pode assumir para si — mas o responsável
  // atual precisa continuar na lista: sem ele o select cairia em "Sem
  // responsável" e salvar qualquer outro campo desatribuiria a tarefa.
  const assignable = canAssign
    ? users
    : users.filter((user) => user.id === currentUserId || user.id === defaultValues?.assigneeId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<Plus />}>
            Nova tarefa
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="lg">
        <DialogHeader title={isEdit ? 'Editar tarefa' : 'Nova tarefa'} />
        <form action={formAction} className="contents">
          {!isEdit && projectId && <input type="hidden" name="projectId" value={projectId} />}

          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <Field label="Título" required error={state.fieldErrors?.title?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  defaultValue={defaultValues?.title}
                  required
                  autoFocus
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              {!isEdit && !projectId && projects && (
                <Field
                  label="Projeto"
                  required
                  error={state.fieldErrors?.projectId?.[0]}
                  className="sm:col-span-2"
                >
                  {(props) => (
                    <NativeSelect {...props} name="projectId" defaultValue="" required>
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

              {stages.length > 0 && (
                <Field label="Etapa" error={state.fieldErrors?.stageId?.[0]}>
                  {(props) => (
                    <NativeSelect
                      {...props}
                      name="stageId"
                      defaultValue={defaultValues?.stageId ?? ''}
                    >
                      <option value="">Sem etapa</option>
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              )}

              <Field
                label="Responsável"
                hint={
                  canAssign
                    ? undefined
                    : 'Você pode assumir a tarefa; atribuir a outra pessoa requer permissão.'
                }
                error={state.fieldErrors?.assigneeId?.[0]}
              >
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="assigneeId"
                    defaultValue={defaultValues?.assigneeId ?? ''}
                  >
                    <option value="">Sem responsável</option>
                    {assignable.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Prioridade" error={state.fieldErrors?.priority?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="priority"
                    defaultValue={defaultValues?.priority ?? 'medium'}
                  >
                    {taskPriorityValues.map((value) => (
                      <option key={value} value={value}>
                        {TASK_PRIORITY[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Tipo" error={state.fieldErrors?.type?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="type"
                    defaultValue={defaultValues?.type ?? 'generic'}
                  >
                    {taskTypeValues.map((value) => (
                      <option key={value} value={value}>
                        {TASK_TYPE[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

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

              <Field label="Prazo" error={state.fieldErrors?.dueDate?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="dueDate"
                    type="date"
                    defaultValue={defaultValues?.dueDate}
                  />
                )}
              </Field>

              <Field label="Estimativa (horas)" error={state.fieldErrors?.estimateHours?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="estimateHours"
                    inputMode="decimal"
                    defaultValue={defaultValues?.estimateHours}
                  />
                )}
              </Field>

              {isEdit && (
                <Field label="Horas gastas" error={state.fieldErrors?.spentHours?.[0]}>
                  {(props) => (
                    <Input
                      {...props}
                      name="spentHours"
                      inputMode="decimal"
                      defaultValue={defaultValues?.spentHours}
                    />
                  )}
                </Field>
              )}
            </div>

            <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  rows={4}
                  defaultValue={defaultValues?.description}
                />
              )}
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar' : 'Criar tarefa'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
