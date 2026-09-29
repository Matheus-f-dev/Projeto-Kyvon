import { and, count, gte, isNotNull, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  approvals,
  contracts,
  leadSources,
  opportunities,
  projects,
  supportTickets,
  tasks,
} from '@/server/db/schema'
import { getEnv } from '@/server/env'

/**
 * Relatórios: como a operação se comporta ao longo do tempo.
 *
 * O dashboard responde "o que está acontecendo agora"; aqui a pergunta é de
 * tendência — ritmo de entrega, conversão, retrabalho em aprovações, volume
 * de suporte. Tudo agregado no banco, por mês no fuso da empresa.
 *
 * Cada bloco só é consultado para quem pode ler o módulo de origem, e valores
 * financeiros só para quem tem a permissão de valores.
 */

export const REPORT_PERIODS = [3, 6, 12] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

export function parsePeriod(value: string | undefined): ReportPeriod {
  const parsed = Number(value)
  return (REPORT_PERIODS as readonly number[]).includes(parsed) ? (parsed as ReportPeriod) : 6
}

/** Meses do período, do mais antigo ao atual, como `AAAA-MM` no fuso da empresa. */
export function periodMonths(period: ReportPeriod, reference: Date = new Date()): string[] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getEnv().APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(reference)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  return Array.from({ length: period }, (_, index) => {
    const offset = month - 1 - (period - 1 - index)
    const y = year + Math.floor(offset / 12)
    const m = ((offset % 12) + 12) % 12
    return `${y}-${String(m + 1).padStart(2, '0')}`
  })
}

/** Primeiro instante do período, para o filtro `>=` no banco. */
function periodStart(months: string[]): Date {
  // Um dia de folga antes cobre a diferença de fuso; o agrupamento por mês
  // descarta o que cair fora da lista.
  return new Date(`${months[0]}-01T00:00:00-12:00`)
}

function monthOf(column: PgColumn | SQL): SQL<string> {
  const zone = getEnv().APP_TIMEZONE
  return sql<string>`to_char(${column} at time zone ${zone}, 'YYYY-MM')`
}

async function monthlyCount(
  table: PgTable,
  column: PgColumn,
  months: string[],
  extra?: SQL,
): Promise<Map<string, number>> {
  const bucket = monthOf(column)
  const rows = await db
    .select({ month: bucket, value: count() })
    .from(table)
    .where(and(isNotNull(column), gte(column, periodStart(months)), extra))
    .groupBy(sql`1`)
  return new Map(rows.map((row) => [row.month, row.value]))
}

const pick = (map: Map<string, number>, month: string) => map.get(month) ?? 0

const ratio = (part: number, total: number): number | null =>
  total > 0 ? Math.round((part / total) * 100) : null

// ── Comercial ────────────────────────────────────────────────────────────────

export interface CommercialReport {
  months: { month: string; created: number; won: number; lost: number; wonValue: number | null }[]
  totals: { created: number; won: number; lost: number; wonValue: number | null }
  /** Ganhas ÷ decididas (ganhas + perdidas) no período. */
  winRate: number | null
  /** Dias entre a criação e o ganho, em média. */
  avgDaysToWin: number | null
  bySource: { name: string; created: number; won: number }[]
}

export async function getCommercialReport(
  context: AuthContext,
  months: string[],
): Promise<CommercialReport | null> {
  if (!context.can('crm.read')) return null
  const canSeeValues = context.can('crm.values.read')
  const start = periodStart(months)

  const wonBucket = monthOf(opportunities.wonAt)
  const [created, won, lost, wonValues, cycle, sources] = await Promise.all([
    monthlyCount(opportunities, opportunities.createdAt, months),
    monthlyCount(opportunities, opportunities.wonAt, months),
    monthlyCount(opportunities, opportunities.lostAt, months),
    canSeeValues
      ? db
          .select({
            month: wonBucket,
            value: sql<string>`coalesce(sum(${opportunities.estimatedValue}), 0)`,
          })
          .from(opportunities)
          .where(and(isNotNull(opportunities.wonAt), gte(opportunities.wonAt, start)))
          .groupBy(sql`1`)
      : Promise.resolve([]),
    db
      .select({
        value: sql<
          string | null
        >`avg(extract(epoch from (${opportunities.wonAt} - ${opportunities.createdAt})) / 86400)`,
      })
      .from(opportunities)
      .where(
        and(
          isNotNull(opportunities.wonAt),
          gte(opportunities.wonAt, start),
          // Registro com ganho anterior à criação (importação, correção manual)
          // distorceria a média — fica fora dela.
          gte(opportunities.wonAt, opportunities.createdAt),
        ),
      ),
    db
      .select({
        name: sql<string>`coalesce(${leadSources.name}, 'Não informada')`,
        created: count(),
        won: sql<number>`count(${opportunities.wonAt})::int`,
      })
      .from(opportunities)
      .leftJoin(leadSources, sql`${leadSources.id} = ${opportunities.sourceId}`)
      .where(gte(opportunities.createdAt, start))
      .groupBy(leadSources.name)
      .orderBy(sql`count(*) desc`),
  ])

  const valueByMonth = new Map(wonValues.map((row) => [row.month, Number(row.value)]))
  const rows = months.map((month) => ({
    month,
    created: pick(created, month),
    won: pick(won, month),
    lost: pick(lost, month),
    wonValue: canSeeValues ? (valueByMonth.get(month) ?? 0) : null,
  }))
  const totals = rows.reduce(
    (sum, row) => ({
      created: sum.created + row.created,
      won: sum.won + row.won,
      lost: sum.lost + row.lost,
      wonValue: canSeeValues ? (sum.wonValue ?? 0) + (row.wonValue ?? 0) : null,
    }),
    {
      created: 0,
      won: 0,
      lost: 0,
      wonValue: canSeeValues ? 0 : null,
    } as CommercialReport['totals'],
  )
  const avg = cycle[0]?.value

  return {
    months: rows,
    totals,
    winRate: ratio(totals.won, totals.won + totals.lost),
    avgDaysToWin: avg === null || avg === undefined ? null : Math.round(Number(avg)),
    bySource: sources,
  }
}

// ── Entrega ──────────────────────────────────────────────────────────────────

export interface DeliveryReport {
  months: { month: string; tasksDone: number; tasksOnTime: number; projectsLaunched: number }[]
  totals: { tasksDone: number; tasksWithDue: number; tasksOnTime: number; projectsLaunched: number }
  /** Tarefas concluídas até o prazo ÷ concluídas que tinham prazo. */
  onTimeRate: number | null
  projectsOnTimeRate: number | null
}

export async function getDeliveryReport(
  context: AuthContext,
  months: string[],
): Promise<DeliveryReport | null> {
  if (!context.can('tasks.read') && !context.can('projects.read')) return null
  const start = periodStart(months)
  const zone = getEnv().APP_TIMEZONE
  const bucket = monthOf(tasks.completedAt)
  const onTime = sql`(${tasks.completedAt} at time zone ${zone})::date <= ${tasks.dueDate}`

  const [taskRows, launched, projectPunctuality] = await Promise.all([
    context.can('tasks.read')
      ? db
          .select({
            month: bucket,
            done: count(),
            withDue: sql<number>`count(${tasks.dueDate})::int`,
            onTime: sql<number>`count(*) filter (where ${onTime})::int`,
          })
          .from(tasks)
          .where(and(isNotNull(tasks.completedAt), gte(tasks.completedAt, start)))
          .groupBy(sql`1`)
      : Promise.resolve([]),
    context.can('projects.read')
      ? monthlyCount(projects, projects.launchedAt, months)
      : Promise.resolve(new Map<string, number>()),
    context.can('projects.read')
      ? db
          .select({
            withDue: sql<number>`count(${projects.dueDate})::int`,
            onTime: sql<number>`count(*) filter (where (${projects.launchedAt} at time zone ${zone})::date <= ${projects.dueDate})::int`,
          })
          .from(projects)
          .where(and(isNotNull(projects.launchedAt), gte(projects.launchedAt, start)))
      : Promise.resolve([]),
  ])

  const byMonth = new Map(taskRows.map((row) => [row.month, row]))
  const rows = months.map((month) => ({
    month,
    tasksDone: byMonth.get(month)?.done ?? 0,
    tasksOnTime: byMonth.get(month)?.onTime ?? 0,
    projectsLaunched: pick(launched, month),
  }))
  const totals = {
    tasksDone: rows.reduce((sum, row) => sum + row.tasksDone, 0),
    tasksWithDue: taskRows
      .filter((row) => months.includes(row.month))
      .reduce((sum, row) => sum + row.withDue, 0),
    tasksOnTime: rows.reduce((sum, row) => sum + row.tasksOnTime, 0),
    projectsLaunched: rows.reduce((sum, row) => sum + row.projectsLaunched, 0),
  }
  const punctuality = projectPunctuality[0]

  return {
    months: rows,
    totals,
    onTimeRate: ratio(totals.tasksOnTime, totals.tasksWithDue),
    projectsOnTimeRate: punctuality ? ratio(punctuality.onTime, punctuality.withDue) : null,
  }
}

// ── Aprovações ───────────────────────────────────────────────────────────────

export interface ApprovalReport {
  months: { month: string; decided: number }[]
  decided: number
  /** Aprovadas na primeira versão ÷ aprovadas. */
  firstRoundRate: number | null
  avgRounds: number | null
  avgDaysToDecision: number | null
}

export async function getApprovalReport(
  context: AuthContext,
  months: string[],
): Promise<ApprovalReport | null> {
  if (!context.can('approvals.read')) return null
  const start = periodStart(months)
  const approved = sql`${approvals.status} = 'approved'`

  const [decided, summary] = await Promise.all([
    monthlyCount(approvals, approvals.decidedAt, months),
    db
      .select({
        decided: count(),
        approved: sql<number>`count(*) filter (where ${approved})::int`,
        firstRound: sql<number>`count(*) filter (where ${approved} and ${approvals.currentVersion} = 1)::int`,
        // `current_version` espelha o número de versões da aprovação.
        avgRounds: sql<string | null>`avg(${approvals.currentVersion})`,
        avgDays: sql<
          string | null
        >`avg(extract(epoch from (${approvals.decidedAt} - ${approvals.createdAt})) / 86400) filter (where ${approvals.decidedAt} >= ${approvals.createdAt})`,
      })
      .from(approvals)
      .where(and(isNotNull(approvals.decidedAt), gte(approvals.decidedAt, start))),
  ])

  const row = summary[0]
  const months_ = months.map((month) => ({ month, decided: pick(decided, month) }))
  return {
    months: months_,
    decided: months_.reduce((sum, item) => sum + item.decided, 0),
    firstRoundRate: row ? ratio(row.firstRound, row.approved) : null,
    avgRounds: row?.avgRounds ? Math.round(Number(row.avgRounds) * 10) / 10 : null,
    avgDaysToDecision: row?.avgDays ? Math.round(Number(row.avgDays) * 10) / 10 : null,
  }
}

// ── Suporte ──────────────────────────────────────────────────────────────────

export interface SupportReport {
  months: { month: string; opened: number; resolved: number }[]
  totals: { opened: number; resolved: number; convertedToOpportunity: number }
  byCategory: { category: (typeof supportTickets.$inferSelect)['category']; count: number }[]
  avgFirstResponseHours: number | null
  avgResolutionHours: number | null
}

export async function getSupportReport(
  context: AuthContext,
  months: string[],
): Promise<SupportReport | null> {
  if (!context.can('support.read')) return null
  const start = periodStart(months)
  const inPeriod = gte(supportTickets.createdAt, start)

  const [opened, resolved, categories, summary] = await Promise.all([
    monthlyCount(supportTickets, supportTickets.createdAt, months),
    monthlyCount(supportTickets, supportTickets.resolvedAt, months),
    db
      .select({ category: supportTickets.category, count: count() })
      .from(supportTickets)
      .where(inPeriod)
      .groupBy(supportTickets.category)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        converted: sql<number>`count(${supportTickets.convertedOpportunityId})::int`,
        firstResponse: sql<
          string | null
        >`avg(extract(epoch from (${supportTickets.firstResponseAt} - ${supportTickets.createdAt})) / 3600) filter (where ${supportTickets.firstResponseAt} >= ${supportTickets.createdAt})`,
        resolution: sql<
          string | null
        >`avg(extract(epoch from (${supportTickets.resolvedAt} - ${supportTickets.createdAt})) / 3600) filter (where ${supportTickets.resolvedAt} >= ${supportTickets.createdAt})`,
      })
      .from(supportTickets)
      .where(inPeriod),
  ])

  const rows = months.map((month) => ({
    month,
    opened: pick(opened, month),
    resolved: pick(resolved, month),
  }))
  const row = summary[0]
  const hours = (value: string | null | undefined) =>
    value === null || value === undefined ? null : Math.round(Number(value))

  return {
    months: rows,
    totals: {
      opened: rows.reduce((sum, item) => sum + item.opened, 0),
      resolved: rows.reduce((sum, item) => sum + item.resolved, 0),
      convertedToOpportunity: row?.converted ?? 0,
    },
    byCategory: categories,
    avgFirstResponseHours: hours(row?.firstResponse),
    avgResolutionHours: hours(row?.resolution),
  }
}

// ── Financeiro ───────────────────────────────────────────────────────────────

export interface FinancialReport {
  months: { month: string; signed: number; value: number }[]
  totalValue: number
  signed: number
}

/** Valor contratado por mês de assinatura. Exige `reports.financial.read`. */
export async function getFinancialReport(
  context: AuthContext,
  months: string[],
): Promise<FinancialReport | null> {
  if (!context.can('reports.financial.read')) return null
  const bucket = monthOf(contracts.signedAt)
  const rows = await db
    .select({
      month: bucket,
      signed: count(),
      value: sql<string>`coalesce(sum(${contracts.totalValue}), 0)`,
    })
    .from(contracts)
    .where(
      and(
        isNotNull(contracts.signedAt),
        gte(contracts.signedAt, periodStart(months)),
        sql`${contracts.status} <> 'cancelled'`,
      ),
    )
    .groupBy(sql`1`)

  const byMonth = new Map(rows.map((row) => [row.month, row]))
  const list = months.map((month) => ({
    month,
    signed: byMonth.get(month)?.signed ?? 0,
    value: Number(byMonth.get(month)?.value ?? 0),
  }))
  return {
    months: list,
    totalValue: list.reduce((sum, item) => sum + item.value, 0),
    signed: list.reduce((sum, item) => sum + item.signed, 0),
  }
}
