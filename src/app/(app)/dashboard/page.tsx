import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckSquare,
  CircleSlash,
  Clock,
  FileText,
  FolderKanban,
  ShieldCheck,
  Target,
  UserCheck,
} from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/layout/page'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/misc'
import { Metric, Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TDPrimary, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { formatCompactCurrency, formatDeadline, formatRelative } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import {
  getActiveClientCount,
  getAttentionItems,
  getCommercialSummary,
  getContractSummary,
  getOperationSummary,
  getProjectOverview,
  getRecentActivity,
} from '@/server/modules/dashboard/queries'
import { PROJECT_STATUS, type ProjectStatus } from '@/shared/domain'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

/**
 * Dashboard.
 *
 * Central operacional, não vitrine de gráficos. Responde, de cima para baixo:
 * o que está errado agora, o que está em execução, o que está por vir e o que
 * acabou de acontecer.
 */
export default async function DashboardPage() {
  const context = await requireAuth()

  const [operation, commercial, contracts, projects, attention, activity, clientCount] =
    await Promise.all([
      getOperationSummary(context),
      getCommercialSummary(context),
      getContractSummary(context),
      getProjectOverview(context),
      getAttentionItems(context),
      getRecentActivity(context),
      getActiveClientCount(context),
    ])

  const firstName = context.user.name.split(' ')[0] ?? context.user.name

  return (
    <PageContainer wide className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description="O que está acontecendo na Kyvon agora."
        actions={
          <Button variant="secondary" size="md" asChild>
            <Link href="/meu-trabalho">
              Meu trabalho
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        }
      />

      {/* ── Operação ───────────────────────────────────────────────────── */}
      <section className="border-line grid gap-px overflow-hidden rounded-lg border bg-[var(--line-subtle)] sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell
          label="Projetos ativos"
          value={operation.activeProjects}
          hint={`${operation.waitingClientProjects} aguardando cliente`}
          icon={<FolderKanban />}
          href="/projetos"
        />
        <MetricCell
          label="Projetos atrasados"
          value={operation.overdueProjects}
          hint={
            operation.blockedProjects > 0
              ? `${operation.blockedProjects} bloqueados`
              : 'Nenhum bloqueio'
          }
          icon={<AlertTriangle />}
          tone={operation.overdueProjects > 0 ? 'danger' : 'neutral'}
          href="/projetos?filtro=atrasados"
        />
        <MetricCell
          label="Tarefas vencidas"
          value={operation.overdueTasks}
          hint={`${operation.tasksDueToday} vencem hoje`}
          icon={<CheckSquare />}
          tone={operation.overdueTasks > 0 ? 'danger' : 'neutral'}
          href="/tarefas?filtro=atrasadas"
        />
        <MetricCell
          label="Aprovações pendentes"
          value={operation.pendingApprovals}
          hint={
            operation.openTickets > 0
              ? `${operation.openTickets} chamados abertos`
              : 'Suporte sem fila'
          }
          icon={<ShieldCheck />}
          tone={operation.pendingApprovals > 0 ? 'warning' : 'neutral'}
          href="/aprovacoes"
        />
      </section>

      {/* ── Precisa de atenção ─────────────────────────────────────────── */}
      {attention.length > 0 && (
        <Panel>
          <PanelHeader
            title="Precisa de atenção"
            description="Prazos, bloqueios e decisões pendentes"
          />
          <ul className="divide-y divide-[var(--line-subtle)]">
            {attention.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors"
                >
                  <AttentionIcon kind={item.kind} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-strong truncate text-sm font-medium">{item.title}</span>
                    <span className="text-2xs text-muted truncate">{item.detail}</span>
                  </div>
                  <ArrowUpRight className="text-subtle size-3.5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ── Projetos ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Projetos em execução"
              description="Bloqueados e atrasados primeiro"
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/projetos">Ver todos</Link>
                </Button>
              }
            />

            {projects.length === 0 ? (
              <EmptyState
                compact
                icon={<FolderKanban />}
                title="Nenhum projeto em execução"
                description="Projetos criados a partir de um contrato aparecem aqui."
              />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Projeto</TH>
                      <TH className="hidden md:table-cell">Etapa</TH>
                      <TH className="hidden lg:table-cell">Responsável</TH>
                      <TH>Progresso</TH>
                      <TH>Prazo</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {projects.map((project) => {
                      const overdue =
                        project.dueDate !== null &&
                        project.dueDate < new Date().toISOString().slice(0, 10)

                      return (
                        <TR key={project.id} interactive>
                          <TDPrimary
                            title={
                              <Link href={`/projetos/${project.id}`} className="hover:underline">
                                {project.name}
                              </Link>
                            }
                            subtitle={project.clientName}
                          />
                          <TD className="hidden md:table-cell">
                            <span className="text-muted text-xs">{project.stageName ?? '—'}</span>
                          </TD>
                          <TD className="hidden lg:table-cell">
                            {project.owner ? (
                              <div className="flex items-center gap-1.5">
                                <Avatar
                                  name={project.owner.name}
                                  src={project.owner.avatarUrl}
                                  size="xs"
                                />
                                <span className="truncate text-xs">{project.owner.name}</span>
                              </div>
                            ) : (
                              <span className="text-subtle text-xs">Sem responsável</span>
                            )}
                          </TD>
                          <TD className="w-28">
                            <ProgressBar value={project.progress} showValue />
                          </TD>
                          <TD>
                            <span
                              className={
                                overdue ? 'text-danger-text text-xs font-medium' : 'text-xs'
                              }
                            >
                              {formatDeadline(project.dueDate)}
                            </span>
                          </TD>
                          <TD>
                            <StatusBadge
                              map={PROJECT_STATUS}
                              value={project.status as ProjectStatus}
                            />
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </Panel>

          {/* ── Comercial e contratos ──────────────────────────────────── */}
          {(commercial || contracts) && (
            <div className="grid gap-6 md:grid-cols-2">
              {commercial && (
                <Panel>
                  <PanelHeader
                    title="Comercial"
                    actions={
                      <Button variant="ghost" size="sm" asChild>
                        <Link href="/comercial">Pipeline</Link>
                      </Button>
                    }
                  />
                  <PanelBody className="grid grid-cols-2 gap-5">
                    <Metric
                      label="Em negociação"
                      value={commercial.openOpportunities}
                      icon={<Target />}
                    />
                    <Metric
                      label="Valor potencial"
                      value={
                        commercial.potentialValue === null ? (
                          <span className="text-subtle text-base">restrito</span>
                        ) : (
                          formatCompactCurrency(commercial.potentialValue)
                        )
                      }
                      hint={commercial.potentialValue === null ? 'Sem permissão' : undefined}
                    />
                    <Metric
                      label="Propostas aguardando"
                      value={commercial.proposalsAwaiting}
                      icon={<FileText />}
                    />
                    <Metric
                      label="Ações atrasadas"
                      value={commercial.overdueNextActions}
                      tone={commercial.overdueNextActions > 0 ? 'danger' : 'neutral'}
                      icon={<Clock />}
                    />
                  </PanelBody>
                </Panel>
              )}

              {contracts && (
                <Panel>
                  <PanelHeader
                    title="Contratos"
                    actions={
                      <Button variant="ghost" size="sm" asChild>
                        <Link href="/contratos">Ver todos</Link>
                      </Button>
                    }
                  />
                  <PanelBody className="grid grid-cols-2 gap-5">
                    <Metric label="Ativos" value={contracts.activeContracts} icon={<FileText />} />
                    <Metric
                      label="Vencem em 30 dias"
                      value={contracts.expiringContracts}
                      tone={contracts.expiringContracts > 0 ? 'warning' : 'neutral'}
                      icon={<CalendarClock />}
                    />
                    <Metric
                      label="Suporte terminando"
                      value={contracts.expiringSupport}
                      tone={contracts.expiringSupport > 0 ? 'warning' : 'neutral'}
                    />
                    <Metric
                      label="Aguardando assinatura"
                      value={contracts.awaitingSignature}
                      icon={<UserCheck />}
                    />
                  </PanelBody>
                </Panel>
              )}
            </div>
          )}
        </div>

        {/* ── Atividade ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {clientCount !== null && (
            <Panel>
              <PanelBody className="flex items-center justify-between">
                <Metric label="Clientes na base" value={clientCount} />
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/clientes">Ver</Link>
                </Button>
              </PanelBody>
            </Panel>
          )}

          <Panel className="flex min-h-0 flex-col">
            <PanelHeader title="Atividade recente" />
            {activity.length === 0 ? (
              <EmptyState
                compact
                icon={<Clock />}
                title="Nada registrado ainda"
                description="Cada criação, mudança de status e aprovação aparece aqui."
              />
            ) : (
              <ul className="divide-y divide-[var(--line-subtle)]">
                {activity.map((item) => (
                  <li key={item.id} className="flex gap-2.5 px-4 py-2.5">
                    {item.actor ? (
                      <Avatar
                        name={item.actor.name}
                        src={item.actor.avatarUrl}
                        size="sm"
                        className="mt-0.5"
                      />
                    ) : (
                      <span className="bg-neutral-soft text-subtle mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                        <CircleSlash className="size-3" />
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-default text-xs leading-snug">
                        <span className="text-strong font-medium">
                          {item.actor?.name ?? 'Sistema'}
                        </span>{' '}
                        {item.summary}
                      </p>
                      <span className="text-2xs text-subtle">{formatRelative(item.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageContainer>
  )
}

function greeting(): string {
  // Horário de São Paulo, independentemente do fuso do servidor.
  const hour = Number(
    new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).format(new Date()),
  )

  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function MetricCell({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  href,
}: {
  label: string
  value: number
  hint?: string
  icon: React.ReactNode
  tone?: 'neutral' | 'danger' | 'warning'
  href: string
}) {
  return (
    <Link href={href} className="group bg-raised hover:bg-hover p-4 transition-colors">
      <Metric
        label={label}
        value={value}
        hint={hint}
        icon={icon}
        tone={tone === 'neutral' ? 'neutral' : tone}
      />
    </Link>
  )
}

function AttentionIcon({ kind }: { kind: string }) {
  const config: Record<string, { icon: React.ReactNode; tone: 'danger' | 'warning' | 'info' }> = {
    contract_expiring: { icon: <CalendarClock />, tone: 'warning' },
    support_expiring: { icon: <CalendarClock />, tone: 'warning' },
    project_blocked: { icon: <AlertTriangle />, tone: 'danger' },
    approval_overdue: { icon: <ShieldCheck />, tone: 'warning' },
  }

  const entry = config[kind] ?? { icon: <AlertTriangle />, tone: 'info' as const }

  return (
    <Badge
      tone={entry.tone}
      size="md"
      className="size-6 shrink-0 justify-center p-0 [&_svg]:size-3.5"
    >
      {entry.icon}
    </Badge>
  )
}
