import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm'

import { isUuid } from '@/shared/ids'
import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  clients,
  contacts,
  contracts,
  leadSources,
  leads,
  opportunities,
  proposals,
  serviceTypes,
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
import { PIPELINE_STAGES, type OpportunityStage } from '@/shared/domain'

/**
 * Leituras do comercial.
 *
 * Valores (estimativa de oportunidade, total de proposta) só saem do servidor
 * para quem tem `crm.values.read` — omitidos aqui, não escondidos na tela.
 */

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

// ── Leads ────────────────────────────────────────────────────────────────────

export interface LeadRow {
  id: string
  code: string
  name: string
  companyName: string | null
  email: string | null
  phone: string | null
  status: (typeof leads.$inferSelect)['status']
  sourceName: string | null
  serviceTypeName: string | null
  ownerName: string | null
  createdAt: Date
}

export async function listLeads(
  filter: { q?: string; status?: string } & PageInput,
): Promise<PageResult<LeadRow>> {
  const page = normalizePage(filter.page)
  const pageSize = normalizePageSize(filter.pageSize)

  const conditions = []
  if (filter.status)
    conditions.push(eq(leads.status, filter.status as (typeof leads.$inferSelect)['status']))

  const trimmed = filter.q?.trim()
  if (trimmed) {
    const pattern = `%${escapeLike(trimmed)}%`
    const searchCondition = or(
      ilike(leads.name, pattern),
      ilike(leads.companyName, pattern),
      ilike(leads.code, pattern),
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: leads.id,
        code: leads.code,
        name: leads.name,
        companyName: leads.companyName,
        email: leads.email,
        phone: leads.phone,
        status: leads.status,
        sourceName: leadSources.name,
        serviceTypeName: serviceTypes.name,
        ownerName: users.name,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(leadSources, eq(leadSources.id, leads.sourceId))
      .leftJoin(serviceTypes, eq(serviceTypes.id, leads.serviceTypeId))
      .leftJoin(users, eq(users.id, leads.ownerId))
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(pageSize)
      .offset(toOffset(page, pageSize)),
    db.select({ total: count() }).from(leads).where(where),
  ])

  return buildPageResult(rows, totalRow[0]?.total ?? 0, page, pageSize)
}

export async function getLeadDetail(leadId: string) {
  if (!isUuid(leadId)) return undefined
  return db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: {
      source: { columns: { name: true } },
      serviceType: { columns: { name: true } },
      owner: { columns: { id: true, name: true, avatarUrl: true } },
    },
  })
}

// ── Oportunidades / pipeline ────────────────────────────────────────────────

export interface OpportunityCard {
  id: string
  code: string
  title: string
  stage: OpportunityStage
  estimatedValue: string | null
  clientName: string
  ownerName: string | null
  ownerAvatar: string | null
  nextAction: string | null
  nextActionAt: string | null
  updatedAt: Date
}

export interface PipelineColumn {
  stage: OpportunityStage
  cards: OpportunityCard[]
  totalValue: string | null
}

/** Quadro do pipeline: uma coluna por etapa aberta, com o total de cada uma. */
export async function getPipelineBoard(context: AuthContext): Promise<PipelineColumn[]> {
  const canSeeValues = context.can('crm.values.read')

  const rows = await db
    .select({
      id: opportunities.id,
      code: opportunities.code,
      title: opportunities.title,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      clientName: clients.name,
      ownerName: users.name,
      ownerAvatar: users.avatarUrl,
      nextAction: opportunities.nextAction,
      nextActionAt: opportunities.nextActionAt,
      updatedAt: opportunities.updatedAt,
      position: opportunities.position,
    })
    .from(opportunities)
    .innerJoin(clients, eq(clients.id, opportunities.clientId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(
      sql`${opportunities.stage} in ('new_contact','qualification','discovery','proposal_draft','proposal_sent','negotiation')`,
    )
    .orderBy(opportunities.position)

  const byStage = new Map<OpportunityStage, OpportunityCard[]>()
  for (const stage of PIPELINE_STAGES) byStage.set(stage, [])

  for (const row of rows) {
    const list = byStage.get(row.stage)
    if (!list) continue
    list.push({
      id: row.id,
      code: row.code,
      title: row.title,
      stage: row.stage,
      estimatedValue: canSeeValues ? row.estimatedValue : null,
      clientName: row.clientName,
      ownerName: row.ownerName,
      ownerAvatar: row.ownerAvatar,
      nextAction: row.nextAction,
      nextActionAt: row.nextActionAt,
      updatedAt: row.updatedAt,
    })
  }

  return PIPELINE_STAGES.map((stage) => {
    const cards = byStage.get(stage) ?? []
    const total = canSeeValues
      ? cards
          .reduce((sum, card) => sum + (card.estimatedValue ? Number(card.estimatedValue) : 0), 0)
          .toFixed(2)
      : null

    return { stage, cards, totalValue: total }
  })
}

export interface OpportunityListRow extends OpportunityCard {
  probability: number | null
}

export async function listOpportunities(
  context: AuthContext,
  filter: { q?: string; stage?: OpportunityStage } & PageInput,
): Promise<PageResult<OpportunityListRow>> {
  const page = normalizePage(filter.page)
  const pageSize = normalizePageSize(filter.pageSize)
  const canSeeValues = context.can('crm.values.read')

  const conditions = []
  if (filter.stage) conditions.push(eq(opportunities.stage, filter.stage))

  const trimmed = filter.q?.trim()
  if (trimmed) {
    const pattern = `%${escapeLike(trimmed)}%`
    const searchCondition = or(
      ilike(opportunities.title, pattern),
      ilike(opportunities.code, pattern),
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: opportunities.id,
        code: opportunities.code,
        title: opportunities.title,
        stage: opportunities.stage,
        estimatedValue: opportunities.estimatedValue,
        probability: opportunities.probability,
        clientName: clients.name,
        ownerName: users.name,
        ownerAvatar: users.avatarUrl,
        nextAction: opportunities.nextAction,
        nextActionAt: opportunities.nextActionAt,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .innerJoin(clients, eq(clients.id, opportunities.clientId))
      .leftJoin(users, eq(users.id, opportunities.ownerId))
      .where(where)
      .orderBy(desc(opportunities.updatedAt))
      .limit(pageSize)
      .offset(toOffset(page, pageSize)),
    db.select({ total: count() }).from(opportunities).where(where),
  ])

  const items = rows.map((row) => ({
    ...row,
    estimatedValue: canSeeValues ? row.estimatedValue : null,
  }))
  return buildPageResult(items, totalRow[0]?.total ?? 0, page, pageSize)
}

export interface OpportunityDetail {
  id: string
  code: string
  title: string
  stage: OpportunityStage
  estimatedValue: string | null
  probability: number | null
  description: string | null
  notes: string | null
  nextAction: string | null
  nextActionAt: string | null
  expectedCloseAt: string | null
  wonAt: Date | null
  lostAt: Date | null
  lostReason: string | null
  createdAt: Date
  client: { id: string; name: string }
  contact: { id: string; name: string } | null
  owner: { id: string; name: string; avatarUrl: string | null } | null
  serviceType: { id: string; name: string } | null
  convertedContractId: string | null
}

export async function getOpportunityDetail(
  context: AuthContext,
  opportunityId: string,
): Promise<OpportunityDetail | null> {
  if (!isUuid(opportunityId)) return null
  const canSeeValues = context.can('crm.values.read')

  const row = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
    with: {
      client: { columns: { id: true, name: true } },
      contact: { columns: { id: true, name: true } },
      owner: { columns: { id: true, name: true, avatarUrl: true } },
      serviceType: { columns: { id: true, name: true } },
    },
  })

  if (!row) return null

  const [contract] = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.opportunityId, opportunityId))
    .limit(1)

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    stage: row.stage,
    estimatedValue: canSeeValues ? row.estimatedValue : null,
    probability: row.probability,
    description: row.description,
    notes: row.notes,
    nextAction: row.nextAction,
    nextActionAt: row.nextActionAt,
    expectedCloseAt: row.expectedCloseAt,
    wonAt: row.wonAt,
    lostAt: row.lostAt,
    lostReason: row.lostReason,
    createdAt: row.createdAt,
    client: row.client,
    contact: row.contact,
    owner: row.owner,
    serviceType: row.serviceType,
    convertedContractId: contract?.id ?? null,
  }
}

// ── Propostas ────────────────────────────────────────────────────────────────

export interface ProposalRow {
  id: string
  code: string
  version: number
  title: string
  status: (typeof proposals.$inferSelect)['status']
  totalValue: string | null
  validUntil: string | null
  sentAt: Date | null
  createdAt: Date
}

export async function listProposals(
  context: AuthContext,
  opportunityId: string,
): Promise<ProposalRow[]> {
  const canSeeValues = context.can('crm.values.read')

  const rows = await db
    .select({
      id: proposals.id,
      code: proposals.code,
      version: proposals.version,
      title: proposals.title,
      status: proposals.status,
      totalValue: proposals.totalValue,
      validUntil: proposals.validUntil,
      sentAt: proposals.sentAt,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(eq(proposals.opportunityId, opportunityId))
    .orderBy(desc(proposals.version))

  return rows.map((row) => ({ ...row, totalValue: canSeeValues ? row.totalValue : null }))
}

// ── Catálogos usados nos formulários ─────────────────────────────────────────

export async function listServiceTypeOptions() {
  return db
    .select({ id: serviceTypes.id, name: serviceTypes.name })
    .from(serviceTypes)
    .where(eq(serviceTypes.isActive, true))
    .orderBy(serviceTypes.position)
}

export async function listLeadSourceOptions() {
  return db
    .select({ id: leadSources.id, name: leadSources.name })
    .from(leadSources)
    .where(eq(leadSources.isActive, true))
    .orderBy(leadSources.position)
}

export async function listClientContactOptions(clientId: string) {
  return db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(eq(contacts.clientId, clientId))
    .orderBy(contacts.name)
}
