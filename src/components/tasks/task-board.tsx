'use client'

import { ArrowRight, Ban, CheckSquare, Link2, MessageSquare, MoreHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/cn'
import { formatDeadline, isOverdue } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EntityCode } from '@/components/ui/misc'
import { TASK_PRIORITY, TASK_STATUS, TASK_TYPE, type TaskStatus } from '@/shared/domain'
import type { TaskCard as TaskCardData } from '@/server/modules/tasks/queries'

import { TaskLink } from './task-link'
import { BlockTaskDialog, useTaskStatusChange } from './task-status-control'

/**
 * Quadro de tarefas por status.
 *
 * "Bloqueadas" é uma coluna própria logo depois de "A fazer": um bloqueio
 * escondido no meio da coluna de onde a tarefa estava é o tipo de problema
 * que fica invisível até virar atraso.
 */

const BOARD: TaskStatus[] = ['todo', 'blocked', 'in_progress', 'in_review', 'in_testing', 'done']

export interface BoardContext {
  users: { id: string; name: string }[]
  currentUserId: string
  canMove: boolean
}

export function TaskBoard({
  tasks,
  stages,
  context,
}: {
  tasks: TaskCardData[]
  stages?: { id: string; name: string }[]
  context: BoardContext
}) {
  const [stageFilter, setStageFilter] = useState<string | null>(null)

  const visible = useMemo(
    () => (stageFilter ? tasks.filter((task) => task.stageId === stageFilter) : tasks),
    [tasks, stageFilter],
  )

  const columns = BOARD.map((status) => ({
    status,
    cards: visible.filter((task) => task.status === status),
  }))

  const cancelled = visible.filter((task) => task.status === 'cancelled').length

  return (
    <div className="flex flex-col gap-3">
      {stages && stages.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <StageChip active={stageFilter === null} onClick={() => setStageFilter(null)}>
            Todas as etapas
          </StageChip>
          {stages.map((stage) => (
            <StageChip
              key={stage.id}
              active={stageFilter === stage.id}
              onClick={() => setStageFilter(stage.id)}
            >
              {stage.name}
            </StageChip>
          ))}
          {cancelled > 0 && (
            <span className="text-2xs text-subtle ml-auto">{cancelled} canceladas ocultas</span>
          )}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <div key={column.status} className="flex w-64 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h3
                className={cn(
                  'text-xs font-semibold',
                  column.status === 'blocked' && column.cards.length > 0
                    ? 'text-danger-text'
                    : 'text-strong',
                )}
              >
                {TASK_STATUS[column.status].label}
              </h3>
              <span className="text-2xs text-subtle" data-tabular>
                {column.cards.length}
              </span>
            </div>
            <div className="bg-sunken flex min-h-24 flex-col gap-2 rounded-lg p-1.5">
              {column.cards.length === 0 ? (
                <div className="border-line text-2xs text-subtle rounded-md border border-dashed px-2 py-5 text-center">
                  Vazio
                </div>
              ) : (
                column.cards.map((task) => <TaskCard key={task.id} task={task} context={context} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StageChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-2xs h-6 rounded-full border px-2.5 font-medium transition-colors',
        active
          ? 'border-brand-border bg-brand-soft text-brand-text'
          : 'border-line text-muted hover:border-line-strong hover:text-strong',
      )}
    >
      {children}
    </button>
  )
}

export function TaskCard({
  task,
  context,
  showProject = false,
}: {
  task: TaskCardData
  context: BoardContext
  showProject?: boolean
}) {
  const { change, pending } = useTaskStatusChange()
  const [blockOpen, setBlockOpen] = useState(false)
  const overdue = task.status !== 'done' && task.status !== 'cancelled' && isOverdue(task.dueDate)
  const priority = TASK_PRIORITY[task.priority]

  return (
    <div
      className={cn(
        'group bg-raised relative flex flex-col gap-2 rounded-md border p-2.5 shadow-[var(--shadow-raised)]',
        task.status === 'blocked' ? 'border-danger-border' : 'border-line',
        pending && 'opacity-60',
      )}
    >
      <TaskLink taskId={task.id} className="flex flex-col gap-1 pr-5">
        <span className="flex items-center gap-1.5">
          <EntityCode code={task.code} />
          {task.openDependencies > 0 && (
            <Link2 className="text-subtle size-3" aria-label="Depende de outra tarefa" />
          )}
        </span>
        <span
          className={cn(
            'text-strong line-clamp-2 text-sm leading-snug font-medium',
            task.status === 'done' && 'text-muted line-through decoration-[var(--line-strong)]',
          )}
        >
          {task.title}
        </span>
        {showProject && <span className="text-2xs text-muted truncate">{task.projectName}</span>}
        {task.status === 'blocked' && task.blockedReason && (
          <span className="text-2xs text-danger-text flex items-start gap-1">
            <Ban className="mt-px size-3 shrink-0" />
            <span className="line-clamp-2">{task.blockedReason}</span>
          </span>
        )}
      </TaskLink>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.assignee ? (
            <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size="xs" />
          ) : (
            <span
              className="border-line-strong size-5 rounded-full border border-dashed"
              title="Sem responsável"
            />
          )}
          {(task.priority === 'high' || task.priority === 'urgent') && (
            <Badge tone={priority.tone} size="sm">
              {priority.label}
            </Badge>
          )}
          {task.type !== 'generic' && (
            <span className="text-2xs text-subtle truncate">{TASK_TYPE[task.type].label}</span>
          )}
        </div>
        <div className="text-2xs text-subtle flex shrink-0 items-center gap-2">
          {task.checklistTotal > 0 && (
            <span className="flex items-center gap-0.5" data-tabular>
              <CheckSquare className="size-3" />
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5" data-tabular>
              <MessageSquare className="size-3" />
              {task.commentCount}
            </span>
          )}
          {task.dueDate && (
            <span className={overdue ? 'text-danger-text font-medium' : undefined}>
              {formatDeadline(task.dueDate)}
            </span>
          )}
        </div>
      </div>

      {context.canMove && task.status !== 'cancelled' && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={pending}
                className="text-subtle hover:bg-hover hover:text-strong absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Mover ${task.code}`}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {BOARD.filter((status) => status !== task.status && status !== 'blocked').map(
                (status) => (
                  <DropdownMenuItem key={status} onSelect={() => change(task.id, status)}>
                    <ArrowRight />
                    {TASK_STATUS[status].label}
                  </DropdownMenuItem>
                ),
              )}
              {task.status !== 'blocked' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setBlockOpen(true)}>
                    <Ban />
                    Bloquear…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <BlockTaskDialog
            taskId={task.id}
            taskTitle={task.title}
            users={context.users}
            currentUserId={context.currentUserId}
            open={blockOpen}
            onOpenChange={setBlockOpen}
          />
        </>
      )}
    </div>
  )
}
