import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Ban, Check, CheckSquare, Plus } from 'lucide-react'

import { ApprovalDrawerLoader } from '@/components/approvals/approval-drawer-loader'
import { FileList } from '@/components/files/file-list'
import { ScopeChangeFormDialog } from '@/components/scope/scope-change-form-dialog'
import { ScopeDrawerLoader } from '@/components/scope/scope-drawer-loader'
import { TicketDrawerLoader } from '@/components/support/ticket-drawer-loader'
import { ScopePanel } from '@/components/scope/scope-panel'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { TaskBoard } from '@/components/tasks/task-board'
import { TaskDrawerLoader } from '@/components/tasks/task-drawer-loader'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { ActivityTimeline } from '@/components/ui/activity-timeline'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/misc'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, NoPermissionState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { formatDate, formatDeadline, formatRelative, isOverdue } from '@/lib/format'
import { getAuthContext, requireAuth } from '@/server/auth/context'
import { getFilePanel } from '@/server/modules/files/queries'
import { getProjectDetail, listProjectActivity } from '@/server/modules/projects/queries'
import { listProjectScopeChanges } from '@/server/modules/scope/queries'
import { listProjectTasks } from '@/server/modules/tasks/queries'
import { isInvolvedInProject } from '@/server/modules/tasks/service'
import { listUserOptions } from '@/server/modules/users/queries'
import { PROJECT_STATUS } from '@/shared/domain'

import { ProjectApprovalsPanel } from './approvals-panel'
import { ProjectEditDialog } from './project-edit-dialog'
import { ProjectStatusActions } from './project-status-actions'
import { TeamPanel } from './team-panel'
import { ProjectTicketsPanel } from './tickets-panel'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const context = await getAuthContext()
  if (!context?.can('projects.read')) return { title: 'Projeto' }
  const project = await getProjectDetail(context, id)
  return { title: project ? `${project.code} · ${project.name}` : 'Projeto' }
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const context = await requireAuth()

  if (!context.can('projects.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="projects.read" />
      </PageContainer>
    )
  }

  const project = await getProjectDetail(context, id)
  if (!project) notFound()

  const [tasks, activity, users, involved, filePanel, scopeChanges] = await Promise.all([
    listProjectTasks(context, id),
    listProjectActivity(id),
    listUserOptions(),
    isInvolvedInProject(id, context.user.id),
    getFilePanel(context, { type: 'project', id }),
    listProjectScopeChanges(context, id),
  ])

  const closed = project.status === 'completed' || project.status === 'cancelled'
  const canEditProject =
    context.can('projects.write') && (context.can('projects.delete') || involved)
  const canEditTasks = context.can('tasks.write') && (context.can('tasks.delete') || involved)
  const overdue = !closed && isOverdue(project.dueDate)
  const openTasks = tasks.filter(
    (task) => task.status !== 'done' && task.status !== 'cancelled',
  ).length
  const stages = project.stages.map((stage) => ({ id: stage.id, name: stage.name }))

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        breadcrumb={[
          { label: 'Projetos', href: '/projetos' },
          { label: project.client.name, href: `/clientes/${project.client.id}` },
          { label: project.code },
        ]}
        title={project.name}
        badges={<StatusBadge map={PROJECT_STATUS} value={project.status} size="md" />}
        actions={
          <>
            {canEditTasks && !closed && (
              <TaskFormDialog
                projectId={project.id}
                stages={stages}
                users={users}
                currentUserId={context.user.id}
                canAssign={context.can('tasks.assign')}
                defaultOpen={query.novaTarefa === '1'}
                trigger={
                  <Button variant="primary" size="md" icon={<Plus />}>
                    Nova tarefa
                  </Button>
                }
              />
            )}
            {canEditProject && !closed && (
              <ProjectEditDialog
                project={{
                  id: project.id,
                  name: project.name,
                  ownerId: project.owner?.id ?? null,
                  startDate: project.startDate,
                  dueDate: project.dueDate,
                  description: project.description,
                }}
                users={users}
              />
            )}
          </>
        }
      />

      {canEditProject && (
        <ProjectStatusActions
          projectId={project.id}
          projectName={project.name}
          status={project.status}
          launched={Boolean(project.launchedAt)}
          openApprovals={project.openApprovals}
          users={users}
          currentUserId={context.user.id}
          canCancel={context.can('projects.delete')}
        />
      )}

      {project.status === 'blocked' && project.blockedReason && (
        <div className="border-danger-border bg-danger-soft text-danger-text flex flex-col gap-0.5 rounded-lg border px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Ban className="size-4" /> Bloqueado
            {project.blockedSince && (
              <span className="font-normal">· {formatRelative(project.blockedSince)}</span>
            )}
          </span>
          <span>{project.blockedReason}</span>
          {project.blockedOwner && (
            <span className="text-2xs">Resolução: {project.blockedOwner.name}</span>
          )}
        </div>
      )}

      {project.status === 'cancelled' && project.cancellationReason && (
        <div className="border-line bg-neutral-soft text-muted rounded-lg border px-4 py-3 text-sm">
          <span className="text-default font-medium">Cancelado:</span> {project.cancellationReason}
        </div>
      )}

      {/* ── Resumo ─────────────────────────────────────────────────────── */}
      <section className="border-line grid gap-px overflow-hidden rounded-lg border bg-[var(--line-subtle)] sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCell label="Progresso">
          <div className="flex flex-col gap-1.5">
            <span className="text-strong text-xl font-semibold" data-tabular>
              {project.progress}%
            </span>
            <ProgressBar
              value={project.progress}
              tone={project.progress === 100 ? 'success' : 'brand'}
            />
          </div>
        </SummaryCell>
        <SummaryCell label="Prazo">
          <span className={cn('text-sm font-medium', overdue ? 'text-danger-text' : 'text-strong')}>
            {project.dueDate ? formatDate(project.dueDate) : 'Sem prazo'}
          </span>
          {project.dueDate && !closed && (
            <span className="text-2xs text-muted">{formatDeadline(project.dueDate)}</span>
          )}
        </SummaryCell>
        <SummaryCell label="Tarefas abertas">
          <span className="text-strong flex items-center gap-1.5 text-sm font-medium" data-tabular>
            <CheckSquare className="text-subtle size-3.5" /> {openTasks} de {tasks.length}
          </span>
        </SummaryCell>
        <SummaryCell label="Responsável">
          {project.owner ? (
            <span className="text-strong flex items-center gap-1.5 text-sm">
              <Avatar name={project.owner.name} src={project.owner.avatarUrl} size="xs" />
              {project.owner.name}
            </span>
          ) : (
            <span className="text-subtle text-sm">Sem responsável</span>
          )}
        </SummaryCell>
        <SummaryCell label="Contrato">
          {project.contract ? (
            <Link
              href={`/contratos/${project.contract.id}`}
              className="text-strong truncate text-sm hover:underline"
            >
              {project.contract.code}
            </Link>
          ) : (
            <span className="text-subtle text-sm">Sem contrato</span>
          )}
          {project.launchedAt && (
            <span className="text-2xs text-success-text">
              Lançado em {formatDate(project.launchedAt)}
            </span>
          )}
        </SummaryCell>
      </section>

      {/* ── Etapas ─────────────────────────────────────────────────────── */}
      {project.stages.length > 0 && (
        <ol className="flex gap-1 overflow-x-auto" aria-label="Etapas do projeto">
          {project.stages.map((stage, index) => {
            const current = stage.id === project.currentStageId
            const done = stage.status === 'done'
            return (
              <li
                key={stage.id}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex min-w-36 flex-1 flex-col gap-1 rounded-md border px-3 py-2',
                  current ? 'border-brand-border bg-brand-soft' : 'border-line bg-raised',
                )}
              >
                <span className="text-2xs text-muted flex items-center gap-1.5">
                  {done ? (
                    <Check className="text-success size-3" />
                  ) : (
                    <span className="font-mono">{index + 1}</span>
                  )}
                  {current
                    ? 'Etapa atual'
                    : done
                      ? 'Concluída'
                      : stage.status === 'skipped'
                        ? 'Pulada'
                        : 'Pendente'}
                </span>
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    current ? 'text-brand-text' : 'text-strong',
                  )}
                >
                  {stage.name}
                </span>
                <span className="text-2xs text-subtle" data-tabular>
                  {stage.done}/{stage.total} tarefas
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {tasks.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<CheckSquare />}
                title="Nenhuma tarefa ainda"
                description="Projetos criados com template já nascem com tarefas. Este foi criado vazio — adicione a primeira."
              />
            </Panel>
          ) : (
            <TaskBoard
              tasks={tasks}
              stages={stages}
              context={{ users, currentUserId: context.user.id, canMove: canEditTasks && !closed }}
            />
          )}
        </div>

        <div className="flex flex-col gap-5">
          <TeamPanel
            projectId={project.id}
            ownerId={project.owner?.id ?? null}
            members={project.members}
            users={users}
            canEdit={canEditProject && !closed}
          />
          {context.can('approvals.read') && (
            <ProjectApprovalsPanel
              projectId={project.id}
              clientId={project.client.id}
              canRequest={
                !closed &&
                context.can('approvals.write') &&
                (context.can('projects.delete') || involved)
              }
              defaultOpen={query.novaAprovacao === '1'}
            />
          )}
          {context.can('scope.read') && (
            <ScopePanel
              rows={scopeChanges}
              linkMode="drawer"
              actions={
                !closed && context.can('scope.write') ? (
                  <ScopeChangeFormDialog
                    projectId={project.id}
                    defaultOpen={query.novaMudanca === '1'}
                    trigger={
                      <Button variant="ghost" size="sm" icon={<Plus />}>
                        Registrar
                      </Button>
                    }
                  />
                ) : undefined
              }
            />
          )}
          {context.can('support.read') && (
            <ProjectTicketsPanel
              projectId={project.id}
              client={project.client}
              canOpen={context.can('support.write')}
              currentUserId={context.user.id}
              canAssign={context.can('support.assign')}
              launched={Boolean(project.launchedAt) || project.status === 'completed'}
            />
          )}
          {filePanel && <FileList {...filePanel} />}
          <Panel>
            <PanelHeader title="Atividade" />
            <ActivityTimeline items={activity} />
          </Panel>
        </div>
      </div>

      {query.tarefa && <TaskDrawerLoader context={context} taskId={query.tarefa} />}
      {query.aprovacao && <ApprovalDrawerLoader context={context} approvalId={query.aprovacao} />}
      {query.escopo && <ScopeDrawerLoader context={context} scopeChangeId={query.escopo} />}
      {query.chamado && <TicketDrawerLoader context={context} ticketId={query.chamado} />}
    </PageContainer>
  )
}

function SummaryCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-raised flex min-w-0 flex-col gap-1 px-4 py-3">
      <span className="text-2xs text-subtle tracking-wide uppercase">{label}</span>
      {children}
    </div>
  )
}
