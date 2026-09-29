import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { PageContainer, PageHeader } from '@/components/layout/page'
import { MonthlyColumns, monthLabel } from '@/components/reports/monthly-columns'
import { Metric, Panel, PanelHeader } from '@/components/ui/panel'
import { NoPermissionState } from '@/components/ui/states'
import { cn } from '@/lib/cn'
import { formatCompactCurrency, formatCurrency } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import {
  getApprovalReport,
  getCommercialReport,
  getDeliveryReport,
  getFinancialReport,
  getSupportReport,
  parsePeriod,
  periodMonths,
  REPORT_PERIODS,
} from '@/server/modules/reports/queries'
import { SUPPORT_CATEGORY, statusMeta } from '@/shared/domain'

export const metadata: Metadata = { title: 'Relatórios' }
export const dynamic = 'force-dynamic'

/**
 * Relatórios — como a operação se comporta ao longo do tempo.
 *
 * Uma seção por pergunta, cada uma visível só para quem lê o módulo de origem.
 * Todo gráfico tem ao lado a tabela com os mesmos números.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  if (!context.can('reports.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="reports.read" />
      </PageContainer>
    )
  }

  const params = await searchParams
  const period = parsePeriod(params.periodo)
  const months = periodMonths(period)

  const [commercial, delivery, approvals, support, financial] = await Promise.all([
    getCommercialReport(context, months),
    getDeliveryReport(context, months),
    getApprovalReport(context, months),
    getSupportReport(context, months),
    getFinancialReport(context, months),
  ])

  const nothing = !commercial && !delivery && !approvals && !support && !financial
  const days = (value: number | null) =>
    value === null ? '—' : `${value.toLocaleString('pt-BR')} d`
  const hours = (value: number | null) =>
    value === null ? '—' : value >= 48 ? `${Math.round(value / 24)} d` : `${value} h`
  const percent = (value: number | null) => (value === null ? '—' : `${value}%`)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Relatórios"
        description={`Tendências dos últimos ${period} meses, de ${monthLabel(months[0]!, true)} a ${monthLabel(months[months.length - 1]!, true)}.`}
        actions={
          <nav aria-label="Período" className="border-line bg-sunken flex rounded-md border p-0.5">
            {REPORT_PERIODS.map((value) => (
              <Link
                key={value}
                href={value === 6 ? '/relatorios' : `/relatorios?periodo=${value}`}
                aria-current={value === period ? 'page' : undefined}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  value === period
                    ? 'bg-raised text-strong shadow-[var(--shadow-raised)]'
                    : 'text-muted hover:text-strong',
                )}
              >
                {value} meses
              </Link>
            ))}
          </nav>
        }
      />

      {nothing && (
        <NoPermissionState
          title="Nenhum relatório disponível"
          description="Seu perfil não lê nenhum dos módulos com relatório (comercial, tarefas, aprovações, suporte)."
        />
      )}

      {commercial && (
        <ReportSection
          title="Comercial"
          description="Quantas oportunidades entram, quantas fecham e quanto tempo levam."
          metrics={
            <>
              <Metric label="Oportunidades criadas" value={commercial.totals.created} />
              <Metric label="Ganhas" value={commercial.totals.won} tone="success" />
              <Metric
                label="Taxa de conversão"
                value={percent(commercial.winRate)}
                hint="Ganhas ÷ decididas no período"
              />
              <Metric
                label="Ciclo médio até o ganho"
                value={days(commercial.avgDaysToWin)}
                hint="Da criação ao ganho"
              />
            </>
          }
          chartTitle="Oportunidades ganhas por mês"
          chart={
            <MonthlyColumns
              data={commercial.months.map((row) => ({ month: row.month, value: row.won }))}
              unit="ganhas"
            />
          }
          table={
            <MonthTable
              months={commercial.months}
              columns={[
                { label: 'Criadas', value: (row) => row.created },
                { label: 'Ganhas', value: (row) => row.won },
                { label: 'Perdidas', value: (row) => row.lost },
                ...(commercial.totals.wonValue !== null
                  ? [
                      {
                        label: 'Valor ganho',
                        value: (row: (typeof commercial.months)[number]) =>
                          row.wonValue ? formatCompactCurrency(row.wonValue) : '—',
                      },
                    ]
                  : []),
              ]}
            />
          }
          aside={
            commercial.bySource.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">
                  Por origem
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {commercial.bySource.map((source) => (
                    <li
                      key={source.name}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-default truncate">{source.name}</span>
                      <span className="text-muted shrink-0" data-tabular>
                        {source.won}/{source.created} ganhas
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          }
        />
      )}

      {delivery && (
        <ReportSection
          title="Entrega"
          description="Ritmo de conclusão e pontualidade das tarefas e dos lançamentos."
          metrics={
            <>
              <Metric label="Tarefas concluídas" value={delivery.totals.tasksDone} />
              <Metric
                label="No prazo"
                value={percent(delivery.onTimeRate)}
                hint="Entre as tarefas que tinham prazo"
                tone={
                  delivery.onTimeRate !== null && delivery.onTimeRate < 70 ? 'warning' : 'neutral'
                }
              />
              <Metric label="Projetos lançados" value={delivery.totals.projectsLaunched} />
              <Metric label="Lançados no prazo" value={percent(delivery.projectsOnTimeRate)} />
            </>
          }
          chartTitle="Tarefas concluídas por mês"
          chart={
            <MonthlyColumns
              data={delivery.months.map((row) => ({ month: row.month, value: row.tasksDone }))}
              unit="tarefas"
            />
          }
          table={
            <MonthTable
              months={delivery.months}
              columns={[
                { label: 'Concluídas', value: (row) => row.tasksDone },
                { label: 'No prazo', value: (row) => row.tasksOnTime },
                { label: 'Lançamentos', value: (row) => row.projectsLaunched },
              ]}
            />
          }
        />
      )}

      {approvals && (
        <ReportSection
          title="Aprovações"
          description="Quanto retrabalho o material sofre antes de ser aprovado."
          metrics={
            <>
              <Metric label="Decididas" value={approvals.decided} />
              <Metric
                label="Aprovadas de primeira"
                value={percent(approvals.firstRoundRate)}
                tone="success"
              />
              <Metric
                label="Versões por aprovação"
                value={approvals.avgRounds?.toLocaleString('pt-BR') ?? '—'}
                hint="Média de rodadas"
              />
              <Metric label="Tempo até a decisão" value={days(approvals.avgDaysToDecision)} />
            </>
          }
          chartTitle="Aprovações decididas por mês"
          chart={
            <MonthlyColumns
              data={approvals.months.map((row) => ({ month: row.month, value: row.decided }))}
              unit="decididas"
            />
          }
          table={
            <MonthTable
              months={approvals.months}
              columns={[{ label: 'Decididas', value: (row) => row.decided }]}
            />
          }
        />
      )}

      {support && (
        <ReportSection
          title="Suporte"
          description="O que os clientes pedem depois do lançamento e quão rápido respondemos."
          metrics={
            <>
              <Metric label="Chamados abertos" value={support.totals.opened} />
              <Metric label="Resolvidos" value={support.totals.resolved} tone="success" />
              <Metric label="1ª resposta (média)" value={hours(support.avgFirstResponseHours)} />
              <Metric label="Resolução (média)" value={hours(support.avgResolutionHours)} />
            </>
          }
          chartTitle="Chamados abertos por mês"
          chart={
            <MonthlyColumns
              data={support.months.map((row) => ({ month: row.month, value: row.opened }))}
              unit="chamados"
            />
          }
          table={
            <MonthTable
              months={support.months}
              columns={[
                { label: 'Abertos', value: (row) => row.opened },
                { label: 'Resolvidos', value: (row) => row.resolved },
              ]}
            />
          }
          aside={
            support.byCategory.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">
                  Por tipo
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {support.byCategory.map((row) => (
                    <li
                      key={row.category}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-default">
                        {statusMeta(SUPPORT_CATEGORY, row.category).label}
                      </span>
                      <span className="text-muted" data-tabular>
                        {row.count}
                      </span>
                    </li>
                  ))}
                </ul>
                {support.totals.convertedToOpportunity > 0 && (
                  <p className="text-2xs text-muted">
                    {support.totals.convertedToOpportunity}{' '}
                    {support.totals.convertedToOpportunity === 1
                      ? 'chamado virou oportunidade'
                      : 'chamados viraram oportunidades'}{' '}
                    no Comercial.
                  </p>
                )}
              </div>
            )
          }
        />
      )}

      {financial && (
        <ReportSection
          title="Financeiro"
          description="Valor contratado por mês de assinatura, sem contratos cancelados."
          metrics={
            <>
              <Metric
                label="Valor contratado"
                value={formatCompactCurrency(financial.totalValue)}
              />
              <Metric label="Contratos assinados" value={financial.signed} />
              <Metric
                label="Ticket médio"
                value={
                  financial.signed > 0
                    ? formatCompactCurrency(financial.totalValue / financial.signed)
                    : '—'
                }
              />
            </>
          }
          chartTitle="Valor contratado por mês"
          chart={
            <MonthlyColumns
              data={financial.months.map((row) => ({ month: row.month, value: row.value }))}
              format={(value) => formatCompactCurrency(value)}
            />
          }
          table={
            <MonthTable
              months={financial.months}
              columns={[
                { label: 'Assinados', value: (row) => row.signed },
                { label: 'Valor', value: (row) => (row.value ? formatCurrency(row.value) : '—') },
              ]}
            />
          }
        />
      )}
    </PageContainer>
  )
}

function ReportSection({
  title,
  description,
  metrics,
  chartTitle,
  chart,
  table,
  aside,
}: {
  title: string
  description: string
  metrics: ReactNode
  chartTitle: string
  chart: ReactNode
  table: ReactNode
  aside?: ReactNode
}) {
  return (
    <Panel>
      <PanelHeader title={title} description={description} />
      <div className="grid grid-cols-2 gap-5 px-4 py-4 lg:grid-cols-4">{metrics}</div>
      <div className="border-line grid gap-5 border-t px-4 py-4 lg:grid-cols-[1fr_16rem]">
        <figure className="flex min-w-0 flex-col gap-3">
          <figcaption className="text-muted text-xs">{chartTitle}</figcaption>
          {chart}
          <details className="group">
            <summary className="text-2xs text-brand-text w-fit cursor-pointer">
              <span className="group-open:hidden">Ver tabela</span>
              <span className="hidden group-open:inline">Ocultar tabela</span>
            </summary>
            <div className="mt-2 overflow-x-auto">{table}</div>
          </details>
        </figure>
        {aside && <aside className="lg:border-line lg:border-l lg:pl-5">{aside}</aside>}
      </div>
    </Panel>
  )
}

function MonthTable<T extends { month: string }>({
  months,
  columns,
}: {
  months: T[]
  columns: { label: string; value: (row: T) => ReactNode }[]
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-subtle text-left">
          <th className="py-1 pr-3 font-medium">Mês</th>
          {columns.map((column) => (
            <th key={column.label} className="py-1 pr-3 text-right font-medium">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--line-subtle)]">
        {months.map((row) => (
          <tr key={row.month}>
            <td className="text-default py-1 pr-3">{monthLabel(row.month, true)}</td>
            {columns.map((column) => (
              <td key={column.label} className="text-default py-1 pr-3 text-right" data-tabular>
                {column.value(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
