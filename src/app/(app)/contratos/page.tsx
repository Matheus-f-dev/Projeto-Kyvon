import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, FileText } from 'lucide-react'

import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TDPrimary, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { formatCurrency, formatDate, formatDeadline } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { listContracts, listExpiringContracts } from '@/server/modules/contracts/queries'
import { listUserOptions } from '@/server/modules/users/queries'
import { CONTRACT_STATUS } from '@/shared/domain'
import { contractStatusValues } from '@/shared/schemas/contracts'

import { ContractFormDialog } from './contract-form-dialog'

export const metadata: Metadata = { title: 'Contratos' }
export const dynamic = 'force-dynamic'

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  if (!context.can('contracts.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="contracts.read" />
      </PageContainer>
    )
  }

  const canWrite = context.can('contracts.write')
  const canSeeValues = context.can('contracts.values.read')

  const [result, alerts, owners] = await Promise.all([
    listContracts(context, {
      q: params.q,
      status: params.status,
      page: params.page ? Number(params.page) : 1,
    }),
    listExpiringContracts(context),
    canWrite ? listUserOptions() : Promise.resolve([]),
  ])

  const hasFilters = Boolean(params.q || params.status)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Contratos"
        description="O que foi acordado, por quanto e até quando."
        actions={
          canWrite && (
            <ContractFormDialog
              owners={owners}
              canSeeValues={canSeeValues}
              defaultOpen={params.novo === '1'}
            />
          )
        }
      />

      {alerts.length > 0 && (
        <Panel>
          <PanelHeader
            title="Vencendo nos próximos 30 dias"
            description="Contratos e períodos de suporte que precisam de renovação ou encerramento."
          />
          <ul className="divide-y divide-[var(--line-subtle)]">
            {alerts.map((alert) => (
              <li key={`${alert.kind}-${alert.id}`}>
                <Link
                  href={`/contratos/${alert.id}`}
                  className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors"
                >
                  <CalendarClock className="text-warning size-4 shrink-0" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-strong truncate text-sm font-medium">{alert.title}</span>
                    <span className="text-2xs text-muted truncate">{alert.clientName}</span>
                  </div>
                  <Badge tone={alert.kind === 'contract' ? 'warning' : 'info'} size="md">
                    {alert.kind === 'contract' ? 'Contrato' : 'Suporte'} ·{' '}
                    {formatDeadline(alert.dueDate)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar por título ou código…" />
            <ListFilterSelect
              paramKey="status"
              placeholder="Todos os status"
              options={contractStatusValues.map((value) => ({
                value,
                label: CONTRACT_STATUS[value].label,
              }))}
            />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={params.q} />
          ) : (
            <EmptyState
              icon={<FileText />}
              title="Nenhum contrato ainda"
              description="Contratos nascem de oportunidades ganhas no Comercial, pela ação “Converter em contrato”."
            />
          )
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Contrato</TH>
                    <TH className="hidden md:table-cell">Cliente</TH>
                    {canSeeValues && <TH align="right">Valor</TH>}
                    <TH>Vigência</TH>
                    <TH className="hidden lg:table-cell">Suporte até</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((contract) => (
                    <TR key={contract.id} interactive>
                      <TDPrimary
                        title={
                          <Link href={`/contratos/${contract.id}`} className="hover:underline">
                            {contract.title}
                          </Link>
                        }
                        subtitle={contract.code}
                      />
                      <TD className="hidden md:table-cell">
                        <span className="text-muted text-xs">{contract.clientName}</span>
                      </TD>
                      {canSeeValues && (
                        <TD align="right" data-tabular>
                          {formatCurrency(contract.totalValue)}
                        </TD>
                      )}
                      <TD>
                        <span className="text-muted text-xs">
                          {formatDate(contract.startDate)} — {formatDate(contract.endDate)}
                        </span>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-muted text-xs">
                          {formatDate(contract.supportEndsAt)}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge map={CONTRACT_STATUS} value={contract.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </Panel>
    </PageContainer>
  )
}
