import { GitPullRequestArrow } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { EntityCode } from '@/components/ui/misc'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, RestrictedValue } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCurrency, formatDayImpact, formatHours } from '@/lib/format'
import { summarizeApproved, type ScopeChangeRow } from '@/server/modules/scope/queries'
import { SCOPE_CHANGE_STATUS } from '@/shared/domain'

import { ScopeLink } from './scope-link'

/**
 * Mudanças de escopo de um projeto ou contrato.
 *
 * O cabeçalho soma o que já foi aprovado — quanto o trabalho cresceu além do
 * contratado —, que é a pergunta que a lista sozinha não responde.
 *
 * `linkMode`: `drawer` abre na página atual (projeto); `project` leva à
 * página do projeto (a partir do contrato).
 */
export function ScopePanel({
  rows,
  actions,
  linkMode,
  showProject = false,
}: {
  rows: ScopeChangeRow[]
  actions?: ReactNode
  linkMode: 'drawer' | 'project'
  showProject?: boolean
}) {
  const totals = summarizeApproved(rows)
  const open = rows.filter(
    (row) =>
      row.status === 'requested' ||
      row.status === 'under_analysis' ||
      row.status === 'awaiting_approval',
  ).length

  const description =
    totals.approvedCount > 0 ? (
      <>
        Aprovado: +{formatHours(totals.hours)} · {formatDayImpact(totals.days)}
        {totals.value !== null && totals.value !== 0 && <> · {formatCurrency(totals.value)}</>}
        {open > 0 && <> · {open} em aberto</>}
      </>
    ) : open > 0 ? (
      `${open} em aberto`
    ) : undefined

  return (
    <Panel>
      <PanelHeader title="Mudanças de escopo" description={description} actions={actions} />
      {rows.length === 0 ? (
        <EmptyState compact icon={<GitPullRequestArrow />} title="Nenhuma mudança registrada" />
      ) : (
        <ul className="divide-y divide-[var(--line-subtle)]">
          {rows.map((row) => {
            const content = (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-strong truncate text-sm font-medium">{row.title}</span>
                  <span className="text-2xs text-muted flex items-center gap-1.5 truncate">
                    <EntityCode code={row.code} />
                    {showProject && <> · {row.project.name}</>}
                    {row.estimatedHours !== null && <> · {formatHours(row.estimatedHours)}</>}
                    {row.deadlineImpactDays !== null && (
                      <> · {formatDayImpact(row.deadlineImpactDays)}</>
                    )}
                    {row.financialRestricted ? (
                      <>
                        {' · '}
                        <RestrictedValue />
                      </>
                    ) : (
                      row.financialImpact !== null && <> · {formatCurrency(row.financialImpact)}</>
                    )}
                    {row.addendum && <> · aditivo {row.addendum.code}</>}
                  </span>
                </div>
                <StatusBadge map={SCOPE_CHANGE_STATUS} value={row.status} />
              </>
            )
            const className = 'hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors'
            return (
              <li key={row.id}>
                {linkMode === 'drawer' ? (
                  <ScopeLink scopeChangeId={row.id} className={className}>
                    {content}
                  </ScopeLink>
                ) : (
                  <Link href={`/projetos/${row.project.id}?escopo=${row.id}`} className={className}>
                    {content}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
