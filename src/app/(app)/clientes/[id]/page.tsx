import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Building2,
  FileText,
  FolderKanban,
  Globe,
  Headphones,
  Mail,
  Phone,
  Star,
  Target,
} from 'lucide-react'

import { FileList } from '@/components/files/file-list'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { ActivityTimeline } from '@/components/ui/activity-timeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailItem, DetailList, ProgressBar } from '@/components/ui/misc'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TBody, TD, TDPrimary, TH, THead, TR, TableContainer } from '@/components/ui/table'
import {
  formatCurrency,
  formatDate,
  formatDocument,
  formatPhone,
  formatRelative,
} from '@/lib/format'
import { getAuthContext, requireAuth } from '@/server/auth/context'
import { getFilePanel } from '@/server/modules/files/queries'
import { listUserOptions } from '@/server/modules/users/queries'
import {
  getClientDetail,
  listClientActivity,
  listClientCases,
  listClientContacts,
  listClientContracts,
  listClientOpportunities,
  listClientProjects,
  listClientSupportTickets,
} from '@/server/modules/clients/queries'
import { listLeadSourceOptions } from '@/server/modules/crm/queries'
import {
  CASE_STATUS,
  CLIENT_STATUS,
  CONTRACT_STATUS,
  OPPORTUNITY_STAGE,
  PROJECT_STATUS,
  SUPPORT_CATEGORY,
  SUPPORT_STATUS,
} from '@/shared/domain'

import { ArchiveClientButton } from './archive-client-button'
import { ContactFormDialog } from './contact-form-dialog'
import { ClientFormDialog } from '../client-form-dialog'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  // Roda em paralelo ao layout: não pode lançar erro de sessão, e não revela
  // o nome do cliente a quem não tem permissão de lê-lo.
  const context = await getAuthContext()
  if (!context?.can('clients.read')) return { title: 'Cliente' }
  const client = await getClientDetail(id)
  return { title: client?.name ?? 'Cliente' }
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireAuth()

  if (!context.can('clients.read')) {
    return (
      <PageContainer>
        <EmptyState title="Sem acesso" description="Você não tem permissão para ver clientes." />
      </PageContainer>
    )
  }

  const client = await getClientDetail(id)
  if (!client) notFound()

  const [
    contacts,
    opportunities,
    contracts,
    projects,
    tickets,
    cases,
    activity,
    owners,
    sources,
    filePanel,
  ] = await Promise.all([
    listClientContacts(id),
    listClientOpportunities(context, id),
    listClientContracts(context, id),
    listClientProjects(context, id),
    listClientSupportTickets(context, id),
    listClientCases(context, id),
    listClientActivity(id),
    listUserOptions(),
    listLeadSourceOptions(),
    getFilePanel(context, { type: 'client', id }),
  ])

  const canWrite = context.can('clients.write')
  const canDelete = context.can('clients.delete')

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        breadcrumb={[{ label: 'Clientes', href: '/clientes' }, { label: client.name }]}
        title={client.name}
        description={client.tradeName ?? undefined}
        badges={<StatusBadge map={CLIENT_STATUS} value={client.status} size="md" />}
        actions={
          <>
            {context.can('crm.write') && (
              <Button variant="secondary" size="md" icon={<Target />} asChild>
                <Link href={`/comercial?nova=1&clienteId=${client.id}`}>Nova oportunidade</Link>
              </Button>
            )}
            {canWrite && (
              <ClientFormDialog
                options={{ owners, sources }}
                defaultValues={{
                  id: client.id,
                  name: client.name,
                  tradeName: client.tradeName ?? undefined,
                  document: client.document ?? undefined,
                  email: client.email ?? undefined,
                  phone: client.phone ?? undefined,
                  website: client.website ?? undefined,
                  segment: client.segment ?? undefined,
                  status: client.status,
                  sourceId: client.source?.id,
                  ownerId: client.owner?.id,
                  addressCity: client.city ?? undefined,
                  addressState: client.state ?? undefined,
                  notes: client.notes ?? undefined,
                }}
                trigger={
                  <Button variant="secondary" size="md">
                    Editar
                  </Button>
                }
              />
            )}
            {canDelete && client.status !== 'archived' && (
              <ArchiveClientButton clientId={client.id} clientName={client.name} />
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ── Coluna de informações ────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Informações" />
            <PanelBody className="flex flex-col gap-3">
              <DetailList className="grid-cols-1 gap-3">
                <DetailItem label="Código">{client.code}</DetailItem>
                {client.document && (
                  <DetailItem label="CNPJ/CPF">{formatDocument(client.document)}</DetailItem>
                )}
                {client.segment && <DetailItem label="Segmento">{client.segment}</DetailItem>}
                {(client.city || client.state) && (
                  <DetailItem label="Localização">
                    {[client.city, client.state].filter(Boolean).join(' / ')}
                  </DetailItem>
                )}
                {client.source && <DetailItem label="Origem">{client.source.name}</DetailItem>}
                <DetailItem label="Responsável">
                  {client.owner?.name ?? 'Sem responsável'}
                </DetailItem>
                <DetailItem label="Último contato">
                  {client.lastContactAt ? formatRelative(client.lastContactAt) : 'Nunca registrado'}
                </DetailItem>
                <DetailItem label="Cliente desde">{formatDate(client.createdAt)}</DetailItem>
              </DetailList>

              <div className="border-line flex flex-col gap-1.5 border-t pt-3 text-xs">
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="text-default flex items-center gap-1.5 hover:underline"
                  >
                    <Mail className="text-subtle size-3.5" /> {client.email}
                  </a>
                )}
                {client.phone && (
                  <span className="text-default flex items-center gap-1.5">
                    <Phone className="text-subtle size-3.5" /> {formatPhone(client.phone)}
                  </span>
                )}
                {client.website && (
                  <a
                    href={
                      client.website.startsWith('http')
                        ? client.website
                        : `https://${client.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-default flex items-center gap-1.5 hover:underline"
                  >
                    <Globe className="text-subtle size-3.5" /> {client.website}
                  </a>
                )}
              </div>

              {client.notes && (
                <p className="border-line text-muted border-t pt-3 text-xs leading-relaxed whitespace-pre-line">
                  {client.notes}
                </p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Contatos"
              actions={canWrite ? <ContactFormDialog clientId={client.id} /> : undefined}
            />
            {contacts.length === 0 ? (
              <EmptyState compact icon={<Building2 />} title="Nenhum contato cadastrado" />
            ) : (
              <ul className="divide-y divide-[var(--line-subtle)]">
                {contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-start justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-strong flex items-center gap-1.5 truncate text-sm font-medium">
                        {contact.name}
                        {contact.isPrimary && (
                          <Star
                            className="fill-warning text-warning size-3 shrink-0"
                            aria-label="Principal"
                          />
                        )}
                      </span>
                      {contact.jobTitle && (
                        <span className="text-2xs text-muted truncate">{contact.jobTitle}</span>
                      )}
                      {contact.email && (
                        <span className="text-2xs text-subtle truncate">{contact.email}</span>
                      )}
                    </div>
                    {canWrite && (
                      <ContactFormDialog
                        clientId={client.id}
                        defaultValues={{
                          id: contact.id,
                          clientId: client.id,
                          name: contact.name,
                          jobTitle: contact.jobTitle ?? undefined,
                          email: contact.email ?? undefined,
                          phone: contact.phone ?? undefined,
                          isPrimary: contact.isPrimary,
                          canApprove: contact.canApprove,
                        }}
                        trigger={
                          <button className="text-2xs text-brand-text shrink-0 hover:underline">
                            Editar
                          </button>
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {filePanel && (
            <FileList
              {...filePanel}
              description="Documentos gerais do cliente: briefing, marca, acessos."
            />
          )}
        </div>

        {/* ── Abas ─────────────────────────────────────────────────────── */}
        <Panel className="min-w-0">
          <Tabs defaultValue="comercial">
            <TabsList className="px-4 pt-2">
              <TabsTrigger value="comercial" count={opportunities.length}>
                Comercial
              </TabsTrigger>
              <TabsTrigger value="contratos" count={contracts.length}>
                Contratos
              </TabsTrigger>
              <TabsTrigger value="projetos" count={projects.length}>
                Projetos
              </TabsTrigger>
              <TabsTrigger value="suporte" count={tickets.length}>
                Suporte
              </TabsTrigger>
              {cases.length > 0 && <TabsTrigger value="cases">Cases</TabsTrigger>}
              <TabsTrigger value="atividade">Atividade</TabsTrigger>
            </TabsList>

            <TabsContent value="comercial">
              {opportunities.length === 0 ? (
                <EmptyState compact icon={<Target />} title="Nenhuma oportunidade" />
              ) : (
                <TableContainer>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Oportunidade</TH>
                        <TH>Etapa</TH>
                        <TH align="right">Valor</TH>
                        <TH>Responsável</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {opportunities.map((row) => (
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
                            subtitle={row.code}
                          />
                          <TD>
                            <StatusBadge map={OPPORTUNITY_STAGE} value={row.stage} />
                          </TD>
                          <TD align="right" data-tabular>
                            {row.estimatedValue !== null ? formatCurrency(row.estimatedValue) : '—'}
                          </TD>
                          <TD>
                            <span className="text-muted text-xs">{row.ownerName ?? '—'}</span>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              )}
            </TabsContent>

            <TabsContent value="contratos">
              {contracts.length === 0 ? (
                <EmptyState compact icon={<FileText />} title="Nenhum contrato" />
              ) : (
                <TableContainer>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Contrato</TH>
                        <TH>Status</TH>
                        <TH align="right">Valor</TH>
                        <TH>Vigência</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {contracts.map((row) => (
                        <TR key={row.id} interactive>
                          <TDPrimary
                            title={
                              <Link href={`/contratos/${row.id}`} className="hover:underline">
                                {row.title}
                              </Link>
                            }
                            subtitle={row.code}
                          />
                          <TD>
                            <StatusBadge map={CONTRACT_STATUS} value={row.status} />
                          </TD>
                          <TD align="right" data-tabular>
                            {row.totalValue !== null ? formatCurrency(row.totalValue) : '—'}
                          </TD>
                          <TD>
                            <span className="text-muted text-xs">
                              {row.startDate ? formatDate(row.startDate) : '—'} —{' '}
                              {row.endDate ? formatDate(row.endDate) : '—'}
                            </span>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              )}
            </TabsContent>

            <TabsContent value="projetos">
              {projects.length === 0 ? (
                <EmptyState compact icon={<FolderKanban />} title="Nenhum projeto" />
              ) : (
                <TableContainer>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Projeto</TH>
                        <TH>Progresso</TH>
                        <TH>Prazo</TH>
                        <TH>Status</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {projects.map((row) => (
                        <TR key={row.id} interactive>
                          <TDPrimary
                            title={
                              <Link href={`/projetos/${row.id}`} className="hover:underline">
                                {row.name}
                              </Link>
                            }
                            subtitle={row.code}
                          />
                          <TD className="w-32">
                            <ProgressBar value={row.progress} showValue />
                          </TD>
                          <TD>
                            <span className="text-muted text-xs">
                              {row.dueDate ? formatDate(row.dueDate) : '—'}
                            </span>
                          </TD>
                          <TD>
                            <StatusBadge map={PROJECT_STATUS} value={row.status} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              )}
            </TabsContent>

            <TabsContent value="suporte">
              {tickets.length === 0 ? (
                <EmptyState compact icon={<Headphones />} title="Nenhum chamado" />
              ) : (
                <TableContainer>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Chamado</TH>
                        <TH>Categoria</TH>
                        <TH>Status</TH>
                        <TH>Aberto em</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {tickets.map((row) => (
                        <TR key={row.id} interactive>
                          <TDPrimary
                            title={
                              <Link href={`/suporte?chamado=${row.id}`} className="hover:underline">
                                {row.title}
                              </Link>
                            }
                            subtitle={row.code}
                          />
                          <TD>
                            <Badge tone={SUPPORT_CATEGORY[row.category].tone} size="sm">
                              {SUPPORT_CATEGORY[row.category].label}
                            </Badge>
                          </TD>
                          <TD>
                            <StatusBadge map={SUPPORT_STATUS} value={row.status} />
                          </TD>
                          <TD>
                            <span className="text-muted text-xs">{formatDate(row.createdAt)}</span>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              )}
            </TabsContent>

            {cases.length > 0 && (
              <TabsContent value="cases">
                <ul className="divide-y divide-[var(--line-subtle)]">
                  {cases.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/marketing?aba=cases&case=${row.id}`}
                        className="hover:bg-hover flex items-center justify-between gap-2 px-4 py-2.5 transition-colors"
                      >
                        <span className="text-default text-sm hover:underline">{row.title}</span>
                        <StatusBadge map={CASE_STATUS} value={row.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </TabsContent>
            )}

            <TabsContent value="atividade">
              <ActivityTimeline items={activity} />
            </TabsContent>
          </Tabs>
        </Panel>
      </div>
    </PageContainer>
  )
}
