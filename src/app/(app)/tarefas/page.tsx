import type { Metadata } from 'next'
import Link from 'next/link'
import { Ban, CheckSquare, Link2 } from 'lucide-react'

import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { TaskDrawerLoader } from '@/components/tasks/task-drawer-loader'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { TaskLink } from '@/components/tasks/task-link'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EntityCode } from '@/components/ui/misc'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { formatDeadline, isOverdue } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { listOpenProjectOptions } from '@/server/modules/projects/queries'
import { listTasks } from '@/server/modules/tasks/queries'
import { listUserOptions } from '@/server/modules/users/queries'
import { TASK_PRIORITY, TASK_STATUS, TASK_TYPE } from '@/shared/domain'
import {
  taskListFilterSchema,
  taskPriorityValues,
  taskStatusValues,
  taskTypeValues,
} from '@/shared/schemas/tasks'

export const metadata: Metadata = { title: 'Tarefas' }
export const dynamic = 'force-dynamic'

const QUICK_FILTERS = [
  { value: 'atrasadas', label: 'Atrasadas' },
  { value: 'hoje', label: 'Vencem hoje' },
  { value: 'bloqueadas', label: 'Bloqueadas' },
  { value: 'dev', label: 'Desenvolvimento' },
] as const

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  if (!context.can('tasks.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="tasks.read" />
      </PageContainer>
    )
  }

  // Parâmetros inválidos na URL são descartados, não viram erro de página.
  const parsed = taskListFilterSchema.safeParse(params)
  const filter = parsed.success ? parsed.data : { page: 1 }
  const canCreate = context.can('tasks.write')

  const [result, users, projects] = await Promise.all([
    listTasks(context, filter),
    listUserOptions(),
    canCreate
      ? listOpenProjectOptions({
          involvedUserId: context.can('tasks.delete') ? undefined : context.user.id,
        })
      : Promise.resolve([]),
  ])

  const dev = filter.filtro === 'dev'
  const hasFilters = Boolean(
    filter.q ||
    filter.status ||
    filter.priority ||
    filter.type ||
    filter.filtro ||
    filter.assigneeId,
  )

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title={dev ? 'Desenvolvimento' : 'Tarefas'}
        description={
          dev
            ? 'Desenvolvimento, bugs, code review, QA e deploy — as mesmas tarefas dos projetos, recortadas para o time técnico.'
            : 'Todo o trabalho em andamento, de todos os projetos.'
        }
        actions={
          canCreate &&
          projects.length > 0 && (
            <TaskFormDialog
              projects={projects}
              users={users}
              currentUserId={context.user.id}
              canAssign={context.can('tasks.assign')}
              defaultOpen={params.nova === '1'}
            />
          )
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/tarefas" active={!filter.filtro}>
          Todas
        </Chip>
        {QUICK_FILTERS.map((item) => (
          <Chip
            key={item.value}
            href={`/tarefas?filtro=${item.value}`}
            active={filter.filtro === item.value}
          >
            {item.label}
          </Chip>
        ))}
        <Link
          href={`/tarefas?assigneeId=${context.user.id}`}
          className="text-brand-text ml-auto text-xs hover:underline"
        >
          Só as minhas
        </Link>
      </div>

      <Panel>
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar por título ou código…" />
            <ListFilterSelect
              paramKey="status"
              placeholder="Status"
              options={taskStatusValues.map((value) => ({
                value,
                label: TASK_STATUS[value].label,
              }))}
            />
            <ListFilterSelect
              paramKey="priority"
              placeholder="Prioridade"
              options={taskPriorityValues.map((value) => ({
                value,
                label: TASK_PRIORITY[value].label,
              }))}
            />
            {!dev && (
              <ListFilterSelect
                paramKey="type"
                placeholder="Tipo"
                options={taskTypeValues.map((value) => ({ value, label: TASK_TYPE[value].label }))}
              />
            )}
            <ListFilterSelect
              paramKey="assigneeId"
              placeholder="Responsável"
              options={users.map((user) => ({ value: user.id, label: user.name }))}
            />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={filter.q} />
          ) : (
            <EmptyState
              icon={<CheckSquare />}
              title="Nenhuma tarefa ainda"
              description="Tarefas nascem dos templates de projeto ou são criadas dentro de cada projeto."
            />
          )
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Tarefa</TH>
                    <TH className="hidden lg:table-cell">Projeto</TH>
                    <TH className="hidden md:table-cell">Tipo</TH>
                    <TH>Responsável</TH>
                    <TH>Prazo</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((task) => {
                    const open = task.status !== 'done' && task.status !== 'cancelled'
                    const late = open && isOverdue(task.dueDate)
                    return (
                      <TR key={task.id} interactive>
                        <td className="max-w-0 px-3 py-2">
                          <TaskLink taskId={task.id} className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1.5">
                              <EntityCode code={task.code} />
                              {(task.priority === 'high' || task.priority === 'urgent') && (
                                <Badge tone={TASK_PRIORITY[task.priority].tone} size="sm">
                                  {TASK_PRIORITY[task.priority].label}
                                </Badge>
                              )}
                              {task.openDependencies > 0 && (
                                <Link2
                                  className="text-subtle size-3"
                                  aria-label="Com dependência aberta"
                                />
                              )}
                            </span>
                            <span className="text-strong truncate font-medium hover:underline">
                              {task.title}
                            </span>
                            {task.status === 'blocked' && task.blockedReason && (
                              <span className="text-2xs text-danger-text flex items-center gap-1 truncate">
                                <Ban className="size-3 shrink-0" /> {task.blockedReason}
                              </span>
                            )}
                          </TaskLink>
                        </td>
                        <TD className="hidden lg:table-cell">
                          <Link
                            href={`/projetos/${task.projectId}`}
                            className="flex flex-col hover:underline"
                          >
                            <span className="text-default truncate text-xs">
                              {task.projectName}
                            </span>
                            <span className="text-2xs text-subtle truncate">{task.clientName}</span>
                          </Link>
                        </TD>
                        <TD className="hidden md:table-cell">
                          <span className="text-muted text-xs">{TASK_TYPE[task.type].label}</span>
                        </TD>
                        <TD>
                          {task.assignee ? (
                            <span className="flex items-center gap-1.5">
                              <Avatar
                                name={task.assignee.name}
                                src={task.assignee.avatarUrl}
                                size="xs"
                              />
                              <span className="hidden truncate text-xs xl:inline">
                                {task.assignee.name}
                              </span>
                            </span>
                          ) : (
                            <span className="text-subtle text-xs">—</span>
                          )}
                        </TD>
                        <TD>
                          <span className={cn('text-xs', late && 'text-danger-text font-medium')}>
                            {task.dueDate ? formatDeadline(task.dueDate) : '—'}
                          </span>
                        </TD>
                        <TD>
                          <StatusBadge map={TASK_STATUS} value={task.status} />
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </Panel>

      {params.tarefa && <TaskDrawerLoader context={context} taskId={params.tarefa} />}
    </PageContainer>
  )
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'h-7 rounded-full border px-3 text-xs leading-7 font-medium transition-colors',
        active
          ? 'border-brand-border bg-brand-soft text-brand-text'
          : 'border-line text-muted hover:border-line-strong hover:text-strong',
      )}
    >
      {children}
    </Link>
  )
}
