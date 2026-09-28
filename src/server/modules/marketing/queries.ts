import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  cases,
  clients,
  contacts,
  marketingCampaigns,
  marketingContents,
  projects,
  users,
} from '@/server/db/schema'
import { getFilePanel, type FilePanelData } from '@/server/modules/files/queries'
import { addDaysISO, localDateTimeToDate, todayISO } from '@/shared/dates'
import type { CaseStatus, ContentStatus } from '@/shared/domain'
import { isUuid } from '@/shared/ids'
import type { ContentListFilter } from '@/shared/schemas/marketing'

type Format = (typeof marketingContents.$inferSelect)['format']
type Channel = (typeof marketingContents.$inferSelect)['channel']
type CampaignStatus = (typeof marketingCampaigns.$inferSelect)['status']

const owner = alias(users, 'owner')

// ── Conteúdos ────────────────────────────────────────────────────────────────

export interface ContentCard {
  id: string
  code: string
  title: string
  status: ContentStatus
  format: Format
  channel: Channel
  dueDate: string | null
  scheduledAt: Date | null
  publishedAt: Date | null
  publishedUrl: string | null
  campaign: { id: string; name: string } | null
  owner: { id: string; name: string; avatarUrl: string | null } | null
  /** Prazo de produção passou e o conteúdo ainda não está agendado nem publicado. */
  late: boolean
}

function cardQuery() {
  return db
    .select({
      id: marketingContents.id,
      code: marketingContents.code,
      title: marketingContents.title,
      status: marketingContents.status,
      format: marketingContents.format,
      channel: marketingContents.channel,
      dueDate: marketingContents.dueDate,
      scheduledAt: marketingContents.scheduledAt,
      publishedAt: marketingContents.publishedAt,
      publishedUrl: marketingContents.publishedUrl,
      campaignId: marketingCampaigns.id,
      campaignName: marketingCampaigns.name,
      ownerId: owner.id,
      ownerName: owner.name,
      ownerAvatar: owner.avatarUrl,
    })
    .from(marketingContents)
    .leftJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingContents.campaignId))
    .leftJoin(owner, eq(owner.id, marketingContents.ownerId))
}

type CardRow = Awaited<ReturnType<ReturnType<typeof cardQuery>['execute']>>[number]

function toCard(row: CardRow, today: string): ContentCard {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    format: row.format,
    channel: row.channel,
    dueDate: row.dueDate,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
    publishedUrl: row.publishedUrl,
    campaign:
      row.campaignId && row.campaignName ? { id: row.campaignId, name: row.campaignName } : null,
    owner:
      row.ownerId && row.ownerName
        ? { id: row.ownerId, name: row.ownerName, avatarUrl: row.ownerAvatar }
        : null,
    late:
      Boolean(row.dueDate && row.dueDate < today) &&
      row.status !== 'scheduled' &&
      row.status !== 'published',
  }
}

function contentConditions(filter: ContentListFilter): SQL[] {
  const conditions: SQL[] = []
  if (filter.status) conditions.push(eq(marketingContents.status, filter.status))
  if (filter.channel) conditions.push(eq(marketingContents.channel, filter.channel))
  if (filter.campaignId) conditions.push(eq(marketingContents.campaignId, filter.campaignId))
  if (filter.ownerId) conditions.push(eq(marketingContents.ownerId, filter.ownerId))
  const q = filter.q?.trim()
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(
      or(ilike(marketingContents.title, pattern), ilike(marketingContents.code, pattern)) as SQL,
    )
  }
  return conditions
}

/** Limite do quadro e da lista: acima disso, filtrar é mais útil que rolar. */
const CONTENT_LIMIT = 300

export async function listContents(
  context: AuthContext,
  filter: ContentListFilter,
): Promise<ContentCard[]> {
  if (!context.can('marketing.read')) return []
  const today = todayISO()
  const rows = await cardQuery()
    .where(and(...contentConditions(filter)))
    .orderBy(sql`${marketingContents.dueDate} asc nulls last`, desc(marketingContents.updatedAt))
    .limit(CONTENT_LIMIT)
  return rows.map((row) => toCard(row, today))
}

export interface CalendarEntry extends ContentCard {
  /** Dia (`YYYY-MM-DD`, no fuso da empresa) em que o conteúdo aparece no calendário. */
  day: string
  /** Por que ele está nesse dia. */
  kind: 'published' | 'scheduled' | 'due'
}

/**
 * Calendário editorial de um mês (`YYYY-MM`).
 *
 * Cada conteúdo aparece uma vez, no dia mais concreto que tem: publicado >
 * agendado > prazo de produção. Um post agendado aparece no dia em que vai ao
 * ar, não no dia em que precisava ficar pronto.
 */
export async function listCalendar(
  context: AuthContext,
  month: string,
  filter: ContentListFilter,
): Promise<CalendarEntry[]> {
  if (!context.can('marketing.read') || !/^\d{4}-\d{2}$/.test(month)) return []

  const firstDay = `${month}-01`
  const nextMonth = addDaysISO(`${month}-28`, 7).slice(0, 7)
  const lastDayExclusive = `${nextMonth}-01`
  const from = localDateTimeToDate(`${firstDay}T00:00`)!
  const to = localDateTimeToDate(`${lastDayExclusive}T00:00`)!

  const today = todayISO()
  const rows = await cardQuery()
    .where(
      and(
        ...contentConditions(filter),
        or(
          and(gte(marketingContents.publishedAt, from), lt(marketingContents.publishedAt, to)),
          and(gte(marketingContents.scheduledAt, from), lt(marketingContents.scheduledAt, to)),
          and(
            gte(marketingContents.dueDate, firstDay),
            lt(marketingContents.dueDate, lastDayExclusive),
          ),
        ),
      ),
    )
    .orderBy(asc(marketingContents.scheduledAt), asc(marketingContents.dueDate))
    .limit(CONTENT_LIMIT)

  const entries: CalendarEntry[] = []
  for (const row of rows) {
    const card = toCard(row, today)
    const [day, kind] = card.publishedAt
      ? [todayISO(card.publishedAt), 'published' as const]
      : card.scheduledAt
        ? [todayISO(card.scheduledAt), 'scheduled' as const]
        : [card.dueDate ?? '', 'due' as const]
    // O dia "mais concreto" pode cair fora do mês (ex.: prazo em março, agendado para abril).
    if (day.startsWith(month)) entries.push({ ...card, day, kind })
  }
  return entries
}

export interface ContentDetail extends ContentCard {
  briefing: string | null
  copy: string | null
  referencesNotes: string | null
  createdAt: Date
  creator: { id: string; name: string } | null
  files: FilePanelData | null
}

export async function getContentDetail(
  context: AuthContext,
  id: string,
): Promise<ContentDetail | null> {
  if (!context.can('marketing.read') || !isUuid(id)) return null
  const creator = alias(users, 'creator')

  const [row] = await db
    .select({
      content: marketingContents,
      campaignName: marketingCampaigns.name,
      ownerName: owner.name,
      ownerAvatar: owner.avatarUrl,
      creatorName: creator.name,
    })
    .from(marketingContents)
    .leftJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingContents.campaignId))
    .leftJoin(owner, eq(owner.id, marketingContents.ownerId))
    .leftJoin(creator, eq(creator.id, marketingContents.createdBy))
    .where(eq(marketingContents.id, id))
    .limit(1)
  if (!row) return null

  const { content } = row
  const card = toCard(
    {
      id: content.id,
      code: content.code,
      title: content.title,
      status: content.status,
      format: content.format,
      channel: content.channel,
      dueDate: content.dueDate,
      scheduledAt: content.scheduledAt,
      publishedAt: content.publishedAt,
      publishedUrl: content.publishedUrl,
      campaignId: content.campaignId,
      campaignName: row.campaignName,
      ownerId: content.ownerId,
      ownerName: row.ownerName,
      ownerAvatar: row.ownerAvatar,
    },
    todayISO(),
  )

  return {
    ...card,
    briefing: content.briefing,
    copy: content.copy,
    referencesNotes: content.referencesNotes,
    createdAt: content.createdAt,
    creator:
      content.createdBy && row.creatorName
        ? { id: content.createdBy, name: row.creatorName }
        : null,
    files: await getFilePanel(context, { type: 'marketing_content', id: content.id }),
  }
}

// ── Campanhas ────────────────────────────────────────────────────────────────

export interface CampaignRow {
  id: string
  name: string
  objective: string | null
  status: CampaignStatus
  startDate: string | null
  endDate: string | null
  budget: string | null
  owner: { id: string; name: string } | null
  contents: number
  published: number
}

export async function listCampaigns(context: AuthContext): Promise<CampaignRow[]> {
  if (!context.can('marketing.read')) return []
  const rows = await db
    .select({
      id: marketingCampaigns.id,
      name: marketingCampaigns.name,
      objective: marketingCampaigns.objective,
      status: marketingCampaigns.status,
      startDate: marketingCampaigns.startDate,
      endDate: marketingCampaigns.endDate,
      budget: marketingCampaigns.budget,
      ownerId: owner.id,
      ownerName: owner.name,
      contents: sql<number>`(select count(*)::int from ${marketingContents} where ${marketingContents.campaignId} = ${marketingCampaigns.id})`,
      published: sql<number>`(select count(*)::int from ${marketingContents} where ${marketingContents.campaignId} = ${marketingCampaigns.id} and ${marketingContents.status} = 'published')`,
    })
    .from(marketingCampaigns)
    .leftJoin(owner, eq(owner.id, marketingCampaigns.ownerId))
    .orderBy(
      sql`case ${marketingCampaigns.status} when 'active' then 0 when 'planned' then 1 when 'paused' then 2 else 3 end`,
      desc(marketingCampaigns.startDate),
    )

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    objective: row.objective,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    budget: row.budget,
    owner: row.ownerId && row.ownerName ? { id: row.ownerId, name: row.ownerName } : null,
    contents: row.contents,
    published: row.published,
  }))
}

export async function listCampaignOptions(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: marketingCampaigns.id, name: marketingCampaigns.name })
    .from(marketingCampaigns)
    .where(sql`${marketingCampaigns.status} not in ('completed', 'cancelled')`)
    .orderBy(asc(marketingCampaigns.name))
}

// ── Cases ────────────────────────────────────────────────────────────────────

export interface CaseRow {
  id: string
  code: string
  title: string
  status: CaseStatus
  project: { id: string; name: string }
  client: { id: string; name: string }
  authorizationRequestedAt: Date | null
  authorizedAt: Date | null
  publishedUrl: string | null
  owner: { id: string; name: string } | null
}

export async function listCases(context: AuthContext): Promise<CaseRow[]> {
  if (!context.can('cases.read')) return []
  const rows = await db
    .select({
      id: cases.id,
      code: cases.code,
      title: cases.title,
      status: cases.status,
      projectId: projects.id,
      projectName: projects.name,
      clientId: clients.id,
      clientName: clients.name,
      authorizationRequestedAt: cases.authorizationRequestedAt,
      authorizedAt: cases.authorizedAt,
      publishedUrl: cases.publishedUrl,
      ownerId: owner.id,
      ownerName: owner.name,
    })
    .from(cases)
    .innerJoin(projects, eq(projects.id, cases.projectId))
    .innerJoin(clients, eq(clients.id, cases.clientId))
    .leftJoin(owner, eq(owner.id, cases.ownerId))
    .orderBy(
      sql`case ${cases.status} when 'pending_authorization' then 0 when 'authorized' then 1 when 'in_production' then 2 when 'review' then 3 when 'published' then 4 else 5 end`,
      desc(cases.updatedAt),
    )

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    project: { id: row.projectId, name: row.projectName },
    client: { id: row.clientId, name: row.clientName },
    authorizationRequestedAt: row.authorizationRequestedAt,
    authorizedAt: row.authorizedAt,
    publishedUrl: row.publishedUrl,
    owner: row.ownerId && row.ownerName ? { id: row.ownerId, name: row.ownerName } : null,
  }))
}

export interface CaseDetail extends CaseRow {
  summary: string | null
  challenge: string | null
  solution: string | null
  results: string | null
  authorizationNotes: string | null
  deniedAt: Date | null
  publishedAt: Date | null
  authorizedBy: { id: string; name: string; jobTitle: string | null } | null
  /** Contatos do cliente — para registrar quem autorizou. */
  clientContacts: { id: string; name: string; jobTitle: string | null; canApprove: boolean }[]
  files: FilePanelData | null
}

export async function getCaseDetail(context: AuthContext, id: string): Promise<CaseDetail | null> {
  if (!context.can('cases.read') || !isUuid(id)) return null
  const authorizer = alias(contacts, 'authorizer')

  const [row] = await db
    .select({
      item: cases,
      projectName: projects.name,
      clientName: clients.name,
      ownerName: owner.name,
      authorizerName: authorizer.name,
      authorizerJobTitle: authorizer.jobTitle,
    })
    .from(cases)
    .innerJoin(projects, eq(projects.id, cases.projectId))
    .innerJoin(clients, eq(clients.id, cases.clientId))
    .leftJoin(owner, eq(owner.id, cases.ownerId))
    .leftJoin(authorizer, eq(authorizer.id, cases.authorizedByContactId))
    .where(eq(cases.id, id))
    .limit(1)
  if (!row) return null
  const { item } = row

  const [clientContacts, files] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        jobTitle: contacts.jobTitle,
        canApprove: contacts.canApprove,
      })
      .from(contacts)
      .where(and(eq(contacts.clientId, item.clientId), isNull(contacts.deletedAt)))
      .orderBy(desc(contacts.canApprove), asc(contacts.name)),
    getFilePanel(context, { type: 'case', id: item.id }),
  ])

  return {
    id: item.id,
    code: item.code,
    title: item.title,
    status: item.status,
    project: { id: item.projectId, name: row.projectName },
    client: { id: item.clientId, name: row.clientName },
    authorizationRequestedAt: item.authorizationRequestedAt,
    authorizedAt: item.authorizedAt,
    publishedUrl: item.publishedUrl,
    owner: item.ownerId && row.ownerName ? { id: item.ownerId, name: row.ownerName } : null,
    summary: item.summary,
    challenge: item.challenge,
    solution: item.solution,
    results: item.results,
    authorizationNotes: item.authorizationNotes,
    deniedAt: item.deniedAt,
    publishedAt: item.publishedAt,
    authorizedBy:
      item.authorizedByContactId && row.authorizerName
        ? {
            id: item.authorizedByContactId,
            name: row.authorizerName,
            jobTitle: row.authorizerJobTitle,
          }
        : null,
    clientContacts,
    files,
  }
}

/** Projetos entregues (lançados ou concluídos) que ainda não têm case. */
export async function listCaseEligibleProjects(): Promise<
  { id: string; code: string; name: string; clientName: string }[]
> {
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(cases, eq(cases.projectId, projects.id))
    .where(
      and(isNull(cases.id), or(eq(projects.status, 'completed'), isNotNull(projects.launchedAt))),
    )
    .orderBy(desc(projects.updatedAt))
}

/** Contagem de cases aguardando autorização — para o atalho da aba. */
export async function countPendingCases(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(cases)
    .where(eq(cases.status, 'pending_authorization'))
  return row?.value ?? 0
}

/** Conteúdos da pessoa com prazo até daqui a 7 dias, ainda não agendados — Meu trabalho. */
export async function listMyUpcomingContents(userId: string): Promise<ContentCard[]> {
  const today = todayISO()
  const rows = await cardQuery()
    .where(
      and(
        eq(marketingContents.ownerId, userId),
        sql`${marketingContents.status} not in ('scheduled', 'published')`,
        isNotNull(marketingContents.dueDate),
        sql`${marketingContents.dueDate} <= ${addDaysISO(today, 7)}`,
      ),
    )
    .orderBy(asc(marketingContents.dueDate))
  return rows.map((row) => toCard(row, today))
}
