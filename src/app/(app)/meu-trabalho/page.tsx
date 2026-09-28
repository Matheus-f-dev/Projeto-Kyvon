import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Eye,
  GitPullRequestArrow,
  Headphones,
  Megaphone,
  ShieldCheck,
  Sun,
} from 'lucide-react'

import { ApprovalDrawerLoader } from '@/components/approvals/approval-drawer-loader'
import { ApprovalLink } from '@/components/approvals/approval-link'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { TicketDrawerLoader } from '@/components/support/ticket-drawer-loader'
import { TicketLink } from '@/components/support/ticket-link'
import { TaskCard } from '@/components/tasks/task-board'
import { TaskDrawerLoader } from '@/components/tasks/task-drawer-loader'
import { Button } from '@/components/ui/button'
import { EntityCode } from '@/components/ui/misc'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/cn'
import { formatDeadline, isOverdue } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import {
  getMyWork,
  type MyApproval,
  type TaskCard as TaskCardData,
} from '@/server/modules/tasks/queries'
import { listMyUpcomingContents } from '@/server/modules/marketing/queries'
import { listMyOpenTickets } from '@/server/modules/support/queries'
import { listUserOptions } from '@/server/modules/users/queries'
import { CONTENT_CHANNEL, CONTENT_STATUS, SUPPORT_PRIORITY } from '@/shared/domain'

export const metadata: Metadata = { title: 'Meu trabalho' }
export const dynamic = 'force-dynamic'

/**
 * Meu trabalho.
 *
 * A primeira tela de quem não é gestor. Não traz informação nova: recorta o
 * que já existe por responsabilidade, na ordem em que a pessoa deve agir —
 * o que já atrasou, o que vence hoje, o que está parado esperando por ela.
 */
export default async function MeuTrabalhoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  const [work, users, tickets, contents] = await Promise.all([
    getMyWork(context),
    listUserOptions(),
    context.can('support.write') ? listMyOpenTickets(context.user.id) : Promise.resolve([]),
    context.can('marketing.write') ? listMyUpcomingContents(context.user.id) : Promise.resolve([]),
  ])

  const boardContext = {
    users,
    currentUserId: context.user.id,
    canMove: context.can('tasks.write'),
  }

  const needsAction =
    work.overdue.length +
    work.today.length +
    work.blockedByMe.length +
    work.inReview.length +
    work.pendingApprovals.length +
    work.approvalsToRevise.length +
    work.scopeDecisions.length +
    tickets.length +
    contents.filter((content) => content.late).length

  const firstName = context.user.name.split(' ')[0] ?? context.user.name

  return (
    <PageContainer wide className="flex flex-col gap-6">
      <PageHeader
        title="Meu trabalho"
        description={
          needsAction === 0
            ? `Nada pendente de ação sua agora, ${firstName}.`
            : `${needsAction} ${needsAction === 1 ? 'item precisa' : 'itens precisam'} da sua atenção.`
        }
        actions={
          <Button variant="secondary" size="md" asChild>
            <Link href={`/tarefas?assigneeId=${context.user.id}`}>Todas as minhas tarefas</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          icon={<AlertTriangle />}
          tone="danger"
          title="Atrasadas"
          description="Passaram do prazo e continuam abertas."
          tasks={work.overdue}
          context={boardContext}
          empty="Nenhuma tarefa atrasada."
        />
        <Section
          icon={<Sun />}
          tone="brand"
          title="Para hoje"
          tasks={work.today}
          context={boardContext}
          empty="Nada vence hoje."
        />
        <Section
          icon={<Ban />}
          tone="danger"
          title="Bloqueios que dependem de você"
          description="Você foi indicado como responsável por destravar."
          tasks={work.blockedByMe}
          context={boardContext}
          empty="Nenhum bloqueio esperando por você."
        />
        <Section
          icon={<Eye />}
          tone="accent"
          title="Revisões aguardando você"
          description="Tarefas em revisão que você criou ou cujo projeto você lidera."
          tasks={work.inReview}
          context={boardContext}
          empty="Nada para revisar."
        />

        {context.can('approvals.decide') && (
          <ApprovalSection
            title="Aprovações aguardando sua decisão"
            tone="warning"
            items={work.pendingApprovals}
            empty="Nenhuma aprovação pendente."
          />
        )}

        {context.can('approvals.write') && work.approvalsToRevise.length > 0 && (
          <ApprovalSection
            title="Aprovações devolvidas com ajustes"
            description="Você pediu; o aprovador solicitou mudanças. A próxima versão é sua."
            tone="accent"
            items={work.approvalsToRevise}
            empty=""
          />
        )}

        {context.can('scope.decide') && work.scopeDecisions.length > 0 && (
          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  <GitPullRequestArrow className="text-warning size-4" />
                  Mudanças de escopo aguardando decisão
                  <span
                    className="bg-neutral-soft text-2xs text-muted rounded px-1.5 font-semibold"
                    data-tabular
                  >
                    {work.scopeDecisions.length}
                  </span>
                </span>
              }
              description="A análise de impacto está pronta."
            />
            <ul className="divide-y divide-[var(--line-subtle)]">
              {work.scopeDecisions.map((change) => (
                <li key={change.id}>
                  <Link
                    href={`/projetos/${change.projectId}?escopo=${change.id}`}
                    className="hover:bg-hover flex flex-col px-4 py-2.5 transition-colors"
                  >
                    <span className="text-strong flex items-center gap-1.5 text-sm font-medium">
                      <EntityCode code={change.code} /> {change.title}
                    </span>
                    <span className="text-2xs text-muted truncate">{change.projectName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {tickets.length > 0 && (
          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  <Headphones className="text-brand size-4" />
                  Chamados atribuídos a você
                  <span
                    className="bg-neutral-soft text-2xs text-muted rounded px-1.5 font-semibold"
                    data-tabular
                  >
                    {tickets.length}
                  </span>
                </span>
              }
            />
            <ul className="divide-y divide-[var(--line-subtle)]">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <TicketLink
                    ticketId={ticket.id}
                    className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-strong flex items-center gap-1.5 text-sm font-medium">
                        <EntityCode code={ticket.code} /> {ticket.title}
                      </span>
                      <span className="text-2xs text-muted truncate">
                        {ticket.clientName} · {SUPPORT_PRIORITY[ticket.priority].label}
                      </span>
                    </div>
                    {ticket.overdue ? (
                      <span className="text-2xs text-danger-text font-medium">Prazo vencido</span>
                    ) : (
                      !ticket.firstResponseAt && (
                        <span className="text-2xs text-subtle">Aguardando resposta</span>
                      )
                    )}
                  </TicketLink>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {contents.length > 0 && (
          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  <Megaphone className="text-accent size-4" />
                  Conteúdos para os próximos dias
                </span>
              }
              description="Seus conteúdos com prazo de produção até daqui a 7 dias."
            />
            <ul className="divide-y divide-[var(--line-subtle)]">
              {contents.map((content) => (
                <li key={content.id}>
                  <Link
                    href={`/marketing?conteudo=${content.id}`}
                    className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-strong flex items-center gap-1.5 text-sm font-medium">
                        <EntityCode code={content.code} /> {content.title}
                      </span>
                      <span className="text-2xs text-muted truncate">
                        {CONTENT_STATUS[content.status].label} ·{' '}
                        {CONTENT_CHANNEL[content.channel].label}
                      </span>
                    </div>
                    {content.dueDate && (
                      <span
                        className={cn(
                          'text-2xs',
                          content.late ? 'text-danger-text font-medium' : 'text-subtle',
                        )}
                      >
                        {formatDeadline(content.dueDate)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Section
          icon={<CalendarDays />}
          tone="neutral"
          title="Próximos 7 dias"
          tasks={work.upcoming}
          context={boardContext}
          empty="Nada vence nos próximos 7 dias."
        />
      </div>

      {params.tarefa && <TaskDrawerLoader context={context} taskId={params.tarefa} />}
      {params.aprovacao && <ApprovalDrawerLoader context={context} approvalId={params.aprovacao} />}
      {params.chamado && <TicketDrawerLoader context={context} ticketId={params.chamado} />}
    </PageContainer>
  )
}

const TONES = {
  danger: 'text-danger',
  brand: 'text-brand',
  accent: 'text-accent',
  neutral: 'text-subtle',
} as const

function Section({
  icon,
  tone,
  title,
  description,
  tasks,
  context,
  empty,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONES
  title: string
  description?: string
  tasks: TaskCardData[]
  context: { users: { id: string; name: string }[]; currentUserId: string; canMove: boolean }
  empty: string
}) {
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <span className={cn('[&_svg]:size-4', TONES[tone])}>{icon}</span>
            {title}
            {tasks.length > 0 && (
              <span
                className="bg-neutral-soft text-2xs text-muted rounded px-1.5 font-semibold"
                data-tabular
              >
                {tasks.length}
              </span>
            )}
          </span>
        }
        description={description}
      />
      {tasks.length === 0 ? (
        <EmptyState compact icon={<CheckCircle2 />} title={empty} />
      ) : (
        <div className="flex flex-col gap-2 p-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} context={context} showProject />
          ))}
        </div>
      )}
    </Panel>
  )
}

function ApprovalSection({
  title,
  description,
  tone,
  items,
  empty,
}: {
  title: string
  description?: string
  tone: 'warning' | 'accent'
  items: MyApproval[]
  empty: string
}) {
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck
              className={cn('size-4', tone === 'warning' ? 'text-warning' : 'text-accent')}
            />
            {title}
            {items.length > 0 && (
              <span
                className="bg-neutral-soft text-2xs text-muted rounded px-1.5 font-semibold"
                data-tabular
              >
                {items.length}
              </span>
            )}
          </span>
        }
        description={description}
      />
      {items.length === 0 ? (
        <EmptyState compact icon={<CheckCircle2 />} title={empty} />
      ) : (
        <ul className="divide-y divide-[var(--line-subtle)]">
          {items.map((approval) => (
            <li key={approval.id}>
              <ApprovalLink
                approvalId={approval.id}
                className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-strong flex items-center gap-1.5 text-sm font-medium">
                    <EntityCode code={approval.code} /> {approval.title}
                    <span className="text-2xs text-muted font-normal">
                      v{approval.currentVersion}
                    </span>
                  </span>
                  <span className="text-2xs text-muted truncate">{approval.projectName}</span>
                </div>
                {approval.dueDate && (
                  <span
                    className={cn(
                      'text-2xs',
                      isOverdue(approval.dueDate) ? 'text-danger-text font-medium' : 'text-subtle',
                    )}
                  >
                    {formatDeadline(approval.dueDate)}
                  </span>
                )}
              </ApprovalLink>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
