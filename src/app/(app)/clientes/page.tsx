import type { Metadata } from 'next'
import Link from 'next/link'
import { Briefcase } from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/layout/page'
import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { Avatar } from '@/components/ui/avatar'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TDPrimary, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { formatRelative } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { listUserOptions } from '@/server/modules/users/queries'
import { listClients } from '@/server/modules/clients/queries'
import { listLeadSourceOptions } from '@/server/modules/crm/queries'
import { CLIENT_STATUS } from '@/shared/domain'
import { clientStatusValues } from '@/shared/schemas/clients'

import { ClientFormDialog } from './client-form-dialog'

export const metadata: Metadata = { title: 'Clientes' }
export const dynamic = 'force-dynamic'

interface ClientesPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const context = await requireAuth()
  const params = await searchParams

  if (!context.can('clients.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="clients.read" />
      </PageContainer>
    )
  }

  const filter = {
    q: params.q,
    status: params.status as (typeof clientStatusValues)[number] | undefined,
    page: params.page ? Number(params.page) : 1,
  }

  const [result, owners, sources] = await Promise.all([
    listClients(filter),
    listUserOptions(),
    listLeadSourceOptions(),
  ])

  const canWrite = context.can('clients.write')
  const hasFilters = Boolean(params.q || params.status)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Clientes"
        description="Empresas com quem existe, ou já existiu, relação comercial."
        actions={
          canWrite && (
            <ClientFormDialog options={{ owners, sources }} defaultOpen={params.novo === '1'} />
          )
        }
      />

      <Panel>
        <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar por nome, código ou CNPJ…" />
            <ListFilterSelect
              paramKey="status"
              placeholder="Todos os status"
              options={clientStatusValues.map((value) => ({
                value,
                label: CLIENT_STATUS[value].label,
              }))}
            />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={params.q} />
          ) : (
            <EmptyState
              icon={<Briefcase />}
              title="Nenhum cliente cadastrado"
              description="Clientes nascem de uma conversão de lead ou podem ser cadastrados diretamente aqui."
              action={canWrite ? <ClientFormDialog options={{ owners, sources }} /> : undefined}
            />
          )
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Cliente</TH>
                    <TH className="hidden md:table-cell">Segmento</TH>
                    <TH className="hidden lg:table-cell">Responsável</TH>
                    <TH align="right">Oportunidades</TH>
                    <TH align="right">Projetos</TH>
                    <TH>Último contato</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((client) => (
                    <TR key={client.id} interactive>
                      <TDPrimary
                        title={
                          <Link href={`/clientes/${client.id}`} className="hover:underline">
                            {client.name}
                          </Link>
                        }
                        subtitle={client.code}
                      />
                      <TD className="hidden md:table-cell">
                        <span className="text-muted text-xs">
                          {client.segment ?? '—'}
                          {client.city
                            ? ` · ${client.city}${client.state ? `/${client.state}` : ''}`
                            : ''}
                        </span>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        {client.owner ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar
                              name={client.owner.name}
                              src={client.owner.avatarUrl}
                              size="xs"
                            />
                            <span className="truncate text-xs">{client.owner.name}</span>
                          </div>
                        ) : (
                          <span className="text-subtle text-xs">—</span>
                        )}
                      </TD>
                      <TD align="right" data-tabular>
                        {client.openOpportunities}
                      </TD>
                      <TD align="right" data-tabular>
                        {client.activeProjects}
                      </TD>
                      <TD>
                        <span className="text-muted text-xs">
                          {client.lastContactAt ? formatRelative(client.lastContactAt) : '—'}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge map={CLIENT_STATUS} value={client.status} />
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
