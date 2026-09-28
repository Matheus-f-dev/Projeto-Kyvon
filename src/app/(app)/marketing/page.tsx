import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, LayoutGrid, List, Megaphone } from 'lucide-react'

import { CampaignFormDialog, CampaignList } from '@/components/marketing/campaigns'
import {
  CaseCreateDialog,
  CaseDrawer,
  CaseList,
  MissingCaseDrawer,
} from '@/components/marketing/cases'
import { ContentDrawer, MissingContentDrawer } from '@/components/marketing/content-drawer'
import { ContentFormDialog } from '@/components/marketing/content-form-dialog'
import { ContentBoard, ContentCalendar, ContentList } from '@/components/marketing/content-views'
import { ListFilterSelect, ListSearchInput, ListToolbar } from '@/components/layout/list-toolbar'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { cn } from '@/lib/cn'
import { requireAuth, type AuthContext } from '@/server/auth/context'
import {
  countPendingCases,
  getCaseDetail,
  getContentDetail,
  listCalendar,
  listCampaignOptions,
  listCampaigns,
  listCaseEligibleProjects,
  listCases,
  listContents,
} from '@/server/modules/marketing/queries'
import { listUsersWithPermission } from '@/server/modules/users/queries'
import { todayISO } from '@/shared/dates'
import { CONTENT_CHANNEL, CONTENT_STATUS } from '@/shared/domain'
import {
  contentChannelValues,
  contentListFilterSchema,
  contentStatusValues,
} from '@/shared/schemas/marketing'

export const metadata: Metadata = { title: 'Marketing' }
export const dynamic = 'force-dynamic'

type Tab = 'conteudos' | 'campanhas' | 'cases'
type View = 'quadro' | 'calendario' | 'lista'

/**
 * Marketing da própria Kyvon.
 *
 * Responde "o que estamos publicando sobre nós mesmos": o quadro mostra o que
 * está em produção, o calendário o que vai ao ar e quando, a lista serve para
 * buscar e filtrar. Cases ficam ao lado porque dependem de outra coisa — a
 * autorização do cliente.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  const canMarketing = context.can('marketing.read')
  const canCases = context.can('cases.read')
  if (!canMarketing && !canCases) {
    return (
      <PageContainer>
        <NoPermissionState permission="marketing.read" />
      </PageContainer>
    )
  }

  const requested = (['conteudos', 'campanhas', 'cases'] as const).find((tab) => tab === params.aba)
  const tab: Tab =
    requested === 'cases' && canCases
      ? 'cases'
      : requested && requested !== 'cases' && canMarketing
        ? requested
        : canMarketing
          ? 'conteudos'
          : 'cases'

  const canWrite = context.can('marketing.write')
  const canPublish = context.can('marketing.publish')

  const [owners, campaignOptions, pendingCases] = await Promise.all([
    listUsersWithPermission('marketing.write'),
    canMarketing ? listCampaignOptions() : Promise.resolve([]),
    canCases ? countPendingCases() : Promise.resolve(0),
  ])

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Marketing"
        description="Conteúdos, campanhas e cases da própria Kyvon."
        actions={
          tab === 'conteudos' && canWrite ? (
            <ContentFormDialog
              campaigns={campaignOptions}
              owners={owners}
              defaultOpen={params.novo === '1'}
            />
          ) : undefined
        }
      />

      <nav
        className="border-line flex items-center gap-1 border-b"
        aria-label="Seções do marketing"
      >
        {canMarketing && (
          <TabLink href="/marketing" active={tab === 'conteudos'}>
            Conteúdos
          </TabLink>
        )}
        {canMarketing && (
          <TabLink href="/marketing?aba=campanhas" active={tab === 'campanhas'}>
            Campanhas
          </TabLink>
        )}
        {canCases && (
          <TabLink href="/marketing?aba=cases" active={tab === 'cases'} count={pendingCases}>
            Cases
          </TabLink>
        )}
      </nav>

      {tab === 'conteudos' && (
        <ContentsTab
          context={context}
          params={params}
          canWrite={canWrite}
          canPublish={canPublish}
          owners={owners}
          campaigns={campaignOptions}
        />
      )}
      {tab === 'campanhas' && (
        <CampaignsTab context={context} owners={owners} canWrite={canWrite} />
      )}
      {tab === 'cases' && <CasesTab context={context} owners={owners} />}

      {params.conteudo && canMarketing && (
        <ContentDrawerLoader
          context={context}
          contentId={params.conteudo}
          campaigns={campaignOptions}
          owners={owners}
        />
      )}
      {params.case && canCases && (
        <CaseDrawerLoader context={context} caseId={params.case} owners={owners} />
      )}
    </PageContainer>
  )
}

// ── Conteúdos ────────────────────────────────────────────────────────────────

async function ContentsTab({
  context,
  params,
  canWrite,
  canPublish,
  owners,
  campaigns,
}: {
  context: AuthContext
  params: Record<string, string | undefined>
  canWrite: boolean
  canPublish: boolean
  owners: { id: string; name: string }[]
  campaigns: { id: string; name: string }[]
}) {
  const view: View =
    params.view === 'calendario' ? 'calendario' : params.view === 'lista' ? 'lista' : 'quadro'
  const parsed = contentListFilterSchema.safeParse(params)
  const filter = parsed.success ? parsed.data : {}
  const today = todayISO()
  const month = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? params.mes : today.slice(0, 7)

  const [cards, entries] = await Promise.all([
    view === 'calendario' ? Promise.resolve([]) : listContents(context, filter),
    view === 'calendario' ? listCalendar(context, month, filter) : Promise.resolve([]),
  ])

  const hasFilters = Boolean(
    filter.q || filter.status || filter.channel || filter.campaignId || filter.ownerId,
  )
  const viewHref = (next: View) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'view' && key !== 'conteudo' && key !== 'novo') query.set(key, value)
    }
    if (next !== 'quadro') query.set('view', next)
    const text = query.toString()
    return text ? `/marketing?${text}` : '/marketing'
  }
  const monthHref = (next: string) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'mes' && key !== 'conteudo') query.set(key, value)
    }
    query.set('mes', next)
    return `/marketing?${query.toString()}`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ListToolbar>
          <ListSearchInput placeholder="Buscar conteúdo…" />
          <ListFilterSelect
            paramKey="channel"
            placeholder="Canal"
            options={contentChannelValues.map((value) => ({
              value,
              label: CONTENT_CHANNEL[value].label,
            }))}
          />
          <ListFilterSelect
            paramKey="campaignId"
            placeholder="Campanha"
            options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
          />
          <ListFilterSelect
            paramKey="ownerId"
            placeholder="Responsável"
            options={owners.map((owner) => ({ value: owner.id, label: owner.name }))}
          />
          {view === 'lista' && (
            <ListFilterSelect
              paramKey="status"
              placeholder="Status"
              options={contentStatusValues.map((value) => ({
                value,
                label: CONTENT_STATUS[value].label,
              }))}
            />
          )}
        </ListToolbar>

        <div className="bg-sunken flex items-center gap-0.5 rounded-md p-0.5">
          <ViewLink
            href={viewHref('quadro')}
            active={view === 'quadro'}
            label="Quadro"
            icon={<LayoutGrid className="size-3.5" />}
          />
          <ViewLink
            href={viewHref('calendario')}
            active={view === 'calendario'}
            label="Calendário"
            icon={<CalendarDays className="size-3.5" />}
          />
          <ViewLink
            href={viewHref('lista')}
            active={view === 'lista'}
            label="Lista"
            icon={<List className="size-3.5" />}
          />
        </div>
      </div>

      {view === 'calendario' ? (
        <ContentCalendar month={month} today={today} entries={entries} hrefFor={monthHref} />
      ) : cards.length === 0 ? (
        <Panel>
          {hasFilters ? (
            <NoResultsState query={filter.q} />
          ) : (
            <EmptyState
              icon={<Megaphone />}
              title="Nenhum conteúdo ainda"
              description="Toda peça começa como ideia — registre antes que ela se perca."
            />
          )}
        </Panel>
      ) : view === 'quadro' ? (
        <ContentBoard cards={cards} canWrite={canWrite} canPublish={canPublish} />
      ) : (
        <Panel>
          <ContentList cards={cards} />
        </Panel>
      )}
    </div>
  )
}

async function ContentDrawerLoader({
  context,
  contentId,
  campaigns,
  owners,
}: {
  context: AuthContext
  contentId: string
  campaigns: { id: string; name: string }[]
  owners: { id: string; name: string }[]
}) {
  const content = await getContentDetail(context, contentId)
  if (!content) return <MissingContentDrawer />

  // Campanha encerrada e responsável que saiu do marketing continuam como
  // opção — senão salvar qualquer campo os removeria sem ninguém pedir.
  const campaignOptions =
    content.campaign && !campaigns.some((campaign) => campaign.id === content.campaign?.id)
      ? [...campaigns, content.campaign]
      : campaigns
  const ownerOptions =
    content.owner && !owners.some((owner) => owner.id === content.owner?.id)
      ? [...owners, { id: content.owner.id, name: `${content.owner.name} (fora do marketing)` }]
      : owners

  return (
    <ContentDrawer
      content={content}
      campaigns={campaignOptions}
      owners={ownerOptions}
      permissions={{
        canWrite: context.can('marketing.write'),
        canPublish: context.can('marketing.publish'),
      }}
    />
  )
}

// ── Campanhas e cases ────────────────────────────────────────────────────────

async function CampaignsTab({
  context,
  owners,
  canWrite,
}: {
  context: AuthContext
  owners: { id: string; name: string }[]
  canWrite: boolean
}) {
  const campaigns = await listCampaigns(context)
  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex justify-end">
          <CampaignFormDialog owners={owners} />
        </div>
      )}
      <CampaignList campaigns={campaigns} owners={owners} canWrite={canWrite} />
    </div>
  )
}

async function CasesTab({
  context,
  owners,
}: {
  context: AuthContext
  owners: { id: string; name: string }[]
}) {
  const canWrite = context.can('cases.write')
  const [items, eligible] = await Promise.all([
    listCases(context),
    canWrite ? listCaseEligibleProjects() : Promise.resolve([]),
  ])
  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex items-center justify-end gap-3">
          {eligible.length === 0 && (
            <span className="text-2xs text-muted">
              Nenhum projeto entregue sem case no momento.
            </span>
          )}
          <CaseCreateDialog projects={eligible} owners={owners} />
        </div>
      )}
      <CaseList items={items} />
    </div>
  )
}

async function CaseDrawerLoader({
  context,
  caseId,
  owners,
}: {
  context: AuthContext
  caseId: string
  owners: { id: string; name: string }[]
}) {
  const item = await getCaseDetail(context, caseId)
  if (!item) return <MissingCaseDrawer />
  const ownerOptions =
    item.owner && !owners.some((owner) => owner.id === item.owner?.id)
      ? [...owners, { id: item.owner.id, name: `${item.owner.name} (fora do marketing)` }]
      : owners
  return (
    <CaseDrawer
      item={item}
      owners={ownerOptions}
      permissions={{
        canWrite: context.can('cases.write'),
        canPublish: context.can('marketing.publish'),
      }}
    />
  )
}

// ── Navegação ────────────────────────────────────────────────────────────────

function TabLink({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  count?: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors',
        active ? 'border-brand text-strong' : 'text-muted hover:text-strong border-transparent',
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className="bg-warning-soft text-2xs text-warning-text rounded px-1 font-semibold"
          data-tabular
        >
          {count}
        </span>
      )}
    </Link>
  )
}

function ViewLink({
  href,
  active,
  label,
  icon,
}: {
  href: string
  active: boolean
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-7 items-center justify-center rounded transition-colors',
        active
          ? 'bg-raised text-strong shadow-[var(--shadow-raised)]'
          : 'text-subtle hover:text-muted',
      )}
    >
      {icon}
    </Link>
  )
}
