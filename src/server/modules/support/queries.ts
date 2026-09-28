import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  clients,
  comments,
  contacts,
  contracts,
  opportunities,
  projects,
  supportTickets,
  users,
} from '@/server/db/schema'
import { getFilePanel, type FilePanelData } from '@/server/modules/files/queries'
import { buildPageResult, DEFAULT_PAGE_SIZE, type PageResult } from '@/server/pagination'
import { OPEN_SUPPORT_STATUSES, type SupportPriority, type SupportStatus } from '@/shared/domain'
import { isUuid } from '@/shared/ids'
import type { TicketListFilter } from '@/shared/schemas/support'

type Category = (typeof supportTickets.$inferSelect)['category']

const assignee = alias(users, 'assignee')

/** Sem primeira resposta e com o prazo vencido. */
const overdueCondition = () =>
  and(
    inArray(supportTickets.status, OPEN_SUPPORT_STATUSES),
    isNull(supportTickets.firstResponseAt),
    lt(supportTickets.dueAt, sql`now()`),
  ) as SQL

// ── Lista ────────────────────────────────────────────────────────────────────

export interface TicketRow {
  id: string
  code: string
  title: string
  status: SupportStatus
  priority: SupportPriority
  category: Category
  dueAt: Date | null
  firstResponseAt: Date | null
  /** Sem primeira resposta e com o prazo vencido — calculado pelo banco. */
  overdue: boolean
  createdAt: Date
  client: { id: string; name: string }
  project: { id: string; name: string } | null
  assignee: { id: string; name: string } | null
}

function listConditions(context: AuthContext, filter: TicketListFilter): SQL[] {
  const conditions: SQL[] = []

  if (filter.status) conditions.push(eq(supportTickets.status, filter.status))
  else if (filter.filtro === 'meus')
    conditions.push(
      inArray(supportTickets.status, OPEN_SUPPORT_STATUSES),
      eq(supportTickets.assigneeId, context.user.id),
    )
  else if (filter.filtro === 'atrasados') conditions.push(overdueCondition())
  else if (filter.filtro !== 'todos')
    conditions.push(inArray(supportTickets.status, OPEN_SUPPORT_STATUSES))

  if (filter.priority) conditions.push(eq(supportTickets.priority, filter.priority))
  if (filter.category) conditions.push(eq(supportTickets.category, filter.category))

  const q = filter.q?.trim()
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(
      or(
        ilike(supportTickets.title, pattern),
        ilike(supportTickets.code, pattern),
        ilike(clients.name, pattern),
      ) as SQL,
    )
  }
  return conditions
}

const PRIORITY_ORDER = sql`case ${supportTickets.priority} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`

export async function listTickets(
  context: AuthContext,
  filter: TicketListFilter,
): Promise<PageResult<TicketRow>> {
  const page = filter.page ?? 1
  const where = and(...listConditions(context, filter))

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: supportTickets.id,
        code: supportTickets.code,
        title: supportTickets.title,
        status: supportTickets.status,
        priority: supportTickets.priority,
        category: supportTickets.category,
        dueAt: supportTickets.dueAt,
        firstResponseAt: supportTickets.firstResponseAt,
        overdue: sql<boolean>`coalesce(${overdueCondition()}, false)`,
        createdAt: supportTickets.createdAt,
        clientId: clients.id,
        clientName: clients.name,
        projectId: projects.id,
        projectName: projects.name,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
      })
      .from(supportTickets)
      .innerJoin(clients, eq(clients.id, supportTickets.clientId))
      .leftJoin(projects, eq(projects.id, supportTickets.projectId))
      .leftJoin(assignee, eq(assignee.id, supportTickets.assigneeId))
      .where(where)
      // Em aberto primeiro; dentro deles, o mais urgente e o prazo mais próximo.
      .orderBy(
        sql`case when ${supportTickets.status} in ('open', 'in_progress', 'waiting_client') then 0 else 1 end`,
        PRIORITY_ORDER,
        sql`${supportTickets.dueAt} asc nulls last`,
        desc(supportTickets.createdAt),
      )
      .limit(DEFAULT_PAGE_SIZE)
      .offset((page - 1) * DEFAULT_PAGE_SIZE),
    db
      .select({ value: count() })
      .from(supportTickets)
      .innerJoin(clients, eq(clients.id, supportTickets.clientId))
      .where(where),
  ])

  const items = rows.map((row): TicketRow => ({
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    priority: row.priority,
    category: row.category,
    dueAt: row.dueAt,
    firstResponseAt: row.firstResponseAt,
    overdue: row.overdue,
    createdAt: row.createdAt,
    client: { id: row.clientId, name: row.clientName },
    project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
    assignee:
      row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
  }))

  return buildPageResult(items, total?.value ?? 0, page, DEFAULT_PAGE_SIZE)
}

export async function countTicketShortcuts(
  context: AuthContext,
): Promise<{ open: number; mine: number; overdue: number }> {
  const [[open], [mine], [overdue]] = await Promise.all([
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(inArray(supportTickets.status, OPEN_SUPPORT_STATUSES)),
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(
        and(
          inArray(supportTickets.status, OPEN_SUPPORT_STATUSES),
          eq(supportTickets.assigneeId, context.user.id),
        ),
      ),
    db.select({ value: count() }).from(supportTickets).where(overdueCondition()),
  ])
  return { open: open?.value ?? 0, mine: mine?.value ?? 0, overdue: overdue?.value ?? 0 }
}

/** Chamados abertos atribuídos à pessoa — para o Meu trabalho. */
export async function listMyOpenTickets(userId: string) {
  return db
    .select({
      id: supportTickets.id,
      code: supportTickets.code,
      title: supportTickets.title,
      priority: supportTickets.priority,
      status: supportTickets.status,
      dueAt: supportTickets.dueAt,
      firstResponseAt: supportTickets.firstResponseAt,
      overdue: sql<boolean>`coalesce(${overdueCondition()}, false)`,
      clientName: clients.name,
    })
    .from(supportTickets)
    .innerJoin(clients, eq(clients.id, supportTickets.clientId))
    .where(
      and(
        inArray(supportTickets.status, OPEN_SUPPORT_STATUSES),
        eq(supportTickets.assigneeId, userId),
      ),
    )
    .orderBy(PRIORITY_ORDER, sql`${supportTickets.dueAt} asc nulls last`)
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export interface TicketComment {
  id: string
  body: string
  toClient: boolean
  createdAt: Date
  author: { id: string; name: string } | null
}

export interface TicketDetail {
  id: string
  code: string
  title: string
  description: string
  status: SupportStatus
  priority: SupportPriority
  category: Category
  resolution: string | null
  createdAt: Date
  dueAt: Date | null
  firstResponseAt: Date | null
  overdue: boolean
  resolvedAt: Date | null
  closedAt: Date | null
  client: { id: string; name: string }
  project: { id: string; code: string; name: string } | null
  contract: { id: string; code: string; supportEndsAt: string | null } | null
  requester: { id: string; name: string; email: string | null; phone: string | null } | null
  assignee: { id: string; name: string } | null
  creator: { id: string; name: string } | null
  opportunity: { id: string; code: string; title: string } | null
  comments: TicketComment[]
  files: FilePanelData | null
}

export async function getTicketDetail(
  context: AuthContext,
  id: string,
): Promise<TicketDetail | null> {
  if (!context.can('support.read') || !isUuid(id)) return null

  const creator = alias(users, 'creator')
  const [row] = await db
    .select({
      ticket: supportTickets,
      overdue: sql<boolean>`coalesce(${overdueCondition()}, false)`,
      clientName: clients.name,
      projectCode: projects.code,
      projectName: projects.name,
      contractCode: contracts.code,
      supportEndsAt: contracts.supportEndsAt,
      contactName: contacts.name,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      assigneeName: assignee.name,
      creatorName: creator.name,
      opportunityCode: opportunities.code,
      opportunityTitle: opportunities.title,
    })
    .from(supportTickets)
    .innerJoin(clients, eq(clients.id, supportTickets.clientId))
    .leftJoin(projects, eq(projects.id, supportTickets.projectId))
    .leftJoin(contracts, eq(contracts.id, supportTickets.contractId))
    .leftJoin(contacts, eq(contacts.id, supportTickets.requesterContactId))
    .leftJoin(assignee, eq(assignee.id, supportTickets.assigneeId))
    .leftJoin(creator, eq(creator.id, supportTickets.createdBy))
    .leftJoin(opportunities, eq(opportunities.id, supportTickets.convertedOpportunityId))
    .where(eq(supportTickets.id, id))
    .limit(1)

  if (!row) return null
  const { ticket } = row

  const author = alias(users, 'author')
  const [thread, files] = await Promise.all([
    db
      .select({
        id: comments.id,
        body: comments.body,
        isInternal: comments.isInternal,
        createdAt: comments.createdAt,
        authorId: comments.authorId,
        authorName: author.name,
      })
      .from(comments)
      .leftJoin(author, eq(author.id, comments.authorId))
      .where(eq(comments.supportTicketId, ticket.id))
      .orderBy(asc(comments.createdAt)),
    getFilePanel(context, { type: 'support_ticket', id: ticket.id }),
  ])

  const person = (userId: string | null, name: string | null) =>
    userId && name ? { id: userId, name } : null

  return {
    id: ticket.id,
    code: ticket.code,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    resolution: ticket.resolution,
    createdAt: ticket.createdAt,
    dueAt: ticket.dueAt,
    firstResponseAt: ticket.firstResponseAt,
    overdue: row.overdue,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    client: { id: ticket.clientId, name: row.clientName },
    project:
      ticket.projectId && row.projectCode && row.projectName
        ? { id: ticket.projectId, code: row.projectCode, name: row.projectName }
        : null,
    contract:
      ticket.contractId && row.contractCode
        ? { id: ticket.contractId, code: row.contractCode, supportEndsAt: row.supportEndsAt }
        : null,
    requester:
      ticket.requesterContactId && row.contactName
        ? {
            id: ticket.requesterContactId,
            name: row.contactName,
            email: row.contactEmail,
            phone: row.contactPhone,
          }
        : null,
    assignee: person(ticket.assigneeId, row.assigneeName),
    creator: person(ticket.createdBy, row.creatorName),
    // A oportunidade gerada só é mostrada a quem pode ver o pipeline.
    opportunity:
      ticket.convertedOpportunityId &&
      row.opportunityCode &&
      row.opportunityTitle &&
      context.can('crm.read')
        ? {
            id: ticket.convertedOpportunityId,
            code: row.opportunityCode,
            title: row.opportunityTitle,
          }
        : null,
    comments: thread.map((comment) => ({
      id: comment.id,
      body: comment.body,
      toClient: !comment.isInternal,
      createdAt: comment.createdAt,
      author: person(comment.authorId, comment.authorName),
    })),
    files,
  }
}

// ── Opções de formulário ─────────────────────────────────────────────────────

export interface TicketClientOptions {
  projects: { id: string; code: string; name: string }[]
  contacts: { id: string; name: string; jobTitle: string | null }[]
}

/** Projetos (não cancelados) e contatos de um cliente. */
export async function listTicketClientOptions(clientId: string): Promise<TicketClientOptions> {
  const [projectRows, contactRows] = await Promise.all([
    db
      .select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(and(eq(projects.clientId, clientId), ne(projects.status, 'cancelled')))
      .orderBy(desc(projects.createdAt)),
    db
      .select({ id: contacts.id, name: contacts.name, jobTitle: contacts.jobTitle })
      .from(contacts)
      .where(and(eq(contacts.clientId, clientId), isNull(contacts.deletedAt)))
      .orderBy(desc(contacts.isPrimary), asc(contacts.name)),
  ])
  return { projects: projectRows, contacts: contactRows }
}

/** Chamados de um projeto — painel da página do projeto. */
export async function listProjectTickets(projectId: string): Promise<TicketRow[]> {
  const rows = await db
    .select({
      id: supportTickets.id,
      code: supportTickets.code,
      title: supportTickets.title,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      dueAt: supportTickets.dueAt,
      firstResponseAt: supportTickets.firstResponseAt,
      overdue: sql<boolean>`coalesce(${overdueCondition()}, false)`,
      createdAt: supportTickets.createdAt,
      clientId: clients.id,
      clientName: clients.name,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
    })
    .from(supportTickets)
    .innerJoin(clients, eq(clients.id, supportTickets.clientId))
    .leftJoin(assignee, eq(assignee.id, supportTickets.assigneeId))
    .where(eq(supportTickets.projectId, projectId))
    .orderBy(
      sql`case when ${supportTickets.status} in ('open', 'in_progress', 'waiting_client') then 0 else 1 end`,
      desc(supportTickets.createdAt),
    )
    .limit(20)

  return rows.map((row) => ({
    ...row,
    client: { id: row.clientId, name: row.clientName },
    project: null,
    assignee:
      row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
  }))
}
