import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm'

import { isUuid } from '@/shared/ids'
import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  activities,
  clients,
  contractAddendums,
  contracts,
  projects,
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
import { addDaysISO, todayISO } from '@/shared/dates'

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export interface ContractListRow {
  id: string
  code: string
  title: string
  status: (typeof contracts.$inferSelect)['status']
  clientName: string
  totalValue: string | null
  startDate: string | null
  endDate: string | null
  supportEndsAt: string | null
}

export async function listContracts(
  context: AuthContext,
  filter: { q?: string; status?: string } & PageInput,
): Promise<PageResult<ContractListRow>> {
  const page = normalizePage(filter.page)
  const pageSize = normalizePageSize(filter.pageSize)
  const canSeeValues = context.can('contracts.values.read')

  const conditions = []
  if (filter.status) {
    conditions.push(
      eq(contracts.status, filter.status as (typeof contracts.$inferSelect)['status']),
    )
  }

  const trimmed = filter.q?.trim()
  if (trimmed) {
    const pattern = `%${escapeLike(trimmed)}%`
    const searchCondition = or(ilike(contracts.title, pattern), ilike(contracts.code, pattern))
    if (searchCondition) conditions.push(searchCondition)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: contracts.id,
        code: contracts.code,
        title: contracts.title,
        status: contracts.status,
        clientName: clients.name,
        totalValue: contracts.totalValue,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        supportEndsAt: contracts.supportEndsAt,
      })
      .from(contracts)
      .innerJoin(clients, eq(clients.id, contracts.clientId))
      .where(where)
      .orderBy(desc(contracts.createdAt))
      .limit(pageSize)
      .offset(toOffset(page, pageSize)),
    db.select({ total: count() }).from(contracts).where(where),
  ])

  const items = rows.map((row) => ({ ...row, totalValue: canSeeValues ? row.totalValue : null }))
  return buildPageResult(items, totalRow[0]?.total ?? 0, page, pageSize)
}

export interface ContractDetail {
  id: string
  code: string
  title: string
  status: (typeof contracts.$inferSelect)['status']
  scope: string | null
  deliverables: string | null
  responsibilities: string | null
  exclusions: string | null
  totalValue: string | null
  paymentMethod: (typeof contracts.$inferSelect)['paymentMethod']
  paymentTerms: string | null
  installments: number | null
  startDate: string | null
  endDate: string | null
  signedAt: Date | null
  revisionsIncluded: number | null
  supportDays: number | null
  supportEndsAt: string | null
  notes: string | null
  createdAt: Date
  client: { id: string; name: string }
  owner: { id: string; name: string; avatarUrl: string | null } | null
  serviceType: { id: string; name: string } | null
  opportunity: { id: string; title: string } | null
  cancellationReason: string | null
  hasDocuments: boolean
}

export async function getContractDetail(
  context: AuthContext,
  contractId: string,
): Promise<ContractDetail | null> {
  if (!isUuid(contractId)) return null
  const canSeeValues = context.can('contracts.values.read')
  const canSeeDocuments = context.can('contracts.documents.read')

  const row = await db.query.contracts.findFirst({
    where: eq(contracts.id, contractId),
    with: {
      client: { columns: { id: true, name: true } },
      owner: { columns: { id: true, name: true, avatarUrl: true } },
      serviceType: { columns: { id: true, name: true } },
      opportunity: { columns: { id: true, title: true } },
    },
  })

  if (!row) return null

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    scope: row.scope,
    deliverables: row.deliverables,
    responsibilities: row.responsibilities,
    exclusions: row.exclusions,
    totalValue: canSeeValues ? row.totalValue : null,
    paymentMethod: canSeeValues ? row.paymentMethod : null,
    paymentTerms: canSeeValues ? row.paymentTerms : null,
    installments: canSeeValues ? row.installments : null,
    startDate: row.startDate,
    endDate: row.endDate,
    signedAt: row.signedAt,
    revisionsIncluded: row.revisionsIncluded,
    supportDays: row.supportDays,
    supportEndsAt: row.supportEndsAt,
    notes: row.notes,
    createdAt: row.createdAt,
    client: row.client,
    owner: row.owner,
    serviceType: row.serviceType,
    opportunity: row.opportunity,
    cancellationReason: row.cancellationReason,
    hasDocuments: canSeeDocuments,
  }
}

export interface AddendumRow {
  id: string
  code: string
  sequence: number
  type: (typeof contractAddendums.$inferSelect)['type']
  status: (typeof contractAddendums.$inferSelect)['status']
  title: string
  valueDelta: string | null
  newEndDate: string | null
  additionalSupportDays: number | null
  createdAt: Date
}

export async function listAddendums(
  context: AuthContext,
  contractId: string,
): Promise<AddendumRow[]> {
  const canSeeValues = context.can('contracts.values.read')

  const rows = await db
    .select({
      id: contractAddendums.id,
      code: contractAddendums.code,
      sequence: contractAddendums.sequence,
      type: contractAddendums.type,
      status: contractAddendums.status,
      title: contractAddendums.title,
      valueDelta: contractAddendums.valueDelta,
      newEndDate: contractAddendums.newEndDate,
      additionalSupportDays: contractAddendums.additionalSupportDays,
      createdAt: contractAddendums.createdAt,
    })
    .from(contractAddendums)
    .where(eq(contractAddendums.contractId, contractId))
    .orderBy(desc(contractAddendums.sequence))

  return rows.map((row) => ({ ...row, valueDelta: canSeeValues ? row.valueDelta : null }))
}

export interface ContractAlert {
  id: string
  code: string
  title: string
  clientName: string
  kind: 'contract' | 'support'
  dueDate: string
}

/** Contratos e suportes vencendo nos próximos 30 dias — alimenta o dashboard. */
export async function listExpiringContracts(
  context: AuthContext,
  windowDays = 30,
): Promise<ContractAlert[]> {
  if (!context.can('contracts.read')) return []

  const today = todayISO()
  const horizon = addDaysISO(today, windowDays)

  const rows = await db
    .select({
      id: contracts.id,
      code: contracts.code,
      title: contracts.title,
      clientName: clients.name,
      endDate: contracts.endDate,
      supportEndsAt: contracts.supportEndsAt,
    })
    .from(contracts)
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .where(eq(contracts.status, 'active'))

  const alerts: ContractAlert[] = []
  for (const row of rows) {
    if (row.endDate && row.endDate >= today && row.endDate <= horizon) {
      alerts.push({
        id: row.id,
        code: row.code,
        title: row.title,
        clientName: row.clientName,
        kind: 'contract',
        dueDate: row.endDate,
      })
    }
    if (row.supportEndsAt && row.supportEndsAt >= today && row.supportEndsAt <= horizon) {
      alerts.push({
        id: row.id,
        code: row.code,
        title: row.title,
        clientName: row.clientName,
        kind: 'support',
        dueDate: row.supportEndsAt,
      })
    }
  }

  return alerts.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export async function listContractOptionsForClient(clientId: string) {
  return db
    .select({ id: contracts.id, title: contracts.title, code: contracts.code })
    .from(contracts)
    .where(and(eq(contracts.clientId, clientId), eq(contracts.status, 'active')))
    .orderBy(desc(contracts.createdAt))
}

export interface ContractProjectRow {
  id: string
  code: string
  name: string
  status: (typeof projects.$inferSelect)['status']
  progress: number
  dueDate: string | null
}

export async function listContractProjects(
  context: AuthContext,
  contractId: string,
): Promise<ContractProjectRow[]> {
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
    .where(eq(projects.contractId, contractId))
    .orderBy(desc(projects.createdAt))
}

export interface ContractActivityRow {
  id: string
  summary: string
  createdAt: Date
  actor: { id: string; name: string; avatarUrl: string | null } | null
}

/** Feed do contrato: eventos do próprio contrato e dos seus aditivos. */
export async function listContractActivity(
  contractId: string,
  limit = 30,
): Promise<ContractActivityRow[]> {
  const addendumIds = await db
    .select({ id: contractAddendums.id })
    .from(contractAddendums)
    .where(eq(contractAddendums.contractId, contractId))

  const entityCondition = or(
    and(eq(activities.entityType, 'contract'), eq(activities.entityId, contractId)),
    addendumIds.length > 0
      ? and(
          eq(activities.entityType, 'contract_addendum'),
          inArray(
            activities.entityId,
            addendumIds.map((row) => row.id),
          ),
        )
      : undefined,
  )

  const rows = await db
    .select({
      id: activities.id,
      summary: activities.summary,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorAvatar: users.avatarUrl,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(entityCondition)
    .orderBy(desc(activities.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    summary: row.summary,
    createdAt: row.createdAt,
    actor: row.actorId
      ? { id: row.actorId, name: row.actorName ?? '—', avatarUrl: row.actorAvatar }
      : null,
  }))
}
