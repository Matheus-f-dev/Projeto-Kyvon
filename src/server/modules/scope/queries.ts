import { desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import { contractAddendums, contracts, projects, scopeChanges, users } from '@/server/db/schema'
import { getFilePanel, type FilePanelData } from '@/server/modules/files/queries'
import type { ScopeChangeStatus } from '@/shared/domain'
import { isUuid } from '@/shared/ids'

/**
 * Leitura de mudanças de escopo.
 *
 * O impacto financeiro segue a regra de valores de contrato: sem
 * `contracts.values.read` ele sai como `null` da consulta, junto com
 * `financialRestricted: true` — a tela mostra "restrito", não "sem valor".
 */

type Origin = (typeof scopeChanges.$inferSelect)['origin']

export interface ScopeChangeRow {
  id: string
  code: string
  title: string
  status: ScopeChangeStatus
  origin: Origin
  estimatedHours: string | null
  deadlineImpactDays: number | null
  financialImpact: string | null
  financialRestricted: boolean
  addendum: { id: string; code: string } | null
  project: { id: string; code: string; name: string }
  updatedAt: Date
}

function listQuery() {
  return db
    .select({
      id: scopeChanges.id,
      code: scopeChanges.code,
      title: scopeChanges.title,
      status: scopeChanges.status,
      origin: scopeChanges.origin,
      estimatedHours: scopeChanges.estimatedHours,
      deadlineImpactDays: scopeChanges.deadlineImpactDays,
      financialImpact: scopeChanges.financialImpact,
      addendumId: scopeChanges.addendumId,
      addendumCode: contractAddendums.code,
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      updatedAt: scopeChanges.updatedAt,
    })
    .from(scopeChanges)
    .innerJoin(projects, eq(projects.id, scopeChanges.projectId))
    .leftJoin(contractAddendums, eq(contractAddendums.id, scopeChanges.addendumId))
}

type ListRow = Awaited<ReturnType<ReturnType<typeof listQuery>['execute']>>[number]

function toRow(row: ListRow, canSeeValues: boolean): ScopeChangeRow {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    origin: row.origin,
    estimatedHours: row.estimatedHours,
    deadlineImpactDays: row.deadlineImpactDays,
    financialImpact: canSeeValues ? row.financialImpact : null,
    financialRestricted: !canSeeValues,
    addendum:
      row.addendumId && row.addendumCode ? { id: row.addendumId, code: row.addendumCode } : null,
    project: { id: row.projectId, code: row.projectCode, name: row.projectName },
    updatedAt: row.updatedAt,
  }
}

const ORDER = [
  sql`case when ${scopeChanges.status} in ('requested', 'under_analysis', 'awaiting_approval') then 0 else 1 end`,
  desc(scopeChanges.updatedAt),
]

export async function listProjectScopeChanges(
  context: AuthContext,
  projectId: string,
): Promise<ScopeChangeRow[]> {
  if (!context.can('scope.read')) return []
  const canSeeValues = context.can('contracts.values.read')
  const rows = await listQuery()
    .where(eq(scopeChanges.projectId, projectId))
    .orderBy(...ORDER)
  return rows.map((row) => toRow(row, canSeeValues))
}

export async function listContractScopeChanges(
  context: AuthContext,
  contractId: string,
): Promise<ScopeChangeRow[]> {
  if (!context.can('scope.read')) return []
  const canSeeValues = context.can('contracts.values.read')
  const rows = await listQuery()
    .where(eq(scopeChanges.contractId, contractId))
    .orderBy(...ORDER)
  return rows.map((row) => toRow(row, canSeeValues))
}

/**
 * Soma do que já foi aprovado (inclui implementado) — o quanto o projeto
 * cresceu além do contratado.
 */
export interface ScopeTotals {
  approvedCount: number
  hours: number
  days: number
  /** `null` sem permissão de valores. */
  value: number | null
}

export function summarizeApproved(rows: ScopeChangeRow[]): ScopeTotals {
  const approved = rows.filter((row) => row.status === 'approved' || row.status === 'implemented')
  const restricted = rows.some((row) => row.financialRestricted)
  return {
    approvedCount: approved.length,
    hours: approved.reduce((sum, row) => sum + Number(row.estimatedHours ?? 0), 0),
    days: approved.reduce((sum, row) => sum + (row.deadlineImpactDays ?? 0), 0),
    value: restricted
      ? null
      : approved.reduce((sum, row) => sum + Number(row.financialImpact ?? 0), 0),
  }
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export interface ScopeChangeDetail {
  id: string
  code: string
  title: string
  description: string
  status: ScopeChangeStatus
  origin: Origin
  impactDescription: string | null
  estimatedHours: string | null
  deadlineImpactDays: number | null
  financialImpact: string | null
  financialRestricted: boolean
  decisionComment: string | null
  createdAt: Date
  decidedAt: Date | null
  implementedAt: Date | null
  project: {
    id: string
    code: string
    name: string
    status: string
    dueDate: string | null
    clientId: string
  }
  contract: { id: string; code: string; status: string } | null
  addendum: { id: string; code: string; status: string } | null
  requester: { id: string; name: string } | null
  analyzer: { id: string; name: string } | null
  decider: { id: string; name: string } | null
  files: FilePanelData | null
}

export async function getScopeChangeDetail(
  context: AuthContext,
  id: string,
): Promise<ScopeChangeDetail | null> {
  if (!context.can('scope.read') || !isUuid(id)) return null

  const requester = alias(users, 'requester')
  const analyzer = alias(users, 'analyzer')
  const decider = alias(users, 'decider')

  const [row] = await db
    .select({
      change: scopeChanges,
      projectCode: projects.code,
      projectName: projects.name,
      projectStatus: projects.status,
      projectDueDate: projects.dueDate,
      clientId: projects.clientId,
      contractCode: contracts.code,
      contractStatus: contracts.status,
      addendumCode: contractAddendums.code,
      addendumStatus: contractAddendums.status,
      requesterName: requester.name,
      analyzerName: analyzer.name,
      deciderName: decider.name,
    })
    .from(scopeChanges)
    .innerJoin(projects, eq(projects.id, scopeChanges.projectId))
    .leftJoin(contracts, eq(contracts.id, scopeChanges.contractId))
    .leftJoin(contractAddendums, eq(contractAddendums.id, scopeChanges.addendumId))
    .leftJoin(requester, eq(requester.id, scopeChanges.requestedBy))
    .leftJoin(analyzer, eq(analyzer.id, scopeChanges.analyzedBy))
    .leftJoin(decider, eq(decider.id, scopeChanges.decidedBy))
    .where(eq(scopeChanges.id, id))
    .limit(1)

  if (!row) return null
  const { change } = row
  const canSeeValues = context.can('contracts.values.read')
  const person = (userId: string | null, name: string | null) =>
    userId && name ? { id: userId, name } : null

  return {
    id: change.id,
    code: change.code,
    title: change.title,
    description: change.description,
    status: change.status,
    origin: change.origin,
    impactDescription: change.impactDescription,
    estimatedHours: change.estimatedHours,
    deadlineImpactDays: change.deadlineImpactDays,
    financialImpact: canSeeValues ? change.financialImpact : null,
    financialRestricted: !canSeeValues,
    decisionComment: change.decisionComment,
    createdAt: change.createdAt,
    decidedAt: change.decidedAt,
    implementedAt: change.implementedAt,
    project: {
      id: change.projectId,
      code: row.projectCode,
      name: row.projectName,
      status: row.projectStatus,
      dueDate: row.projectDueDate,
      clientId: row.clientId,
    },
    contract:
      change.contractId && row.contractCode && row.contractStatus
        ? { id: change.contractId, code: row.contractCode, status: row.contractStatus }
        : null,
    addendum:
      change.addendumId && row.addendumCode && row.addendumStatus
        ? { id: change.addendumId, code: row.addendumCode, status: row.addendumStatus }
        : null,
    requester: person(change.requestedBy, row.requesterName),
    analyzer: person(change.analyzedBy, row.analyzerName),
    decider: person(change.decidedBy, row.deciderName),
    files: await getFilePanel(context, { type: 'scope_change', id: change.id }),
  }
}
