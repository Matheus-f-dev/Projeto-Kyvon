import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'

import { isUuid } from '@/shared/ids'
import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  activities,
  cases,
  clients,
  contacts,
  contracts,
  leadSources,
  opportunities,
  projects,
  supportTickets,
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
import type { ClientListFilter } from '@/shared/schemas/clients'

/**
 * Leituras de clientes.
 *
 * A página do cliente funciona como central de relacionamento (item 9 do
 * produto): esta consulta reúne, em paralelo, tudo que ela precisa mostrar.
 */

export interface ClientListItem {
  id: string
  code: string
  name: string
  tradeName: string | null
  status: (typeof clients.$inferSelect)['status']
  segment: string | null
  city: string | null
  state: string | null
  lastContactAt: Date | null
  owner: { id: string; name: string; avatarUrl: string | null } | null
  openOpportunities: number
  activeProjects: number
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function listClients(
  filter: ClientListFilter & PageInput,
): Promise<PageResult<ClientListItem>> {
  const page = normalizePage(filter.page)
  const pageSize = normalizePageSize(filter.pageSize)

  const conditions = [isNull(clients.deletedAt)]
  if (filter.status) conditions.push(eq(clients.status, filter.status))
  if (filter.ownerId) conditions.push(eq(clients.ownerId, filter.ownerId))

  const trimmedQuery = filter.q?.trim()
  if (trimmedQuery) {
    const pattern = `%${escapeLike(trimmedQuery)}%`
    const searchCondition = or(
      ilike(clients.name, pattern),
      ilike(clients.tradeName, pattern),
      ilike(clients.code, pattern),
      ilike(clients.document, pattern),
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  const where = and(...conditions)

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: clients.id,
        code: clients.code,
        name: clients.name,
        tradeName: clients.tradeName,
        status: clients.status,
        segment: clients.segment,
        city: clients.addressCity,
        state: clients.addressState,
        lastContactAt: clients.lastContactAt,
        ownerId: users.id,
        ownerName: users.name,
        ownerAvatar: users.avatarUrl,
        openOpportunities: sql<number>`(
          select count(*)::int from ${opportunities}
          where ${opportunities.clientId} = ${clients.id}
            and ${opportunities.stage} not in ('won', 'lost')
        )`,
        activeProjects: sql<number>`(
          select count(*)::int from ${projects}
          where ${projects.clientId} = ${clients.id}
            and ${projects.status} not in ('completed', 'cancelled')
        )`,
      })
      .from(clients)
      .leftJoin(users, eq(users.id, clients.ownerId))
      .where(where)
      .orderBy(desc(clients.lastContactAt), clients.name)
      .limit(pageSize)
      .offset(toOffset(page, pageSize)),

    db.select({ total: count() }).from(clients).where(where),
  ])

  const items: ClientListItem[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    tradeName: row.tradeName,
    status: row.status,
    segment: row.segment,
    city: row.city,
    state: row.state,
    lastContactAt: row.lastContactAt,
    owner: row.ownerId
      ? { id: row.ownerId, name: row.ownerName ?? '—', avatarUrl: row.ownerAvatar }
      : null,
    openOpportunities: row.openOpportunities,
    activeProjects: row.activeProjects,
  }))

  return buildPageResult(items, totalRow[0]?.total ?? 0, page, pageSize)
}

export interface ClientOption {
  id: string
  name: string
  code: string
}

/** Lista enxuta para selects — nunca a lista completa carregada à toa. */
export async function listClientOptions(query?: string): Promise<ClientOption[]> {
  const conditions = [isNull(clients.deletedAt)]

  const trimmedQuery = query?.trim()
  if (trimmedQuery) {
    const pattern = `%${escapeLike(trimmedQuery)}%`
    const searchCondition = or(ilike(clients.name, pattern), ilike(clients.code, pattern))
    if (searchCondition) conditions.push(searchCondition)
  }

  return db
    .select({ id: clients.id, name: clients.name, code: clients.code })
    .from(clients)
    .where(and(...conditions))
    .orderBy(clients.name)
    .limit(20)
}

export interface ClientDetail {
  id: string
  code: string
  name: string
  tradeName: string | null
  document: string | null
  email: string | null
  phone: string | null
  website: string | null
  segment: string | null
  status: (typeof clients.$inferSelect)['status']
  notes: string | null
  city: string | null
  state: string | null
  lastContactAt: Date | null
  createdAt: Date
  owner: { id: string; name: string; avatarUrl: string | null } | null
  source: { id: string; name: string } | null
}

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  if (!isUuid(clientId)) return null
  const row = await db
    .select({
      id: clients.id,
      code: clients.code,
      name: clients.name,
      tradeName: clients.tradeName,
      document: clients.document,
      email: clients.email,
      phone: clients.phone,
      website: clients.website,
      segment: clients.segment,
      status: clients.status,
      notes: clients.notes,
      city: clients.addressCity,
      state: clients.addressState,
      lastContactAt: clients.lastContactAt,
      createdAt: clients.createdAt,
      ownerId: users.id,
      ownerName: users.name,
      ownerAvatar: users.avatarUrl,
      sourceId: leadSources.id,
      sourceName: leadSources.name,
    })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.ownerId))
    .leftJoin(leadSources, eq(leadSources.id, clients.sourceId))
    .where(eq(clients.id, clientId))
    .limit(1)

  const client = row[0]
  if (!client) return null

  return {
    id: client.id,
    code: client.code,
    name: client.name,
    tradeName: client.tradeName,
    document: client.document,
    email: client.email,
    phone: client.phone,
    website: client.website,
    segment: client.segment,
    status: client.status,
    notes: client.notes,
    city: client.city,
    state: client.state,
    lastContactAt: client.lastContactAt,
    createdAt: client.createdAt,
    owner: client.ownerId
      ? { id: client.ownerId, name: client.ownerName ?? '—', avatarUrl: client.ownerAvatar }
      : null,
    source: client.sourceId ? { id: client.sourceId, name: client.sourceName ?? '—' } : null,
  }
}

export interface ClientContact {
  id: string
  name: string
  jobTitle: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  canApprove: boolean
}

export async function listClientContacts(clientId: string): Promise<ClientContact[]> {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      jobTitle: contacts.jobTitle,
      email: contacts.email,
      phone: contacts.phone,
      isPrimary: contacts.isPrimary,
      canApprove: contacts.canApprove,
    })
    .from(contacts)
    .where(and(eq(contacts.clientId, clientId), isNull(contacts.deletedAt)))
    .orderBy(desc(contacts.isPrimary), contacts.name)
}

export interface ClientOpportunityRow {
  id: string
  code: string
  title: string
  stage: (typeof opportunities.$inferSelect)['stage']
  estimatedValue: string | null
  ownerName: string | null
  updatedAt: Date
}

export async function listClientOpportunities(
  context: AuthContext,
  clientId: string,
): Promise<ClientOpportunityRow[]> {
  if (!context.can('crm.read')) return []
  const canSeeValues = context.can('crm.values.read')

  const rows = await db
    .select({
      id: opportunities.id,
      code: opportunities.code,
      title: opportunities.title,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      ownerName: users.name,
      updatedAt: opportunities.updatedAt,
    })
    .from(opportunities)
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(eq(opportunities.clientId, clientId))
    .orderBy(desc(opportunities.updatedAt))

  return rows.map((row) => ({ ...row, estimatedValue: canSeeValues ? row.estimatedValue : null }))
}

export interface ClientContractRow {
  id: string
  code: string
  title: string
  status: (typeof contracts.$inferSelect)['status']
  totalValue: string | null
  startDate: string | null
  endDate: string | null
}

export async function listClientContracts(
  context: AuthContext,
  clientId: string,
): Promise<ClientContractRow[]> {
  if (!context.can('contracts.read')) return []
  const canSeeValues = context.can('contracts.values.read')

  const rows = await db
    .select({
      id: contracts.id,
      code: contracts.code,
      title: contracts.title,
      status: contracts.status,
      totalValue: contracts.totalValue,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
    })
    .from(contracts)
    .where(eq(contracts.clientId, clientId))
    .orderBy(desc(contracts.createdAt))

  return rows.map((row) => ({ ...row, totalValue: canSeeValues ? row.totalValue : null }))
}

export interface ClientProjectRow {
  id: string
  code: string
  name: string
  status: (typeof projects.$inferSelect)['status']
  progress: number
  dueDate: string | null
}

export async function listClientProjects(
  context: AuthContext,
  clientId: string,
): Promise<ClientProjectRow[]> {
  if (!context.can('projects.read')) return []

  return db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      progress: projects.progress,
      dueDate: projects.dueDate,
    })
    .from(projects)
    .where(eq(projects.clientId, clientId))
    .orderBy(desc(projects.createdAt))
}

export interface ClientSupportRow {
  id: string
  code: string
  title: string
  status: (typeof supportTickets.$inferSelect)['status']
  category: (typeof supportTickets.$inferSelect)['category']
  createdAt: Date
}

export async function listClientSupportTickets(
  context: AuthContext,
  clientId: string,
): Promise<ClientSupportRow[]> {
  if (!context.can('support.read')) return []

  return db
    .select({
      id: supportTickets.id,
      code: supportTickets.code,
      title: supportTickets.title,
      status: supportTickets.status,
      category: supportTickets.category,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.clientId, clientId))
    .orderBy(desc(supportTickets.createdAt))
}

export interface ClientCaseRow {
  id: string
  title: string
  status: (typeof cases.$inferSelect)['status']
}

export async function listClientCases(
  context: AuthContext,
  clientId: string,
): Promise<ClientCaseRow[]> {
  if (!context.can('cases.read')) return []

  return db
    .select({ id: cases.id, title: cases.title, status: cases.status })
    .from(cases)
    .where(eq(cases.clientId, clientId))
    .orderBy(desc(cases.createdAt))
}

// ── Atividade ────────────────────────────────────────────────────────────────

export interface ClientActivityRow {
  id: string
  verb: string
  entityLabel: string
  summary: string
  createdAt: Date
  actor: { id: string; name: string; avatarUrl: string | null } | null
}

export async function listClientActivity(
  clientId: string,
  limit = 30,
): Promise<ClientActivityRow[]> {
  const rows = await db
    .select({
      id: activities.id,
      verb: activities.verb,
      entityLabel: activities.entityLabel,
      summary: activities.summary,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorAvatar: users.avatarUrl,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(eq(activities.clientId, clientId))
    .orderBy(desc(activities.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    verb: row.verb,
    entityLabel: row.entityLabel,
    summary: row.summary,
    createdAt: row.createdAt,
    actor: row.actorId
      ? { id: row.actorId, name: row.actorName ?? '—', avatarUrl: row.actorAvatar }
      : null,
  }))
}
