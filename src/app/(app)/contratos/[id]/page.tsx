import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileStack, FolderKanban, FolderPlus, Pencil } from 'lucide-react'

import { FileList } from '@/components/files/file-list'
import { ScopePanel } from '@/components/scope/scope-panel'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { ActivityTimeline } from '@/components/ui/activity-timeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailItem, DetailList, EntityCode, ProgressBar } from '@/components/ui/misc'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, RestrictedValue } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { daysUntil, formatCurrency, formatDate, formatDeadline } from '@/lib/format'
import { getAuthContext, requireAuth } from '@/server/auth/context'
import {
  getContractDetail,
  listAddendums,
  listContractActivity,
  listContractProjects,
} from '@/server/modules/contracts/queries'
import { getEffectiveContractValue } from '@/server/modules/contracts/service'
import { getFilePanel } from '@/server/modules/files/queries'
import { listTemplateOptions } from '@/server/modules/projects/queries'
import { listContractScopeChanges } from '@/server/modules/scope/queries'
import { listUserOptions } from '@/server/modules/users/queries'
import {
  ADDENDUM_STATUS,
  ADDENDUM_TYPE,
  CONTRACT_STATUS,
  PAYMENT_METHOD,
  PROJECT_STATUS,
} from '@/shared/domain'

import { CreateProjectDialog } from '../../projetos/create-project-dialog'
import { ContractFormDialog } from '../contract-form-dialog'
import { ActivateAddendumButton } from './activate-addendum-button'
import { AddendumFormDialog } from './addendum-form-dialog'
import { ContractStatusActions } from './contract-status-actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  // Roda em paralelo ao layout: não pode lançar erro de sessão, e não revela
  // o título do contrato a quem não tem permissão de lê-lo.
  const context = await getAuthContext()
  if (!context?.can('contracts.read')) return { title: 'Contrato' }
  const contract = await getContractDetail(context, id)
  return { title: contract ? `${contract.code} · ${contract.title}` : 'Contrato' }
}

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireAuth()

  if (!context.can('contracts.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="contracts.read" />
      </PageContainer>
    )
  }

  const contract = await getContractDetail(context, id)
  if (!contract) notFound()

  const canWrite = context.can('contracts.write')
  const canSeeValues = context.can('contracts.values.read')
  const canCreateProject = context.can('projects.write') && contract.status === 'active'

  const [
    addendums,
    projects,
    activity,
    owners,
    templates,
    effectiveValue,
    filePanel,
    scopeChanges,
  ] = await Promise.all([
    listAddendums(context, id),
    listContractProjects(context, id),
    listContractActivity(id),
    canWrite || canCreateProject ? listUserOptions() : Promise.resolve([]),
    canCreateProject ? listTemplateOptions() : Promise.resolve([]),
    canSeeValues ? getEffectiveContractValue(id) : Promise.resolve(null),
    // `null` sem `contracts.documents.read`: o painel nem aparece.
    getFilePanel(context, { type: 'contract', id }),
    listContractScopeChanges(context, id),
  ])

  const activeValueAddendums = addendums.filter(
    (addendum) => addendum.status === 'active' && addendum.valueDelta !== null,
  )
  const addendumTotal = activeValueAddendums.reduce(
    (sum, addendum) => sum + Number(addendum.valueDelta),
    0,
  )
  const scopeLocked = contract.status !== 'draft' && contract.status !== 'awaiting_signature'
  const canAddAddendum =
    canWrite && (contract.status === 'active' || contract.status === 'suspended')
  const endsIn = daysUntil(contract.endDate)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        breadcrumb={[
          { label: 'Contratos', href: '/contratos' },
          { label: contract.client.name, href: `/clientes/${contract.client.id}` },
          { label: contract.code },
        ]}
        title={contract.title}
        badges={<StatusBadge map={CONTRACT_STATUS} value={contract.status} size="md" />}
        actions={
          <>
            {canCreateProject && (
              <CreateProjectDialog
                templates={templates}
                owners={owners}
                preset={{
                  name: contract.title,
                  client: { id: contract.client.id, label: contract.client.name },
                  contractId: contract.id,
                  contractLabel: contract.code,
                }}
                trigger={
                  <Button variant="primary" size="md" icon={<FolderPlus />}>
                    Criar projeto
                  </Button>
                }
              />
            )}
            {canWrite && contract.status !== 'closed' && contract.status !== 'cancelled' && (
              <ContractFormDialog
                owners={owners}
                canSeeValues={canSeeValues}
                defaultValues={{
                  id: contract.id,
                  scopeLocked,
                  title: contract.title,
                  scope: contract.scope ?? undefined,
                  deliverables: contract.deliverables ?? undefined,
                  responsibilities: contract.responsibilities ?? undefined,
                  exclusions: contract.exclusions ?? undefined,
                  totalValue: contract.totalValue ?? undefined,
                  paymentMethod: contract.paymentMethod ?? undefined,
                  paymentTerms: contract.paymentTerms ?? undefined,
                  installments: contract.installments ?? undefined,
                  startDate: contract.startDate ?? undefined,
                  endDate: contract.endDate ?? undefined,
                  revisionsIncluded: contract.revisionsIncluded ?? undefined,
                  supportDays: contract.supportDays ?? undefined,
                  ownerId: contract.owner?.id,
                  notes: contract.notes ?? undefined,
                }}
                trigger={
                  <Button variant="secondary" size="md" icon={<Pencil />}>
                    Editar
                  </Button>
                }
              />
            )}
          </>
        }
      />

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <ContractStatusActions contractId={contract.id} status={contract.status} />
        </div>
      )}

      {contract.status === 'cancelled' && contract.cancellationReason && (
        <div className="border-danger-border bg-danger-soft text-danger-text rounded-lg border px-4 py-3 text-sm">
          <span className="font-medium">Cancelado:</span> {contract.cancellationReason}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHeader
              title="Escopo contratado"
              description={
                scopeLocked
                  ? 'Imutável desde a ativação — alterações entram como aditivo.'
                  : undefined
              }
            />
            <PanelBody className="flex flex-col gap-4">
              {[
                ['Escopo', contract.scope],
                ['Entregáveis', contract.deliverables],
                ['Responsabilidades', contract.responsibilities],
                ['Fora do escopo', contract.exclusions],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-2xs text-subtle font-semibold tracking-wide uppercase">
                    {label}
                  </span>
                  <p className="text-default text-sm whitespace-pre-line">
                    {value || <span className="text-subtle">Não informado</span>}
                  </p>
                </div>
              ))}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Aditivos"
              description="Numerados em sequência. Só aditivos ativos alteram o contrato."
              actions={
                canAddAddendum ? (
                  <AddendumFormDialog contractId={contract.id} canSeeValues={canSeeValues} />
                ) : undefined
              }
            />
            {addendums.length === 0 ? (
              <EmptyState compact icon={<FileStack />} title="Nenhum aditivo" />
            ) : (
              <ul className="divide-y divide-[var(--line-subtle)]">
                {addendums.map((addendum) => (
                  <li
                    key={addendum.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-strong flex flex-wrap items-center gap-2 text-sm font-medium">
                        #{addendum.sequence} · {addendum.title}
                        <Badge tone={ADDENDUM_TYPE[addendum.type].tone} size="sm">
                          {ADDENDUM_TYPE[addendum.type].label}
                        </Badge>
                      </span>
                      <span className="text-2xs text-muted flex flex-wrap items-center gap-2">
                        <EntityCode code={addendum.code} />
                        {addendum.valueDelta !== null && (
                          <span data-tabular>
                            {Number(addendum.valueDelta) >= 0 ? '+' : ''}
                            {formatCurrency(addendum.valueDelta)}
                          </span>
                        )}
                        {addendum.newEndDate && (
                          <span>novo término {formatDate(addendum.newEndDate)}</span>
                        )}
                        {addendum.additionalSupportDays ? (
                          <span>+{addendum.additionalSupportDays} dias de suporte</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge map={ADDENDUM_STATUS} value={addendum.status} />
                      {canAddAddendum && addendum.status === 'draft' && (
                        <ActivateAddendumButton addendumId={addendum.id} contractId={contract.id} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Projetos" description="Execução deste contrato." />
            {projects.length === 0 ? (
              <EmptyState
                compact
                icon={<FolderKanban />}
                title="Nenhum projeto criado"
                description={
                  contract.status === 'active'
                    ? 'Crie o projeto a partir deste contrato para herdar cliente e escopo.'
                    : 'Projetos são criados a partir de um contrato ativo.'
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--line-subtle)]">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projetos/${project.id}`}
                      className="hover:bg-hover flex items-center gap-4 px-4 py-3 transition-colors"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-strong truncate text-sm font-medium">
                          {project.name}
                        </span>
                        <span className="text-2xs text-muted">
                          {project.code} · prazo {formatDeadline(project.dueDate)}
                        </span>
                      </div>
                      <ProgressBar value={project.progress} showValue className="w-32" />
                      <StatusBadge map={PROJECT_STATUS} value={project.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {context.can('scope.read') && scopeChanges.length > 0 && (
            <ScopePanel rows={scopeChanges} linkMode="project" showProject />
          )}

          {filePanel && (
            <FileList
              {...filePanel}
              title="Documentos"
              description="Contrato assinado, propostas anexas, termos. Cada nova versão preserva a anterior."
            />
          )}

          <Panel>
            <PanelHeader title="Atividade" />
            <ActivityTimeline items={activity} />
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Resumo" />
            <PanelBody>
              <DetailList className="grid-cols-1 gap-3">
                <DetailItem label="Código">{contract.code}</DetailItem>
                <DetailItem label="Cliente">
                  <Link href={`/clientes/${contract.client.id}`} className="hover:underline">
                    {contract.client.name}
                  </Link>
                </DetailItem>
                {contract.opportunity && (
                  <DetailItem label="Origem comercial">
                    <Link
                      href={`/comercial?oportunidade=${contract.opportunity.id}`}
                      className="hover:underline"
                    >
                      {contract.opportunity.title}
                    </Link>
                  </DetailItem>
                )}
                <DetailItem label="Serviço">{contract.serviceType?.name ?? '—'}</DetailItem>
                <DetailItem label="Responsável">{contract.owner?.name ?? '—'}</DetailItem>
              </DetailList>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Financeiro" />
            <PanelBody>
              {canSeeValues ? (
                <DetailList className="grid-cols-1 gap-3">
                  <DetailItem label="Valor base">{formatCurrency(contract.totalValue)}</DetailItem>
                  {activeValueAddendums.length > 0 && (
                    <DetailItem label="Aditivos ativos">
                      {addendumTotal >= 0 ? '+' : ''}
                      {formatCurrency(addendumTotal)}
                    </DetailItem>
                  )}
                  <DetailItem label="Total vigente">
                    <span className="text-strong font-semibold">
                      {formatCurrency(effectiveValue)}
                    </span>
                  </DetailItem>
                  <DetailItem label="Forma de pagamento">
                    {contract.paymentMethod ? PAYMENT_METHOD[contract.paymentMethod].label : '—'}
                    {contract.installments ? ` · ${contract.installments}x` : ''}
                  </DetailItem>
                  {contract.paymentTerms && (
                    <DetailItem label="Condições">
                      <span className="whitespace-pre-line">{contract.paymentTerms}</span>
                    </DetailItem>
                  )}
                </DetailList>
              ) : (
                <RestrictedValue />
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Vigência e suporte" />
            <PanelBody>
              <DetailList className="grid-cols-1 gap-3">
                <DetailItem label="Início">{formatDate(contract.startDate)}</DetailItem>
                <DetailItem label="Término">
                  {formatDate(contract.endDate)}
                  {contract.status === 'active' &&
                    endsIn !== null &&
                    endsIn >= 0 &&
                    endsIn <= 30 && (
                      <Badge tone="warning" size="sm" className="ml-2">
                        {formatDeadline(contract.endDate)}
                      </Badge>
                    )}
                </DetailItem>
                <DetailItem label="Assinado em">{formatDate(contract.signedAt)}</DetailItem>
                <DetailItem label="Revisões incluídas">
                  {contract.revisionsIncluded ?? '—'}
                </DetailItem>
                <DetailItem label="Suporte">
                  {contract.supportDays ? `${contract.supportDays} dias` : '—'}
                  {contract.supportEndsAt
                    ? ` · até ${formatDate(contract.supportEndsAt)}`
                    : contract.supportDays
                      ? ' · começa no lançamento'
                      : ''}
                </DetailItem>
              </DetailList>
            </PanelBody>
          </Panel>

          {contract.notes && (
            <Panel>
              <PanelHeader title="Observações" />
              <PanelBody>
                <p className="text-default text-sm whitespace-pre-line">{contract.notes}</p>
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
