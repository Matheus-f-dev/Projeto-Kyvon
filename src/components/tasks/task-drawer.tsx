'use client'

import { Ban, GitBranch, Link2, Pencil, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/cn'
import {
  formatDate,
  formatDateTime,
  formatDeadline,
  formatHours,
  formatRelative,
  isOverdue,
} from '@/lib/format'
import { FileList } from '@/components/files/file-list'
import { ActivityTimeline } from '@/components/ui/activity-timeline'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/states'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { DetailItem, DetailList, EntityCode } from '@/components/ui/misc'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/toggle'
import { idleState } from '@/server/action-state'
import {
  addChecklistItemAction,
  addCommentAction,
  addDependencyAction,
  deleteChecklistItemAction,
  deleteTaskAction,
  removeDependencyAction,
  saveDevDetailsAction,
  toggleChecklistItemAction,
} from '@/server/modules/tasks/actions'
import type { FilePanelData } from '@/server/modules/files/queries'
import type { TaskDetail } from '@/server/modules/tasks/queries'
import {
  DEV_TASK_TYPES,
  TASK_PRIORITY,
  TASK_STATUS,
  TASK_TYPE,
  type TaskStatus,
} from '@/shared/domain'
import { taskStatusValues } from '@/shared/schemas/tasks'

import { TaskFormDialog } from './task-form-dialog'
import { useCloseTaskHref } from './task-link'
import { BlockTaskDialog, useTaskStatusChange } from './task-status-control'

export interface TaskDrawerProps {
  task: TaskDetail
  users: { id: string; name: string }[]
  stages: { id: string; name: string }[]
  dependencyCandidates: { id: string; code: string; title: string }[]
  currentUserId: string
  /** `null` quando o usuário não pode ver arquivos de tarefa. */
  filePanel?: FilePanelData | null
  permissions: {
    canEdit: boolean
    canAssign: boolean
    canDelete: boolean
    canComment: boolean
  }
}

/**
 * Drawer da tarefa.
 *
 * Abrir uma tarefa não custa uma navegação (item 40 do produto): o quadro ou
 * a lista continuam atrás, na mesma posição. Tudo o que se faz numa tarefa no
 * dia a dia — mudar status, marcar checklist, comentar — acontece aqui sem
 * abrir outra tela.
 */
export function TaskDrawer({
  task,
  users,
  stages,
  dependencyCandidates,
  currentUserId,
  filePanel,
  permissions,
}: TaskDrawerProps) {
  const router = useRouter()
  const closeHref = useCloseTaskHref()
  const { change, pending: statusPending } = useTaskStatusChange()
  const [blockOpen, setBlockOpen] = useState(false)

  const overdue = task.status !== 'done' && task.status !== 'cancelled' && isOverdue(task.dueDate)
  const isDevTask = DEV_TASK_TYPES.includes(task.type) || Boolean(task.devDetails)
  const locked = task.project.status === 'completed' || task.project.status === 'cancelled'
  const canEdit = permissions.canEdit && !locked

  const onStatusSelect = (next: TaskStatus) => {
    if (next === 'blocked') setBlockOpen(true)
    else change(task.id, next)
  }

  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="lg">
        <DrawerHeader
          meta={
            <>
              <EntityCode code={task.code} />
              <span>·</span>
              <Link href={`/projetos/${task.project.id}`} className="hover:underline">
                {task.project.name}
              </Link>
              <span>·</span>
              <Link href={`/clientes/${task.project.clientId}`} className="hover:underline">
                {task.project.clientName}
              </Link>
            </>
          }
          title={task.title}
          actions={
            <>
              {canEdit && (
                <TaskFormDialog
                  projectId={task.project.id}
                  stages={stages}
                  users={users}
                  currentUserId={currentUserId}
                  canAssign={permissions.canAssign}
                  defaultValues={{
                    id: task.id,
                    title: task.title,
                    description: task.description ?? undefined,
                    stageId: task.stage?.id,
                    assigneeId: task.assignee?.id,
                    priority: task.priority,
                    type: task.type,
                    startDate: task.startDate ?? undefined,
                    dueDate: task.dueDate ?? undefined,
                    estimateHours: task.estimateHours ?? undefined,
                    spentHours: task.spentHours ?? undefined,
                  }}
                  trigger={
                    <Button variant="ghost" size="sm" icon={<Pencil />}>
                      Editar
                    </Button>
                  }
                />
              )}
              {permissions.canDelete && (
                <ConfirmButton
                  label="Excluir"
                  icon={<Trash2 />}
                  variant="danger-ghost"
                  title="Excluir tarefa"
                  description="A exclusão fica registrada na auditoria e no feed do projeto. Checklist e comentários são removidos junto."
                  confirmLabel="Excluir tarefa"
                  action={() => deleteTaskAction(task.id)}
                  onSuccess={() => router.push(closeHref, { scroll: false })}
                />
              )}
            </>
          }
        />

        <DrawerBody className="flex flex-col gap-5 px-5 py-4">
          {/* ── Status ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <NativeSelect
                aria-label="Status da tarefa"
                value={task.status}
                disabled={statusPending}
                onChange={(event) => onStatusSelect(event.target.value as TaskStatus)}
                className="h-8 w-48"
              >
                {taskStatusValues.map((value) => (
                  <option key={value} value={value}>
                    {TASK_STATUS[value].label}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <StatusBadge map={TASK_STATUS} value={task.status} size="md" />
            )}
            {locked && (
              <span className="text-2xs text-muted">Projeto encerrado — somente leitura.</span>
            )}
          </div>

          {task.status === 'blocked' && (
            <div className="border-danger-border bg-danger-soft text-danger-text flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Ban className="size-3.5" /> Bloqueada
                {task.blockedSince && (
                  <span className="font-normal">· {formatRelative(task.blockedSince)}</span>
                )}
              </span>
              <span>{task.blockedReason}</span>
              {task.blockedOwner && (
                <span className="text-2xs">Resolução: {task.blockedOwner.name}</span>
              )}
            </div>
          )}

          <DetailList>
            <DetailItem label="Responsável">
              {task.assignee ? (
                <span className="flex items-center gap-1.5">
                  <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size="xs" />
                  {task.assignee.name}
                </span>
              ) : (
                <span className="text-subtle">Sem responsável</span>
              )}
            </DetailItem>
            <DetailItem label="Prazo">
              <span className={overdue ? 'text-danger-text font-medium' : undefined}>
                {task.dueDate
                  ? `${formatDate(task.dueDate)} · ${formatDeadline(task.dueDate)}`
                  : '—'}
              </span>
            </DetailItem>
            <DetailItem label="Prioridade">{TASK_PRIORITY[task.priority].label}</DetailItem>
            <DetailItem label="Tipo">{TASK_TYPE[task.type].label}</DetailItem>
            <DetailItem label="Etapa">{task.stage?.name ?? '—'}</DetailItem>
            <DetailItem label="Horas">
              {formatHours(task.spentHours, '0h')} de {formatHours(task.estimateHours, '—')}
            </DetailItem>
            <DetailItem label="Criada por">
              {task.creator?.name ?? '—'} · {formatDate(task.createdAt)}
            </DetailItem>
            {task.completedAt && (
              <DetailItem label="Concluída em">{formatDateTime(task.completedAt)}</DetailItem>
            )}
          </DetailList>

          {task.description && (
            <p className="border-line text-default border-t pt-4 text-sm leading-relaxed whitespace-pre-line">
              {task.description}
            </p>
          )}

          <Tabs defaultValue="checklist" className="border-line border-t pt-2">
            <TabsList>
              <TabsTrigger value="checklist" count={task.checklist.length}>
                Checklist
              </TabsTrigger>
              <TabsTrigger value="comentarios" count={task.comments.length}>
                Comentários
              </TabsTrigger>
              <TabsTrigger value="dependencias" count={task.dependsOn.length + task.blocks.length}>
                Dependências
              </TabsTrigger>
              {filePanel && (
                <TabsTrigger value="arquivos" count={filePanel.files.length}>
                  Arquivos
                </TabsTrigger>
              )}
              {isDevTask && <TabsTrigger value="dev">Técnico</TabsTrigger>}
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="pt-3">
              <Checklist taskId={task.id} items={task.checklist} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="comentarios" className="pt-3">
              <Comments
                taskId={task.id}
                comments={task.comments}
                canComment={permissions.canComment && !locked}
              />
            </TabsContent>

            <TabsContent value="dependencias" className="pt-3">
              <Dependencies task={task} candidates={dependencyCandidates} canEdit={canEdit} />
            </TabsContent>

            {isDevTask && (
              <TabsContent value="dev" className="pt-3">
                <DevDetailsForm task={task} canEdit={canEdit} />
              </TabsContent>
            )}

            {filePanel && (
              <TabsContent value="arquivos" className="-mx-4 pt-1">
                <FileList {...filePanel} bare />
              </TabsContent>
            )}

            <TabsContent value="historico" className="-mx-4 pt-1">
              <ActivityTimeline items={task.history} />
            </TabsContent>
          </Tabs>
        </DrawerBody>
      </DrawerContent>

      <BlockTaskDialog
        taskId={task.id}
        taskTitle={task.title}
        users={users}
        currentUserId={currentUserId}
        open={blockOpen}
        onOpenChange={setBlockOpen}
      />
    </Drawer>
  )
}

// ── Checklist ────────────────────────────────────────────────────────────────

function Checklist({
  taskId,
  items,
  canEdit,
}: {
  taskId: string
  items: TaskDetail['checklist']
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const done = items.filter((item) => item.isDone).length

  const run = (fn: () => Promise<{ status: string; message?: string }>, after?: () => void) => {
    startTransition(async () => {
      const result = await fn()
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível atualizar o checklist.')
        return
      }
      after?.()
      router.refresh()
    })
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    const formData = new FormData()
    formData.set('taskId', taskId)
    formData.set('title', title.trim())
    run(
      () => addChecklistItemAction(formData),
      () => setTitle(''),
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <p className="text-2xs text-muted" data-tabular>
          {done} de {items.length} concluídos
        </p>
      )}
      <ul className="flex flex-col">
        {items.map((item) => (
          <li
            key={item.id}
            className="group hover:bg-hover flex items-center gap-2.5 rounded-md px-1 py-1.5"
          >
            <Checkbox
              checked={item.isDone}
              disabled={!canEdit || pending}
              onCheckedChange={(checked) =>
                run(() => toggleChecklistItemAction(taskId, item.id, checked === true))
              }
              aria-label={item.title}
            />
            <span
              className={cn(
                'flex-1 text-sm',
                item.isDone ? 'text-muted line-through' : 'text-default',
              )}
            >
              {item.title}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => run(() => deleteChecklistItemAction(taskId, item.id))}
                className="text-subtle hover:text-danger-text opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Remover ${item.title}`}
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && !canEdit && <p className="text-subtle text-xs">Sem itens.</p>}
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Adicionar item…"
            aria-label="Novo item do checklist"
          />
          <Button type="submit" variant="secondary" loading={pending} disabled={!title.trim()}>
            Adicionar
          </Button>
        </form>
      )}
    </div>
  )
}

// ── Comentários ──────────────────────────────────────────────────────────────

function Comments({
  taskId,
  comments,
  canComment,
}: {
  taskId: string
  comments: TaskDetail['comments']
  canComment: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (!body.trim()) return
    const formData = new FormData()
    formData.set('taskId', taskId)
    formData.set('body', body.trim())

    startTransition(async () => {
      const result = await addCommentAction(formData)
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível publicar.')
        return
      }
      setBody('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="text-subtle text-xs">Nenhum comentário ainda.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar
                name={comment.author?.name ?? '?'}
                src={comment.author?.avatarUrl}
                size="sm"
                className="mt-0.5"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs">
                  <span className="text-strong font-medium">
                    {comment.author?.name ?? 'Usuário removido'}
                  </span>{' '}
                  <span className="text-subtle">{formatRelative(comment.createdAt)}</span>
                </span>
                <p className="text-default text-sm leading-relaxed whitespace-pre-line">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="Escreva um comentário — quem está envolvido na tarefa é avisado."
            aria-label="Novo comentário"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event)
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-2xs text-subtle">Ctrl + Enter para enviar</span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={pending}
              disabled={!body.trim()}
            >
              Comentar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Dependências ─────────────────────────────────────────────────────────────

function Dependencies({
  task,
  candidates,
  canEdit,
}: {
  task: TaskDetail
  candidates: { id: string; code: string; title: string }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState('')

  const linked = new Set(task.dependsOn.map((item) => item.id))
  const available = candidates.filter((candidate) => !linked.has(candidate.id))

  const run = (fn: () => Promise<{ status: string; message?: string }>, after?: () => void) => {
    startTransition(async () => {
      const result = await fn()
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível atualizar as dependências.')
        return
      }
      after?.()
      router.refresh()
    })
  }

  const add = () => {
    if (!selected) return
    const formData = new FormData()
    formData.set('taskId', task.id)
    formData.set('dependsOnTaskId', selected)
    run(
      () => addDependencyAction(formData),
      () => setSelected(''),
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h4 className="text-2xs text-subtle font-semibold tracking-wide uppercase">Depende de</h4>
        <p className="text-2xs text-muted">Esta tarefa só pode ser concluída depois destas.</p>
        {task.dependsOn.length === 0 ? (
          <p className="text-subtle text-xs">Nenhuma.</p>
        ) : (
          <DependencyList
            items={task.dependsOn}
            onRemove={canEdit ? (id) => run(() => removeDependencyAction(task.id, id)) : undefined}
          />
        )}
        {canEdit && available.length > 0 && (
          <div className="flex gap-2">
            <NativeSelect
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              aria-label="Tarefa predecessora"
            >
              <option value="">Adicionar predecessora…</option>
              {available.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.code} · {candidate.title}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="secondary"
              icon={<Link2 />}
              onClick={add}
              disabled={!selected}
              loading={pending}
            >
              Vincular
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-2xs text-subtle font-semibold tracking-wide uppercase">Bloqueia</h4>
        {task.blocks.length === 0 ? (
          <p className="text-subtle text-xs">Nenhuma tarefa espera por esta.</p>
        ) : (
          <DependencyList items={task.blocks} />
        )}
      </section>
    </div>
  )
}

function DependencyList({
  items,
  onRemove,
}: {
  items: TaskDetail['dependsOn']
  onRemove?: (id: string) => void
}) {
  return (
    <ul className="border-line flex flex-col divide-y divide-[var(--line-subtle)] rounded-md border">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 px-3 py-2">
          <EntityCode code={item.code} />
          <span className="text-default flex-1 truncate text-sm">{item.title}</span>
          <StatusBadge map={TASK_STATUS} value={item.status} />
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="text-subtle hover:text-danger-text"
              aria-label={`Remover dependência ${item.code}`}
            >
              <X className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── Dados técnicos ───────────────────────────────────────────────────────────

function DevDetailsForm({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const router = useRouter()
  const [state, formAction] = useActionState(async (previous: unknown, formData: FormData) => {
    const result = await saveDevDetailsAction(previous, formData)
    if (result.status === 'success') {
      toast.success(result.message ?? 'Salvo.')
      router.refresh()
    }
    return result
  }, idleState)

  const dev = task.devDetails

  if (!canEdit) {
    return dev ? (
      <DetailList>
        <DetailItem label="Repositório">{dev.repository ?? '—'}</DetailItem>
        <DetailItem label="Branch">{dev.branch ?? '—'}</DetailItem>
        <DetailItem label="Pull request">
          {dev.pullRequestUrl ? (
            <a
              href={dev.pullRequestUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-text hover:underline"
            >
              Abrir PR
            </a>
          ) : (
            '—'
          )}
        </DetailItem>
        <DetailItem label="Ambiente">{dev.environment ?? '—'}</DetailItem>
        <DetailItem label="Versão">{dev.version ?? '—'}</DetailItem>
        <DetailItem label="Release">{dev.release ?? '—'}</DetailItem>
      </DetailList>
    ) : (
      <p className="text-subtle text-xs">Sem dados técnicos registrados.</p>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="taskId" value={task.id} />
      <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Repositório" error={state.fieldErrors?.repository?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="repository"
              defaultValue={dev?.repository ?? ''}
              placeholder="kyvon/site-aurora"
            />
          )}
        </Field>
        <Field label="Branch" error={state.fieldErrors?.branch?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="branch"
              defaultValue={dev?.branch ?? ''}
              leading={<GitBranch />}
              placeholder="feat/checkout"
            />
          )}
        </Field>
        <Field
          label="Pull request"
          error={state.fieldErrors?.pullRequestUrl?.[0]}
          className="sm:col-span-2"
        >
          {(props) => (
            <Input
              {...props}
              name="pullRequestUrl"
              defaultValue={dev?.pullRequestUrl ?? ''}
              placeholder="https://…"
            />
          )}
        </Field>
        <Field label="Ambiente" error={state.fieldErrors?.environment?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="environment"
              defaultValue={dev?.environment ?? ''}
              placeholder="staging"
            />
          )}
        </Field>
        <Field label="Versão" error={state.fieldErrors?.version?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="version"
              defaultValue={dev?.version ?? ''}
              placeholder="1.4.0"
            />
          )}
        </Field>
        <Field label="Release" error={state.fieldErrors?.release?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="release"
              defaultValue={dev?.release ?? ''}
              placeholder="2026.10"
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton size="sm">Salvar dados técnicos</SubmitButton>
      </div>
    </form>
  )
}

/**
 * Link antigo para uma tarefa excluída (ou sem permissão de leitura): em vez
 * de derrubar a página inteira com 404, abre o drawer explicando o que houve.
 */
export function MissingTaskDrawer() {
  const router = useRouter()
  const closeHref = useCloseTaskHref()

  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="sm">
        <DrawerHeader title="Tarefa indisponível" />
        <DrawerBody>
          <EmptyState
            title="Esta tarefa não existe mais"
            description="Ela pode ter sido excluída, ou você não tem acesso a ela. A exclusão fica registrada no histórico do projeto."
          />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
