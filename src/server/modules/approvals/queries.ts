import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { isUuid } from '@/shared/ids'
import { alias } from 'drizzle-orm/pg-core'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  approvals,
  approvalVersions,
  clients,
  contacts,
  projects,
  tasks,
  users,
} from '@/server/db/schema'
import { getFilePanel, type FilePanelData } from '@/server/modules/files/queries'
import { buildPageResult, DEFAULT_PAGE_SIZE, type PageResult } from '@/server/pagination'
import { OPEN_APPROVAL_STATUSES, type ApprovalStatus } from '@/shared/domain'
import type { ApprovalListFilter } from '@/shared/schemas/approvals'

const approver = alias(users, 'approver')
const requester = alias(users, 'requester')

// ── Lista ────────────────────────────────────────────────────────────────────

export interface ApprovalRow {
  id: string
  code: string
  title: string
  status: ApprovalStatus
  currentVersion: number
  dueDate: string | null
  updatedAt: Date
  project: { id: string; code: string; name: string }
  clientName: string
  /** Quem decide: pessoa da equipe ou contato do cliente. */
  approverName: string | null
  approverIsClient: boolean
  requesterName: string | null
}

function listConditions(context: AuthContext, filter: ApprovalListFilter): SQL[] {
  const conditions: SQL[] = []

  if (filter.status) {
    conditions.push(eq(approvals.status, filter.status))
  } else if (filter.filtro === 'minhas') {
    conditions.push(eq(approvals.status, 'pending'), eq(approvals.approverUserId, context.user.id))
  } else if (filter.filtro !== 'todas') {
    conditions.push(inArray(approvals.status, OPEN_APPROVAL_STATUSES))
  }

  if (filter.projectId) conditions.push(eq(approvals.projectId, filter.projectId))

  const q = filter.q?.trim()
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(
      or(
        ilike(approvals.title, pattern),
        ilike(approvals.code, pattern),
        ilike(projects.name, pattern),
      ) as SQL,
    )
  }

  return conditions
}

export async function listApprovals(
  context: AuthContext,
  filter: ApprovalListFilter,
): Promise<PageResult<ApprovalRow>> {
  const page = filter.page ?? 1
  const where = and(...listConditions(context, filter))

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: approvals.id,
        code: approvals.code,
        title: approvals.title,
        status: approvals.status,
        currentVersion: approvals.currentVersion,
        dueDate: approvals.dueDate,
        updatedAt: approvals.updatedAt,
        projectId: projects.id,
        projectCode: projects.code,
        projectName: projects.name,
        clientName: clients.name,
        approverName: approver.name,
        contactName: contacts.name,
        requesterName: requester.name,
      })
      .from(approvals)
      .innerJoin(projects, eq(projects.id, approvals.projectId))
      .innerJoin(clients, eq(clients.id, approvals.clientId))
      .leftJoin(approver, eq(approver.id, approvals.approverUserId))
      .leftJoin(contacts, eq(contacts.id, approvals.approverContactId))
      .leftJoin(requester, eq(requester.id, approvals.requestedBy))
      .where(where)
      // Em aberto primeiro, e dentro delas o prazo mais próximo.
      .orderBy(
        sql`case when ${approvals.status} in ('pending', 'changes_requested') then 0 else 1 end`,
        sql`${approvals.dueDate} asc nulls last`,
        desc(approvals.updatedAt),
      )
      .limit(DEFAULT_PAGE_SIZE)
      .offset((page - 1) * DEFAULT_PAGE_SIZE),
    db
      .select({ value: count() })
      .from(approvals)
      .innerJoin(projects, eq(projects.id, approvals.projectId))
      .where(where),
  ])

  const items = rows.map((row): ApprovalRow => ({
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    currentVersion: row.currentVersion,
    dueDate: row.dueDate,
    updatedAt: row.updatedAt,
    project: { id: row.projectId, code: row.projectCode, name: row.projectName },
    clientName: row.clientName,
    approverName: row.contactName ?? row.approverName,
    approverIsClient: Boolean(row.contactName),
    requesterName: row.requesterName,
  }))

  return buildPageResult(items, total?.value ?? 0, page, DEFAULT_PAGE_SIZE)
}

/** Contadores dos atalhos da lista. */
export async function countApprovalShortcuts(
  context: AuthContext,
): Promise<{ open: number; mine: number }> {
  const [[open], [mine]] = await Promise.all([
    db
      .select({ value: count() })
      .from(approvals)
      .where(inArray(approvals.status, OPEN_APPROVAL_STATUSES)),
    db
      .select({ value: count() })
      .from(approvals)
      .where(and(eq(approvals.status, 'pending'), eq(approvals.approverUserId, context.user.id))),
  ])
  return { open: open?.value ?? 0, mine: mine?.value ?? 0 }
}

/** Aprovações de um projeto, para o painel da página do projeto. */
export async function listProjectApprovals(projectId: string): Promise<ApprovalRow[]> {
  const rows = await db
    .select({
      id: approvals.id,
      code: approvals.code,
      title: approvals.title,
      status: approvals.status,
      currentVersion: approvals.currentVersion,
      dueDate: approvals.dueDate,
      updatedAt: approvals.updatedAt,
      projectCode: projects.code,
      projectName: projects.name,
      clientName: clients.name,
      approverName: approver.name,
      contactName: contacts.name,
      requesterName: requester.name,
    })
    .from(approvals)
    .innerJoin(projects, eq(projects.id, approvals.projectId))
    .innerJoin(clients, eq(clients.id, approvals.clientId))
    .leftJoin(approver, eq(approver.id, approvals.approverUserId))
    .leftJoin(contacts, eq(contacts.id, approvals.approverContactId))
    .leftJoin(requester, eq(requester.id, approvals.requestedBy))
    .where(eq(approvals.projectId, projectId))
    .orderBy(
      sql`case when ${approvals.status} in ('pending', 'changes_requested') then 0 else 1 end`,
      desc(approvals.updatedAt),
    )

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    currentVersion: row.currentVersion,
    dueDate: row.dueDate,
    updatedAt: row.updatedAt,
    project: { id: projectId, code: row.projectCode, name: row.projectName },
    clientName: row.clientName,
    approverName: row.contactName ?? row.approverName,
    approverIsClient: Boolean(row.contactName),
    requesterName: row.requesterName,
  }))
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export interface ApprovalVersionDetail {
  id: string
  version: number
  status: ApprovalStatus
  notes: string | null
  submittedAt: Date
  submittedBy: { id: string; name: string } | null
  decidedAt: Date | null
  decidedBy: { id: string; name: string } | null
  decisionComment: string | null
  /** `null` quando o usuário não pode ver arquivos de aprovação. */
  files: FilePanelData | null
}

export interface ApprovalDetail {
  id: string
  code: string
  title: string
  description: string | null
  status: ApprovalStatus
  currentVersion: number
  dueDate: string | null
  createdAt: Date
  decidedAt: Date | null
  project: { id: string; code: string; name: string; status: string }
  client: { id: string; name: string }
  task: { id: string; code: string; title: string } | null
  requester: { id: string; name: string } | null
  approverUser: { id: string; name: string } | null
  approverContact: { id: string; name: string; jobTitle: string | null } | null
  /** Da mais recente para a mais antiga. */
  versions: ApprovalVersionDetail[]
}

export async function getApprovalDetail(
  context: AuthContext,
  approvalId: string,
): Promise<ApprovalDetail | null> {
  if (!context.can('approvals.read') || !isUuid(approvalId)) return null

  const [row] = await db
    .select({
      approval: approvals,
      projectCode: projects.code,
      projectName: projects.name,
      projectStatus: projects.status,
      clientName: clients.name,
      taskCode: tasks.code,
      taskTitle: tasks.title,
      requesterName: requester.name,
      approverName: approver.name,
      contactName: contacts.name,
      contactJobTitle: contacts.jobTitle,
    })
    .from(approvals)
    .innerJoin(projects, eq(projects.id, approvals.projectId))
    .innerJoin(clients, eq(clients.id, approvals.clientId))
    .leftJoin(tasks, eq(tasks.id, approvals.taskId))
    .leftJoin(requester, eq(requester.id, approvals.requestedBy))
    .leftJoin(approver, eq(approver.id, approvals.approverUserId))
    .leftJoin(contacts, eq(contacts.id, approvals.approverContactId))
    .where(eq(approvals.id, approvalId))
    .limit(1)

  if (!row) return null
  const { approval } = row

  const submitter = alias(users, 'submitter')
  const decider = alias(users, 'decider')

  const versions = await db
    .select({
      id: approvalVersions.id,
      version: approvalVersions.version,
      status: approvalVersions.status,
      notes: approvalVersions.notes,
      submittedAt: approvalVersions.submittedAt,
      submittedById: approvalVersions.submittedBy,
      submittedByName: submitter.name,
      decidedAt: approvalVersions.decidedAt,
      decidedById: approvalVersions.decidedBy,
      decidedByName: decider.name,
      decisionComment: approvalVersions.decisionComment,
    })
    .from(approvalVersions)
    .leftJoin(submitter, eq(submitter.id, approvalVersions.submittedBy))
    .leftJoin(decider, eq(decider.id, approvalVersions.decidedBy))
    .where(eq(approvalVersions.approvalId, approval.id))
    .orderBy(desc(approvalVersions.version))

  const panels = await Promise.all(
    versions.map((version) => getFilePanel(context, { type: 'approval_version', id: version.id })),
  )

  const person = (id: string | null, name: string | null) => (id && name ? { id, name } : null)

  return {
    id: approval.id,
    code: approval.code,
    title: approval.title,
    description: approval.description,
    status: approval.status,
    currentVersion: approval.currentVersion,
    dueDate: approval.dueDate,
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt,
    project: {
      id: approval.projectId,
      code: row.projectCode,
      name: row.projectName,
      status: row.projectStatus,
    },
    client: { id: approval.clientId, name: row.clientName },
    task:
      approval.taskId && row.taskCode && row.taskTitle
        ? { id: approval.taskId, code: row.taskCode, title: row.taskTitle }
        : null,
    requester: person(approval.requestedBy, row.requesterName),
    approverUser: person(approval.approverUserId, row.approverName),
    approverContact:
      approval.approverContactId && row.contactName
        ? { id: approval.approverContactId, name: row.contactName, jobTitle: row.contactJobTitle }
        : null,
    versions: versions.map((version, index) => ({
      id: version.id,
      version: version.version,
      status: version.status,
      notes: version.notes,
      submittedAt: version.submittedAt,
      submittedBy: person(version.submittedById, version.submittedByName),
      decidedAt: version.decidedAt,
      decidedBy: person(version.decidedById, version.decidedByName),
      decisionComment: version.decisionComment,
      files: panels[index] ?? null,
    })),
  }
}

// ── Opções de formulário ─────────────────────────────────────────────────────

export interface ContactOption {
  id: string
  name: string
  jobTitle: string | null
}

/** Contatos do cliente autorizados a aprovar — só esses podem ser escolhidos. */
export async function listApproverContacts(clientId: string): Promise<ContactOption[]> {
  return db
    .select({ id: contacts.id, name: contacts.name, jobTitle: contacts.jobTitle })
    .from(contacts)
    .where(
      and(
        eq(contacts.clientId, clientId),
        eq(contacts.canApprove, true),
        isNull(contacts.deletedAt),
      ),
    )
    .orderBy(asc(contacts.name))
}

/** Tarefas do projeto que podem originar o material. */
export async function listProjectTaskOptions(
  projectId: string,
): Promise<{ id: string; code: string; title: string }[]> {
  return db
    .select({ id: tasks.id, code: tasks.code, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), ne(tasks.status, 'cancelled')))
    .orderBy(asc(tasks.position))
}

/** Cliente do projeto — base das opções de contato aprovador. */
export async function getProjectClientId(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  return row?.clientId ?? null
}
