import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import { isUuid } from '@/shared/ids'
import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  activities,
  approvals,
  scopeChanges,
  clients,
  comments,
  projectStages,
  projects,
  taskChecklistItems,
  taskDependencies,
  taskDevDetails,
  tasks,
  users,
} from '@/server/db/schema'
import {
  buildPageResult,
  normalizePage,
  normalizePageSize,
  toOffset,
  type PageResult,
} from '@/server/pagination'
import { addDaysISO, todayISO } from '@/shared/dates'
import { DEV_TASK_TYPES, OPEN_TASK_STATUSES } from '@/shared/domain'
import type { TaskListFilter } from '@/shared/schemas/tasks'

/**
 * Leituras de tarefas.
 *
 * O mesmo formato de linha (`TaskCard`) serve ao quadro do projeto, à lista
 * geral, à área DEV e ao "Meu trabalho" — são recortes diferentes das mesmas
 * tarefas, não sistemas diferentes (item 15 do produto).
 */

type TaskRow = typeof tasks.$inferSelect

export interface TaskCard {
  id: string
  code: string
  title: string
  status: TaskRow['status']
  priority: TaskRow['priority']
  type: TaskRow['type']
  dueDate: string | null
  stageId: string | null
  position: number
  blockedReason: string | null
  projectId: string
  projectName: string
  clientName: string
  assignee: { id: string; name: string; avatarUrl: string | null } | null
  checklistTotal: number
  checklistDone: number
  commentCount: number
  openDependencies: number
}

const assignee = aliasedTable(users, 'assignee')

function cardSelection() {
  return {
    id: tasks.id,
    code: tasks.code,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
    type: tasks.type,
    dueDate: tasks.dueDate,
    stageId: tasks.stageId,
    position: tasks.position,
    blockedReason: tasks.blockedReason,
    projectId: projects.id,
    projectName: projects.name,
    clientName: clients.name,
    assigneeId: assignee.id,
    assigneeName: assignee.name,
    assigneeAvatar: assignee.avatarUrl,
    checklistTotal: sql<number>`(select count(*)::int from ${taskChecklistItems} where ${taskChecklistItems.taskId} = ${tasks.id})`,
    checklistDone: sql<number>`(select count(*)::int from ${taskChecklistItems} where ${taskChecklistItems.taskId} = ${tasks.id} and ${taskChecklistItems.isDone})`,
    commentCount: sql<number>`(select count(*)::int from ${comments} where ${comments.taskId} = ${tasks.id} and ${comments.deletedAt} is null)`,
    openDependencies: sql<number>`(
      select count(*)::int from ${taskDependencies} d
      join ${tasks} dep on dep.id = d.depends_on_task_id
      where d.task_id = ${tasks.id} and d.type = 'blocks' and dep.status not in ('done', 'cancelled')
    )`,
  }
}

function baseCardQuery() {
  return db
    .select(cardSelection())
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
}

type CardRow = Awaited<ReturnType<typeof baseCardQuery>>[number]

function toCard(row: CardRow): TaskCard {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    priority: row.priority,
    type: row.type,
    dueDate: row.dueDate,
    stageId: row.stageId,
    position: row.position,
    blockedReason: row.blockedReason,
    projectId: row.projectId,
    projectName: row.projectName,
    clientName: row.clientName,
    assignee: row.assigneeId
      ? { id: row.assigneeId, name: row.assigneeName ?? '—', avatarUrl: row.assigneeAvatar }
      : null,
    checklistTotal: row.checklistTotal,
    checklistDone: row.checklistDone,
    commentCount: row.commentCount,
    openDependencies: row.openDependencies,
  }
}

// ── Quadro do projeto ────────────────────────────────────────────────────────

export async function listProjectTasks(
  context: AuthContext,
  projectId: string,
): Promise<TaskCard[]> {
  if (!context.can('tasks.read')) return []

  const rows = await baseCardQuery()
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentTaskId)))
    .orderBy(asc(tasks.position))

  return rows.map(toCard)
}

// ── Lista geral ──────────────────────────────────────────────────────────────

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function listTasks(
  context: AuthContext,
  filter: Partial<TaskListFilter> & { pageSize?: number },
): Promise<PageResult<TaskCard>> {
  const page = normalizePage(filter.page)
  const pageSize = normalizePageSize(filter.pageSize)

  if (!context.can('tasks.read')) return buildPageResult([], 0, page, pageSize)

  const today = todayISO()
  const conditions: SQL[] = []

  if (filter.status) conditions.push(eq(tasks.status, filter.status))
  if (filter.priority) conditions.push(eq(tasks.priority, filter.priority))
  if (filter.type) conditions.push(eq(tasks.type, filter.type))
  if (filter.projectId) conditions.push(eq(tasks.projectId, filter.projectId))
  if (filter.assigneeId) conditions.push(eq(tasks.assigneeId, filter.assigneeId))

  if (filter.filtro === 'atrasadas') {
    conditions.push(lt(tasks.dueDate, today), inArray(tasks.status, OPEN_TASK_STATUSES))
  } else if (filter.filtro === 'hoje') {
    conditions.push(eq(tasks.dueDate, today), inArray(tasks.status, OPEN_TASK_STATUSES))
  } else if (filter.filtro === 'bloqueadas') {
    conditions.push(eq(tasks.status, 'blocked'))
  } else if (filter.filtro === 'dev') {
    conditions.push(inArray(tasks.type, DEV_TASK_TYPES))
  }

  const trimmed = filter.q?.trim()
  if (trimmed) {
    const pattern = `%${escapeLike(trimmed)}%`
    const search = or(ilike(tasks.title, pattern), ilike(tasks.code, pattern))
    if (search) conditions.push(search)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, totalRow] = await Promise.all([
    baseCardQuery()
      .where(where)
      // Atrasadas e urgentes primeiro, depois por prazo.
      .orderBy(
        sql`case when ${tasks.status} in ('done', 'cancelled') then 1 else 0 end`,
        sql`${tasks.dueDate} asc nulls last`,
        sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
      )
      .limit(pageSize)
      .offset(toOffset(page, pageSize)),
    db.select({ total: count() }).from(tasks).where(where),
  ])

  return buildPageResult(rows.map(toCard), totalRow[0]?.total ?? 0, page, pageSize)
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export interface TaskDetail {
  id: string
  code: string
  title: string
  description: string | null
  status: TaskRow['status']
  priority: TaskRow['priority']
  type: TaskRow['type']
  startDate: string | null
  dueDate: string | null
  estimateHours: string | null
  spentHours: string | null
  completedAt: Date | null
  createdAt: Date
  blockedReason: string | null
  blockedSince: Date | null
  blockedOwner: { id: string; name: string } | null
  project: {
    id: string
    code: string
    name: string
    status: string
    clientId: string
    clientName: string
  }
  stage: { id: string; name: string } | null
  assignee: { id: string; name: string; avatarUrl: string | null } | null
  creator: { id: string; name: string } | null
  checklist: { id: string; title: string; isDone: boolean }[]
  comments: {
    id: string
    body: string
    createdAt: Date
    author: { id: string; name: string; avatarUrl: string | null } | null
  }[]
  dependsOn: { id: string; code: string; title: string; status: TaskRow['status'] }[]
  blocks: { id: string; code: string; title: string; status: TaskRow['status'] }[]
  devDetails: {
    repository: string | null
    branch: string | null
    pullRequestUrl: string | null
    environment: string | null
    version: string | null
    release: string | null
  } | null
  history: {
    id: string
    summary: string
    createdAt: Date
    actor: { id: string; name: string; avatarUrl: string | null } | null
  }[]
}

export async function getTaskDetail(
  context: AuthContext,
  taskId: string,
): Promise<TaskDetail | null> {
  if (!context.can('tasks.read') || !isUuid(taskId)) return null

  const creator = aliasedTable(users, 'creator')
  const blockedOwner = aliasedTable(users, 'blocked_owner')

  const [row] = await db
    .select({
      task: tasks,
      projectCode: projects.code,
      projectName: projects.name,
      projectStatus: projects.status,
      clientId: clients.id,
      clientName: clients.name,
      stageName: projectStages.name,
      assigneeName: assignee.name,
      assigneeAvatar: assignee.avatarUrl,
      creatorName: creator.name,
      blockedOwnerName: blockedOwner.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(projectStages, eq(projectStages.id, tasks.stageId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(creator, eq(creator.id, tasks.createdBy))
    .leftJoin(blockedOwner, eq(blockedOwner.id, tasks.blockedOwnerId))
    .where(eq(tasks.id, taskId))
    .limit(1)

  if (!row) return null
  const task = row.task
  const author = aliasedTable(users, 'author')
  const actor = aliasedTable(users, 'actor')
  const dependency = aliasedTable(tasks, 'dependency')

  const [checklist, commentRows, dependsOn, blocks, dev, history] = await Promise.all([
    db
      .select({
        id: taskChecklistItems.id,
        title: taskChecklistItems.title,
        isDone: taskChecklistItems.isDone,
      })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(asc(taskChecklistItems.position)),
    db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        authorId: author.id,
        authorName: author.name,
        authorAvatar: author.avatarUrl,
      })
      .from(comments)
      .leftJoin(author, eq(author.id, comments.authorId))
      .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt)),
    db
      .select({
        id: dependency.id,
        code: dependency.code,
        title: dependency.title,
        status: dependency.status,
      })
      .from(taskDependencies)
      .innerJoin(dependency, eq(dependency.id, taskDependencies.dependsOnTaskId))
      .where(eq(taskDependencies.taskId, taskId)),
    db
      .select({
        id: dependency.id,
        code: dependency.code,
        title: dependency.title,
        status: dependency.status,
      })
      .from(taskDependencies)
      .innerJoin(dependency, eq(dependency.id, taskDependencies.taskId))
      .where(eq(taskDependencies.dependsOnTaskId, taskId)),
    db.query.taskDevDetails.findFirst({ where: eq(taskDevDetails.taskId, taskId) }),
    db
      .select({
        id: activities.id,
        summary: activities.summary,
        createdAt: activities.createdAt,
        actorId: actor.id,
        actorName: actor.name,
        actorAvatar: actor.avatarUrl,
      })
      .from(activities)
      .leftJoin(actor, eq(actor.id, activities.actorId))
      .where(and(eq(activities.entityType, 'task'), eq(activities.entityId, taskId)))
      .orderBy(desc(activities.createdAt))
      .limit(30),
  ])

  return {
    id: task.id,
    code: task.code,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    type: task.type,
    startDate: task.startDate,
    dueDate: task.dueDate,
    estimateHours: task.estimateHours,
    spentHours: task.spentHours,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    blockedReason: task.blockedReason,
    blockedSince: task.blockedSince,
    blockedOwner: task.blockedOwnerId
      ? { id: task.blockedOwnerId, name: row.blockedOwnerName ?? '—' }
      : null,
    project: {
      id: task.projectId,
      code: row.projectCode,
      name: row.projectName,
      status: row.projectStatus,
      clientId: row.clientId,
      clientName: row.clientName,
    },
    stage: task.stageId ? { id: task.stageId, name: row.stageName ?? '—' } : null,
    assignee: task.assigneeId
      ? { id: task.assigneeId, name: row.assigneeName ?? '—', avatarUrl: row.assigneeAvatar }
      : null,
    creator: task.createdBy ? { id: task.createdBy, name: row.creatorName ?? '—' } : null,
    checklist,
    comments: commentRows.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      author: comment.authorId
        ? { id: comment.authorId, name: comment.authorName ?? '—', avatarUrl: comment.authorAvatar }
        : null,
    })),
    dependsOn,
    blocks,
    devDetails: dev
      ? {
          repository: dev.repository,
          branch: dev.branch,
          pullRequestUrl: dev.pullRequestUrl,
          environment: dev.environment,
          version: dev.version,
          release: dev.release,
        }
      : null,
    history: history.map((item) => ({
      id: item.id,
      summary: item.summary,
      createdAt: item.createdAt,
      actor: item.actorId
        ? { id: item.actorId, name: item.actorName ?? '—', avatarUrl: item.actorAvatar }
        : null,
    })),
  }
}

/** Tarefas do mesmo projeto que podem virar predecessoras — alimenta o seletor de dependência. */
export async function listDependencyCandidates(taskId: string, projectId: string) {
  return db
    .select({ id: tasks.id, code: tasks.code, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), ne(tasks.id, taskId)))
    .orderBy(asc(tasks.position))
}

// ── Meu trabalho ─────────────────────────────────────────────────────────────

export interface MyWork {
  overdue: TaskCard[]
  today: TaskCard[]
  upcoming: TaskCard[]
  inReview: TaskCard[]
  blockedByMe: TaskCard[]
  pendingApprovals: MyApproval[]
  /** Aprovações que pedi e voltaram com ajustes — a próxima versão é comigo. */
  approvalsToRevise: MyApproval[]
  /** Mudanças de escopo com análise pronta, para quem decide. */
  scopeDecisions: {
    id: string
    code: string
    title: string
    projectId: string
    projectName: string
  }[]
}

export interface MyApproval {
  id: string
  code: string
  title: string
  projectId: string
  projectName: string
  dueDate: string | null
  currentVersion: number
}

function myApprovalQuery() {
  return db
    .select({
      id: approvals.id,
      code: approvals.code,
      title: approvals.title,
      projectId: projects.id,
      projectName: projects.name,
      dueDate: approvals.dueDate,
      currentVersion: approvals.currentVersion,
    })
    .from(approvals)
    .innerJoin(projects, eq(projects.id, approvals.projectId))
}

/**
 * Tudo o que aponta para a pessoa logada, sem filtro manual (item 8 do
 * produto). Não é informação nova — é a informação existente recortada por
 * responsabilidade.
 */
export async function getMyWork(context: AuthContext): Promise<MyWork> {
  const userId = context.user.id
  const today = todayISO()
  const horizon = addDaysISO(today, 7)
  const mine = eq(tasks.assigneeId, userId)
  const open = inArray(tasks.status, ['todo', 'in_progress', 'in_testing', 'blocked'])

  const canTasks = context.can('tasks.read')
  const empty = Promise.resolve([])

  const [
    overdue,
    dueToday,
    upcoming,
    inReview,
    blockedByMe,
    pendingApprovals,
    approvalsToRevise,
    scopeDecisions,
  ] = await Promise.all([
    canTasks
      ? baseCardQuery()
          .where(and(mine, open, lt(tasks.dueDate, today)))
          .orderBy(asc(tasks.dueDate))
      : empty,
    canTasks
      ? baseCardQuery()
          .where(and(mine, open, eq(tasks.dueDate, today)))
          .orderBy(asc(tasks.position))
      : empty,
    canTasks
      ? baseCardQuery()
          .where(and(mine, open, sql`${tasks.dueDate} > ${today}`, lte(tasks.dueDate, horizon)))
          .orderBy(asc(tasks.dueDate))
      : empty,
    // Revisões que esperam por mim: tarefas de outras pessoas em revisão, em
    // que sou o criador ou o responsável pelo projeto.
    canTasks
      ? baseCardQuery()
          .where(
            and(
              eq(tasks.status, 'in_review'),
              or(isNull(tasks.assigneeId), ne(tasks.assigneeId, userId)),
              or(eq(tasks.createdBy, userId), eq(projects.ownerId, userId)),
            ),
          )
          .orderBy(asc(tasks.dueDate))
      : empty,
    // Bloqueios que dependem de mim para destravar — mesmo que a tarefa seja de outra pessoa.
    canTasks
      ? baseCardQuery()
          .where(and(eq(tasks.status, 'blocked'), eq(tasks.blockedOwnerId, userId)))
          .orderBy(asc(tasks.blockedSince))
      : empty,
    context.can('approvals.decide')
      ? myApprovalQuery()
          .where(and(eq(approvals.status, 'pending'), eq(approvals.approverUserId, userId)))
          .orderBy(sql`${approvals.dueDate} asc nulls last`)
      : empty,
    context.can('approvals.write')
      ? myApprovalQuery()
          .where(and(eq(approvals.status, 'changes_requested'), eq(approvals.requestedBy, userId)))
          .orderBy(sql`${approvals.dueDate} asc nulls last`)
      : empty,
    context.can('scope.decide')
      ? db
          .select({
            id: scopeChanges.id,
            code: scopeChanges.code,
            title: scopeChanges.title,
            projectId: projects.id,
            projectName: projects.name,
          })
          .from(scopeChanges)
          .innerJoin(projects, eq(projects.id, scopeChanges.projectId))
          .where(eq(scopeChanges.status, 'awaiting_approval'))
          .orderBy(asc(scopeChanges.updatedAt))
      : empty,
  ])

  return {
    overdue: overdue.map(toCard),
    today: dueToday.map(toCard),
    upcoming: upcoming.map(toCard),
    inReview: inReview.map(toCard),
    blockedByMe: blockedByMe.map(toCard),
    pendingApprovals,
    approvalsToRevise,
    scopeDecisions,
  }
}
