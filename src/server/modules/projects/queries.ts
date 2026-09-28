import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
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
  clients,
  contracts,
  projectMembers,
  projectStages,
  projectTemplates,
  projects,
  tasks,
  users,
} from '@/server/db/schema'
import {
  buildPageResult,
  normalizePage,
  normalizePageSize,
  toOffset,
  type PageInput,
  type PageResult,
} from '@/server/pagination'
import { todayISO } from '@/shared/dates'
import {
  ACTIVE_PROJECT_STATUSES,
  OPEN_APPROVAL_STATUSES,
  type ProjectStatus,
} from '@/shared/domain'

type ProjectRow = typeof projects.$inferSelect

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface TemplateOption {
  id: string
  name: string
  description: string | null
}

export async function listTemplateOptions(): Promise<TemplateOption[]> {
  return db
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      description: projectTemplates.description,
    })
    .from(projectTemplates)
    .where(eq(projectTemplates.isActive, true))
    .orderBy(projectTemplates.name)
}

// ── Lista ────────────────────────────────────────────────────────────────────

export interface ProjectListItem {
  id: string
  code: string
  name: string
  status: ProjectRow['status']
  progress: number
  dueDate: string | null
  clientName: string
  stageName: string | null
  owner: { id: string; name: string; avatarUrl: string | null } | null
  openTasks: number
  overdueTasks: number
}

export interface ProjectListFilter extends PageInput {
  q?: string
  status?: ProjectStatus
  /** `atrasados` e `ativos` são os recortes que o dashboard linka. */
  filtro?: 'atrasados' | 'ativos' | 'bloqueados'
  ownerId?: string
}

export async function listProjects(
  context: AuthContext,
  filter: ProjectListFilter,
): Promise<PageResult<ProjectListItem>> {
  const page = normalizePage(filter.page)
  const pageSize = normalizePageSize(filter.pageSize)
  if (!context.can('projects.read')) return buildPageResult([], 0, page, pageSize)

  const today = todayISO()
  const conditions: SQL[] = []

  if (filter.status) conditions.push(eq(projects.status, filter.status))
  if (filter.ownerId) conditions.push(eq(projects.ownerId, filter.ownerId))

  if (filter.filtro === 'atrasados') {
    conditions.push(inArray(projects.status, ACTIVE_PROJECT_STATUSES), lt(projects.dueDate, today))
  } else if (filter.filtro === 'ativos') {
    conditions.push(inArray(projects.status, ACTIVE_PROJECT_STATUSES))
  } else if (filter.filtro === 'bloqueados') {
    conditions.push(eq(projects.status, 'blocked'))
  }

  const trimmed = filter.q?.trim()
  if (trimmed) {
    const pattern = `%${escapeLike(trimmed)}%`
    const search = or(
      ilike(projects.name, pattern),
      ilike(projects.code, pattern),
      ilike(clients.name, pattern),
    )
    if (search) conditions.push(search)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const owner = aliasedTable(users, 'owner')

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        status: projects.status,
        progress: projects.progress,
        dueDate: projects.dueDate,
        clientName: clients.name,
        stageName: projectStages.name,
        ownerId: owner.id,
        ownerName: owner.name,
        ownerAvatar: owner.avatarUrl,
        openTasks: sql<number>`(
          select count(*)::int from ${tasks}
          where ${tasks.projectId} = ${projects.id} and ${tasks.status} not in ('done', 'cancelled')
        )`,
        overdueTasks: sql<number>`(
          select count(*)::int from ${tasks}
          where ${tasks.projectId} = ${projects.id}
            and ${tasks.status} not in ('done', 'cancelled')
            and ${tasks.dueDate} < ${today}
        )`,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(projectStages, eq(projectStages.id, projects.currentStageId))
      .leftJoin(owner, eq(owner.id, projects.ownerId))
      .where(where)
      // Problema primeiro: bloqueado, depois atrasado, depois por prazo.
      .orderBy(
        sql`case when ${projects.status} in ('completed', 'cancelled') then 2
                 when ${projects.status} = 'blocked' then 0
                 when ${projects.dueDate} < ${today} then 0
                 else 1 end`,
        sql`${projects.dueDate} asc nulls last`,
      )
      .limit(pageSize)
      .offset(toOffset(page, pageSize)),
    db
      .select({ total: count() })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(where),
  ])

  const items = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    progress: row.progress,
    dueDate: row.dueDate,
    clientName: row.clientName,
    stageName: row.stageName,
    owner: row.ownerId
      ? { id: row.ownerId, name: row.ownerName ?? '—', avatarUrl: row.ownerAvatar }
      : null,
    openTasks: row.openTasks,
    overdueTasks: row.overdueTasks,
  }))

  return buildPageResult(items, totalRow[0]?.total ?? 0, page, pageSize)
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export interface ProjectStageSummary {
  id: string
  name: string
  status: (typeof projectStages.$inferSelect)['status']
  position: number
  total: number
  done: number
}

export interface ProjectMember {
  id: string
  name: string
  avatarUrl: string | null
  jobTitle: string | null
  roleInProject: string | null
}

export interface ProjectDetail {
  id: string
  code: string
  name: string
  description: string | null
  status: ProjectRow['status']
  progress: number
  startDate: string | null
  dueDate: string | null
  launchedAt: Date | null
  completedAt: Date | null
  cancellationReason: string | null
  blockedReason: string | null
  blockedSince: Date | null
  blockedOwner: { id: string; name: string } | null
  client: { id: string; name: string }
  contract: { id: string; code: string; title: string } | null
  owner: { id: string; name: string; avatarUrl: string | null } | null
  currentStageId: string | null
  stages: ProjectStageSummary[]
  members: ProjectMember[]
  openApprovals: number
}

export async function getProjectDetail(
  context: AuthContext,
  projectId: string,
): Promise<ProjectDetail | null> {
  if (!context.can('projects.read') || !isUuid(projectId)) return null

  const owner = aliasedTable(users, 'owner')
  const blockedOwner = aliasedTable(users, 'blocked_owner')

  const [row] = await db
    .select({
      project: projects,
      clientName: clients.name,
      contractCode: contracts.code,
      contractTitle: contracts.title,
      ownerName: owner.name,
      ownerAvatar: owner.avatarUrl,
      blockedOwnerName: blockedOwner.name,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(contracts, eq(contracts.id, projects.contractId))
    .leftJoin(owner, eq(owner.id, projects.ownerId))
    .leftJoin(blockedOwner, eq(blockedOwner.id, projects.blockedOwnerId))
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!row) return null
  const project = row.project

  const [stages, members, approvalCount] = await Promise.all([
    db
      .select({
        id: projectStages.id,
        name: projectStages.name,
        status: projectStages.status,
        position: projectStages.position,
        total: sql<number>`(select count(*)::int from ${tasks} where ${tasks.stageId} = ${projectStages.id} and ${tasks.status} <> 'cancelled')`,
        done: sql<number>`(select count(*)::int from ${tasks} where ${tasks.stageId} = ${projectStages.id} and ${tasks.status} = 'done')`,
      })
      .from(projectStages)
      .where(eq(projectStages.projectId, projectId))
      .orderBy(asc(projectStages.position)),
    db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        jobTitle: users.jobTitle,
        roleInProject: projectMembers.roleInProject,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(users.name)),
    context.can('approvals.read')
      ? db
          .select({ total: count() })
          .from(approvals)
          .where(
            and(
              eq(approvals.projectId, projectId),
              inArray(approvals.status, OPEN_APPROVAL_STATUSES),
            ),
          )
      : Promise.resolve([{ total: 0 }]),
  ])

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    status: project.status,
    progress: project.progress,
    startDate: project.startDate,
    dueDate: project.dueDate,
    launchedAt: project.launchedAt,
    completedAt: project.completedAt,
    cancellationReason: project.cancellationReason,
    blockedReason: project.blockedReason,
    blockedSince: project.blockedSince,
    blockedOwner: project.blockedOwnerId
      ? { id: project.blockedOwnerId, name: row.blockedOwnerName ?? '—' }
      : null,
    client: { id: project.clientId, name: row.clientName },
    contract:
      project.contractId && row.contractCode
        ? { id: project.contractId, code: row.contractCode, title: row.contractTitle ?? '' }
        : null,
    owner: project.ownerId
      ? { id: project.ownerId, name: row.ownerName ?? '—', avatarUrl: row.ownerAvatar }
      : null,
    currentStageId: project.currentStageId,
    stages,
    members,
    openApprovals: approvalCount[0]?.total ?? 0,
  }
}

export interface ProjectActivityRow {
  id: string
  summary: string
  createdAt: Date
  actor: { id: string; name: string; avatarUrl: string | null } | null
}

export async function listProjectActivity(
  projectId: string,
  limit = 25,
): Promise<ProjectActivityRow[]> {
  const actor = aliasedTable(users, 'actor')

  const rows = await db
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
    .where(eq(activities.projectId, projectId))
    .orderBy(desc(activities.createdAt))
    .limit(limit)

  return rows.map((item) => ({
    id: item.id,
    summary: item.summary,
    createdAt: item.createdAt,
    actor: item.actorId
      ? { id: item.actorId, name: item.actorName ?? '—', avatarUrl: item.actorAvatar }
      : null,
  }))
}

export interface ProjectOption {
  id: string
  code: string
  name: string
}

/**
 * Projetos onde ainda cabe trabalho novo — alimenta os seletores de "Nova
 * tarefa" e "Pedir aprovação".
 *
 * Com `involvedUserId`, só os projetos em que a pessoa é responsável ou membro:
 * quem não tem gestão ampla não pode criar nada fora deles, e oferecer um
 * projeto que o servidor vai recusar é só um erro adiado.
 */
export async function listOpenProjectOptions(
  options: { involvedUserId?: string } = {},
): Promise<ProjectOption[]> {
  const userId = options.involvedUserId
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(
      and(
        inArray(projects.status, ACTIVE_PROJECT_STATUSES),
        userId
          ? sql`(${projects.ownerId} = ${userId} or exists (
              select 1 from ${projectMembers}
              where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.userId} = ${userId}
            ))`
          : undefined,
      ),
    )
    .orderBy(asc(projects.name))
}
