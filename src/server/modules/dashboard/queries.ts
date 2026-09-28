import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  or,
  sql,
  sum,
} from 'drizzle-orm'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  activities,
  approvals,
  clients,
  contracts,
  opportunities,
  projects,
  proposals,
  supportTickets,
  tasks,
  users,
} from '@/server/db/schema'
import {
  ACTIVE_PROJECT_STATUSES,
  OPEN_APPROVAL_STATUSES,
  OPEN_SUPPORT_STATUSES,
  OPEN_TASK_STATUSES,
  PIPELINE_STAGES,
} from '@/shared/domain'
import { addDaysISO, todayISO } from '@/shared/dates'

/**
 * Dados do dashboard.
 *
 * Tudo é agregação no banco — nenhuma contagem carrega linhas para contar em
 * memória. O painel inteiro precisa caber em poucas dezenas de milissegundos,
 * porque é a primeira tela que abre todo dia.
 *
 * Cada bloco respeita a permissão de quem está olhando: quem não pode ler o
 * comercial não recebe os números do comercial — eles nem são consultados.
 */

const EXPIRY_WINDOW_DAYS = 30

export interface OperationSummary {
  activeProjects: number
  overdueProjects: number
  blockedProjects: number
  waitingClientProjects: number
  overdueTasks: number
  tasksDueToday: number
  pendingApprovals: number
  openTickets: number
  overdueTickets: number
}

export interface CommercialSummary {
  openOpportunities: number
  /** `null` quando a pessoa não tem `crm.values.read`. */
  potentialValue: string | null
  proposalsAwaiting: number
  overdueNextActions: number
}

export interface ContractSummary {
  activeContracts: number
  expiringContracts: number
  expiringSupport: number
  awaitingSignature: number
}

export interface ProjectRow {
  id: string
  code: string
  name: string
  clientName: string
  stageName: string | null
  status: string
  progress: number
  dueDate: string | null
  owner: { id: string; name: string; avatarUrl: string | null } | null
}

export interface ActivityRow {
  id: string
  verb: string
  entityType: string
  entityLabel: string
  summary: string
  createdAt: Date
  actor: { id: string; name: string; avatarUrl: string | null } | null
}

// ── Operação ─────────────────────────────────────────────────────────────────

export async function getOperationSummary(context: AuthContext): Promise<OperationSummary> {
  const today = todayISO()

  const canProjects = context.can('projects.read')
  const canTasks = context.can('tasks.read')
  const canApprovals = context.can('approvals.read')
  const canSupport = context.can('support.read')

  const [projectCounts, taskCounts, approvalCount, ticketCounts] = await Promise.all([
    canProjects
      ? db
          .select({
            active: count(),
            overdue: sql<number>`count(*) filter (where ${projects.dueDate} < ${today})::int`,
            blocked: sql<number>`count(*) filter (where ${projects.status} = 'blocked')::int`,
            waitingClient: sql<number>`count(*) filter (where ${projects.status} = 'waiting_client')::int`,
          })
          .from(projects)
          .where(inArray(projects.status, ACTIVE_PROJECT_STATUSES))
      : Promise.resolve([]),

    canTasks
      ? db
          .select({
            overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today})::int`,
            dueToday: sql<number>`count(*) filter (where ${tasks.dueDate} = ${today})::int`,
          })
          .from(tasks)
          .where(inArray(tasks.status, OPEN_TASK_STATUSES))
      : Promise.resolve([]),

    canApprovals
      ? db
          .select({ total: count() })
          .from(approvals)
          .where(inArray(approvals.status, OPEN_APPROVAL_STATUSES))
      : Promise.resolve([]),

    canSupport
      ? db
          .select({
            open: count(),
            overdue: sql<number>`count(*) filter (where ${supportTickets.dueAt} < now())::int`,
          })
          .from(supportTickets)
          .where(inArray(supportTickets.status, OPEN_SUPPORT_STATUSES))
      : Promise.resolve([]),
  ])

  return {
    activeProjects: projectCounts[0]?.active ?? 0,
    overdueProjects: projectCounts[0]?.overdue ?? 0,
    blockedProjects: projectCounts[0]?.blocked ?? 0,
    waitingClientProjects: projectCounts[0]?.waitingClient ?? 0,
    overdueTasks: taskCounts[0]?.overdue ?? 0,
    tasksDueToday: taskCounts[0]?.dueToday ?? 0,
    pendingApprovals: approvalCount[0]?.total ?? 0,
    openTickets: ticketCounts[0]?.open ?? 0,
    overdueTickets: ticketCounts[0]?.overdue ?? 0,
  }
}

// ── Comercial ────────────────────────────────────────────────────────────────

export async function getCommercialSummary(
  context: AuthContext,
): Promise<CommercialSummary | null> {
  if (!context.can('crm.read')) return null

  const today = todayISO()
  const canSeeValues = context.can('crm.values.read')

  const [pipeline, proposalCount] = await Promise.all([
    db
      .select({
        total: count(),
        value: canSeeValues ? sum(opportunities.estimatedValue) : sql<null>`null`,
        overdueActions: sql<number>`count(*) filter (where ${opportunities.nextActionAt} < ${today})::int`,
      })
      .from(opportunities)
      .where(inArray(opportunities.stage, PIPELINE_STAGES)),

    db
      .select({ total: count() })
      .from(proposals)
      .where(inArray(proposals.status, ['sent', 'under_review'])),
  ])

  return {
    openOpportunities: pipeline[0]?.total ?? 0,
    // Valor só é consultado — e só sai do servidor — com a permissão certa.
    potentialValue: canSeeValues ? (pipeline[0]?.value ?? '0') : null,
    proposalsAwaiting: proposalCount[0]?.total ?? 0,
    overdueNextActions: pipeline[0]?.overdueActions ?? 0,
  }
}

// ── Contratos ────────────────────────────────────────────────────────────────

export async function getContractSummary(context: AuthContext): Promise<ContractSummary | null> {
  if (!context.can('contracts.read')) return null

  const today = todayISO()
  const horizon = addDaysISO(today, EXPIRY_WINDOW_DAYS)

  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${contracts.status} = 'active')::int`,
      awaitingSignature: sql<number>`count(*) filter (where ${contracts.status} = 'awaiting_signature')::int`,
      expiring: sql<number>`count(*) filter (where ${contracts.status} = 'active' and ${contracts.endDate} between ${today} and ${horizon})::int`,
      expiringSupport: sql<number>`count(*) filter (where ${contracts.supportEndsAt} between ${today} and ${horizon})::int`,
    })
    .from(contracts)

  return {
    activeContracts: row?.active ?? 0,
    expiringContracts: row?.expiring ?? 0,
    expiringSupport: row?.expiringSupport ?? 0,
    awaitingSignature: row?.awaitingSignature ?? 0,
  }
}

// ── Visão de projetos ────────────────────────────────────────────────────────

export async function getProjectOverview(context: AuthContext, limit = 8): Promise<ProjectRow[]> {
  if (!context.can('projects.read')) return []

  const today = todayISO()

  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      progress: projects.progress,
      dueDate: projects.dueDate,
      clientName: clients.name,
      stageName: sql<string | null>`(
        select ps.name from project_stages ps where ps.id = ${projects.currentStageId}
      )`,
      ownerId: users.id,
      ownerName: users.name,
      ownerAvatar: users.avatarUrl,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(inArray(projects.status, ACTIVE_PROJECT_STATUSES))
    // Problema primeiro: bloqueado e atrasado no topo, depois por prazo.
    .orderBy(
      sql`case when ${projects.status} = 'blocked' then 0
               when ${projects.dueDate} < ${today} then 1
               when ${projects.status} = 'waiting_client' then 2
               else 3 end`,
      sql`${projects.dueDate} asc nulls last`,
    )
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    clientName: row.clientName,
    stageName: row.stageName,
    status: row.status,
    progress: row.progress,
    dueDate: row.dueDate,
    owner: row.ownerId
      ? { id: row.ownerId, name: row.ownerName ?? '—', avatarUrl: row.ownerAvatar }
      : null,
  }))
}

// ── Feed de atividade ────────────────────────────────────────────────────────

export async function getRecentActivity(_context: AuthContext, limit = 12): Promise<ActivityRow[]> {
  const rows = await db
    .select({
      id: activities.id,
      verb: activities.verb,
      entityType: activities.entityType,
      entityLabel: activities.entityLabel,
      summary: activities.summary,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorAvatar: users.avatarUrl,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .orderBy(desc(activities.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    verb: row.verb,
    entityType: row.entityType,
    entityLabel: row.entityLabel,
    summary: row.summary,
    createdAt: row.createdAt,
    actor: row.actorId
      ? { id: row.actorId, name: row.actorName ?? '—', avatarUrl: row.actorAvatar }
      : null,
  }))
}

// ── Atenção imediata ─────────────────────────────────────────────────────────

export interface AttentionItem {
  id: string
  kind: 'contract_expiring' | 'support_expiring' | 'project_blocked' | 'approval_overdue'
  title: string
  detail: string
  href: string
}

/**
 * Lista curta do que precisa de decisão hoje.
 *
 * Deliberadamente limitada: um alerta que aparece sempre deixa de ser alerta.
 */
export async function getAttentionItems(context: AuthContext): Promise<AttentionItem[]> {
  const today = todayISO()
  const horizon = addDaysISO(today, EXPIRY_WINDOW_DAYS)
  const items: AttentionItem[] = []

  if (context.can('contracts.read')) {
    const expiring = await db
      .select({
        id: contracts.id,
        code: contracts.code,
        title: contracts.title,
        endDate: contracts.endDate,
        supportEndsAt: contracts.supportEndsAt,
        clientName: clients.name,
      })
      .from(contracts)
      .innerJoin(clients, eq(clients.id, contracts.clientId))
      .where(
        and(
          eq(contracts.status, 'active'),
          or(
            and(gte(contracts.endDate, today), lte(contracts.endDate, horizon)),
            and(gte(contracts.supportEndsAt, today), lte(contracts.supportEndsAt, horizon)),
          ),
        ),
      )
      .orderBy(
        sql`least(coalesce(${contracts.endDate}, 'infinity'::date), coalesce(${contracts.supportEndsAt}, 'infinity'::date))`,
      )
      .limit(5)

    for (const contract of expiring) {
      const contractExpiring =
        contract.endDate && contract.endDate >= today && contract.endDate <= horizon

      items.push({
        id: contract.id,
        kind: contractExpiring ? 'contract_expiring' : 'support_expiring',
        title: contract.title,
        detail: contractExpiring
          ? `${contract.clientName} · vence em ${contract.endDate}`
          : `${contract.clientName} · suporte termina em ${contract.supportEndsAt}`,
        href: `/contratos/${contract.id}`,
      })
    }
  }

  if (context.can('projects.read')) {
    const blocked = await db
      .select({
        id: projects.id,
        name: projects.name,
        blockedReason: projects.blockedReason,
        clientName: clients.name,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(eq(projects.status, 'blocked'))
      .orderBy(sql`${projects.blockedSince} asc nulls last`)
      .limit(5)

    for (const project of blocked) {
      items.push({
        id: project.id,
        kind: 'project_blocked',
        title: project.name,
        detail: `${project.clientName} · ${project.blockedReason ?? 'sem motivo registrado'}`,
        href: `/projetos/${project.id}`,
      })
    }
  }

  if (context.can('approvals.read')) {
    const overdue = await db
      .select({
        id: approvals.id,
        title: approvals.title,
        dueDate: approvals.dueDate,
        clientName: clients.name,
      })
      .from(approvals)
      .innerJoin(clients, eq(clients.id, approvals.clientId))
      .where(
        and(
          inArray(approvals.status, OPEN_APPROVAL_STATUSES),
          isNotNull(approvals.dueDate),
          lt(approvals.dueDate, today),
        ),
      )
      .orderBy(approvals.dueDate)
      .limit(5)

    for (const approval of overdue) {
      items.push({
        id: approval.id,
        kind: 'approval_overdue',
        title: approval.title,
        detail: `${approval.clientName} · prazo em ${approval.dueDate}`,
        href: `/aprovacoes?aprovacao=${approval.id}`,
      })
    }
  }

  return items.slice(0, 8)
}

/** Contagem de clientes ativos — usada no cabeçalho do dashboard. */
export async function getActiveClientCount(context: AuthContext): Promise<number | null> {
  if (!context.can('clients.read')) return null

  const [row] = await db
    .select({ total: count() })
    .from(clients)
    .where(and(ne(clients.status, 'archived'), sql`${clients.deletedAt} is null`))

  return row?.total ?? 0
}
