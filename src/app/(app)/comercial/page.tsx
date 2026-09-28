import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LayoutGrid, List, Target } from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/layout/page'
import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TDPrimary, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { formatCurrency, formatRelative } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { listUserOptions } from '@/server/modules/users/queries'
import { getClientDetail } from '@/server/modules/clients/queries'
import {
  getOpportunityDetail,
  getPipelineBoard,
  listLeadSourceOptions,
  listLeads,
  listOpportunities,
  listProposals,
  listServiceTypeOptions,
} from '@/server/modules/crm/queries'
import {
  LEAD_STATUS,
  OPPORTUNITY_STAGE,
  PIPELINE_STAGES,
  type OpportunityStage,
} from '@/shared/domain'
import { leadStatusValues } from '@/shared/schemas/crm'

import { ConvertLeadDialog } from './convert-lead-dialog'
import { LeadFormDialog } from './lead-form-dialog'
import { OpportunityDrawer } from './opportunity-drawer'
import { OpportunityFormDialog } from './opportunity-form-dialog'
import { PipelineBoard } from './pipeline-board'
import { DiscardLeadButton } from './discard-lead-button'

export const metadata: Metadata = { title: 'Comercial' }
export const dynamic = 'force-dynamic'

interface ComercialPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function ComercialPage({ searchParams }: ComercialPageProps) {
  const context = await requireAuth()
  const params = await searchParams

  if (!context.can('crm.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="crm.read" />
      </PageContainer>
    )
  }

  const canWrite = context.can('crm.write')
  const canConvert = context.can('crm.convert')
  const view = params.view === 'lista' ? 'lista' : 'kanban'
  const section = params.aba === 'leads' ? 'leads' : 'pipeline'

  const [owners, sources, serviceTypes, leadsResult] = await Promise.all([
    listUserOptions(),
    listLeadSourceOptions(),
    listServiceTypeOptions(),
    listLeads({ status: params.status, q: params.q, page: params.page ? Number(params.page) : 1 }),
  ])

  const formOptions = { owners, sources, serviceTypes }

  const [board, listResult] = await Promise.all([
    view === 'kanban' && section === 'pipeline' ? getPipelineBoard(context) : Promise.resolve(null),
    view === 'lista' && section === 'pipeline'
      ? listOpportunities(context, {
          q: params.q,
          stage: params.stage as OpportunityStage | undefined,
          page: params.page ? Number(params.page) : 1,
        })
      : Promise.resolve(null),
  ])

  let presetClientDefaults:
    { clientId: string; clientLabel: string; clientCode: string } | undefined
  if (params.clienteId) {
    const client = await getClientDetail(params.clienteId)
    if (client) {
      presetClientDefaults = {
        clientId: client.id,
        clientLabel: client.name,
        clientCode: client.code,
      }
    }
  }

  let drawer = null
  if (params.oportunidade) {
    const opportunity = await getOpportunityDetail(context, params.oportunidade)
    if (!opportunity) notFound()
    const proposals = await listProposals(context, params.oportunidade)
    drawer = (
      <OpportunityDrawer
        opportunity={opportunity}
        proposals={proposals}
        formOptions={formOptions}
        canWrite={canWrite}
        canConvert={canConvert}
      />
    )
  }

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Comercial"
        description="Pipeline de oportunidades e leads em qualificação."
        actions={
          canWrite && (
            <>
              <LeadFormDialog options={formOptions} defaultOpen={params.novoLead === '1'} />
              <OpportunityFormDialog
                options={formOptions}
                defaultValues={presetClientDefaults}
                lockClient={Boolean(presetClientDefaults)}
                defaultOpen={params.nova === '1'}
              />
            </>
          )
        }
      />

      <div className="border-line flex items-center gap-1 border-b">
        <Link
          href="/comercial"
          className={`-mb-px border-b-2 px-2.5 py-2 text-sm font-medium transition-colors ${
            section === 'pipeline'
              ? 'border-brand text-strong'
              : 'text-muted hover:text-strong border-transparent'
          }`}
        >
          Pipeline
        </Link>
        <Link
          href="/comercial?aba=leads"
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors ${
            section === 'leads'
              ? 'border-brand text-strong'
              : 'text-muted hover:text-strong border-transparent'
          }`}
        >
          Leads
          {leadsResult.total > 0 && (
            <span
              className="bg-neutral-soft text-2xs text-muted rounded px-1 font-semibold"
              data-tabular
            >
              {leadsResult.total}
            </span>
          )}
        </Link>
      </div>

      {section === 'pipeline' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ListToolbar>
              <ListSearchInput placeholder="Buscar oportunidade ou cliente…" />
              {view === 'lista' && (
                <ListFilterSelect
                  paramKey="stage"
                  placeholder="Todas as etapas"
                  options={PIPELINE_STAGES.map((stage) => ({
                    value: stage,
                    label: OPPORTUNITY_STAGE[stage].label,
                  }))}
                />
              )}
            </ListToolbar>

            <div className="bg-sunken flex items-center gap-0.5 rounded-md p-0.5">
              <Link
                href={{ query: { ...params, view: 'kanban', page: undefined } }}
                className={`flex size-7 items-center justify-center rounded transition-colors ${
                  view === 'kanban'
                    ? 'bg-raised text-strong shadow-[var(--shadow-raised)]'
                    : 'text-subtle hover:text-muted'
                }`}
                aria-label="Visualização kanban"
              >
                <LayoutGrid className="size-3.5" />
              </Link>
              <Link
                href={{ query: { ...params, view: 'lista', page: undefined } }}
                className={`flex size-7 items-center justify-center rounded transition-colors ${
                  view === 'lista'
                    ? 'bg-raised text-strong shadow-[var(--shadow-raised)]'
                    : 'text-subtle hover:text-muted'
                }`}
                aria-label="Visualização em lista"
              >
                <List className="size-3.5" />
              </Link>
            </div>
          </div>

          {view === 'kanban' &&
            board &&
            (board.every((column) => column.cards.length === 0) ? (
              <EmptyState
                icon={<Target />}
                title="Nenhuma oportunidade em negociação"
                description="Crie uma oportunidade ou converta um lead qualificado."
              />
            ) : (
              <PipelineBoard columns={board} canWrite={canWrite} />
            ))}

          {view === 'lista' && listResult && (
            <Panel>
              {listResult.items.length === 0 ? (
                <NoResultsState query={params.q} />
              ) : (
                <>
                  <TableContainer>
                    <Table>
                      <THead>
                        <tr>
                          <TH>Oportunidade</TH>
                          <TH>Etapa</TH>
                          <TH align="right">Valor</TH>
                          <TH>Responsável</TH>
                          <TH>Atualizada</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {listResult.items.map((row) => (
                          <TR key={row.id} interactive>
                            <TDPrimary
                              title={
                                <Link
                                  href={`/comercial?oportunidade=${row.id}`}
                                  className="hover:underline"
                                >
                                  {row.title}
                                </Link>
                              }
                              subtitle={row.clientName}
                            />
                            <TD>
                              <StatusBadge map={OPPORTUNITY_STAGE} value={row.stage} />
                            </TD>
                            <TD align="right" data-tabular>
                              {row.estimatedValue !== null
                                ? formatCurrency(row.estimatedValue)
                                : '—'}
                            </TD>
                            <TD>
                              <span className="text-muted text-xs">{row.ownerName ?? '—'}</span>
                            </TD>
                            <TD>
                              <span className="text-muted text-xs">
                                {formatRelative(row.updatedAt)}
                              </span>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableContainer>
                  <Pagination
                    page={listResult.page}
                    totalPages={listResult.totalPages}
                    total={listResult.total}
                    pageSize={listResult.pageSize}
                  />
                </>
              )}
            </Panel>
          )}
        </div>
      ) : (
        <Panel>
          <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <ListToolbar>
              <ListSearchInput placeholder="Buscar por nome ou empresa…" />
              <ListFilterSelect
                paramKey="status"
                placeholder="Todos os status"
                options={leadStatusValues.map((value) => ({
                  value,
                  label: LEAD_STATUS[value].label,
                }))}
              />
            </ListToolbar>
          </div>

          {leadsResult.items.length === 0 ? (
            <EmptyState
              title="Nenhum lead cadastrado"
              description="Leads chegam pelo site, indicação ou prospecção — e ainda não são clientes."
            />
          ) : (
            <>
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Lead</TH>
                      <TH>Origem</TH>
                      <TH>Serviço de interesse</TH>
                      <TH>Status</TH>
                      <TH>Recebido</TH>
                      <TH />
                    </tr>
                  </THead>
                  <TBody>
                    {leadsResult.items.map((lead) => (
                      <TR key={lead.id}>
                        <TDPrimary
                          title={lead.name}
                          subtitle={lead.companyName ?? lead.email ?? undefined}
                        />
                        <TD>
                          <span className="text-muted text-xs">{lead.sourceName ?? '—'}</span>
                        </TD>
                        <TD>
                          <span className="text-muted text-xs">{lead.serviceTypeName ?? '—'}</span>
                        </TD>
                        <TD>
                          <StatusBadge map={LEAD_STATUS} value={lead.status} />
                        </TD>
                        <TD>
                          <span className="text-muted text-xs">
                            {formatRelative(lead.createdAt)}
                          </span>
                        </TD>
                        <TD align="right">
                          {canWrite &&
                            lead.status !== 'converted' &&
                            lead.status !== 'discarded' && (
                              <div className="flex justify-end gap-1.5">
                                <ConvertLeadDialog leadId={lead.id} leadName={lead.name} />
                                <DiscardLeadButton leadId={lead.id} />
                              </div>
                            )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
              <Pagination
                page={leadsResult.page}
                totalPages={leadsResult.totalPages}
                total={leadsResult.total}
                pageSize={leadsResult.pageSize}
              />
            </>
          )}
        </Panel>
      )}

      {drawer}
    </PageContainer>
  )
}
