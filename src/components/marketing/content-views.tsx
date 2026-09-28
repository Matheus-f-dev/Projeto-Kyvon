import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DrawerLink } from '@/components/ui/drawer-link'
import { EntityCode } from '@/components/ui/misc'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import {
  formatDate,
  formatDateTime,
  formatDeadline,
  formatShortDate,
  formatTime,
} from '@/lib/format'
import type { CalendarEntry, ContentCard } from '@/server/modules/marketing/queries'
import { addDaysISO, dateToLocalDateTime } from '@/shared/dates'
import {
  CONTENT_BOARD_COLUMNS,
  CONTENT_CHANNEL,
  CONTENT_FORMAT,
  CONTENT_STATUS,
} from '@/shared/domain'

import { ContentMoveMenu } from './content-move'

// ── Quadro ───────────────────────────────────────────────────────────────────

export function ContentBoard({
  cards,
  canWrite,
  canPublish,
}: {
  cards: ContentCard[]
  canWrite: boolean
  canPublish: boolean
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {CONTENT_BOARD_COLUMNS.map((status) => {
        const column = cards.filter((card) => card.status === status)
        return (
          <div key={status} className="flex w-64 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-strong text-xs font-semibold">{CONTENT_STATUS[status].label}</h3>
              <span className="text-2xs text-subtle" data-tabular>
                {column.length}
              </span>
            </div>
            <div className="bg-sunken flex flex-col gap-2 rounded-lg p-1.5">
              {column.length === 0 ? (
                <div className="border-line text-2xs text-subtle rounded-md border border-dashed px-2 py-6 text-center">
                  Vazio
                </div>
              ) : (
                column.map((card) => (
                  <div
                    key={card.id}
                    className="border-line bg-raised flex flex-col gap-1.5 rounded-md border p-2.5 shadow-[var(--shadow-raised)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <DrawerLink
                        param="conteudo"
                        id={card.id}
                        className="flex min-w-0 flex-col gap-0.5"
                      >
                        <EntityCode code={card.code} />
                        <span className="text-strong line-clamp-2 text-sm font-medium hover:underline">
                          {card.title}
                        </span>
                      </DrawerLink>
                      {canWrite && (
                        <ContentMoveMenu
                          contentId={card.id}
                          status={card.status}
                          canPublish={canPublish}
                          scheduledValue={
                            card.scheduledAt ? dateToLocalDateTime(card.scheduledAt) : undefined
                          }
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tone={CONTENT_CHANNEL[card.channel].tone} size="sm">
                        {CONTENT_CHANNEL[card.channel].label}
                      </Badge>
                      <span className="text-2xs text-muted">
                        {CONTENT_FORMAT[card.format].label}
                      </span>
                    </div>
                    <CardFooter card={card} />
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CardFooter({ card }: { card: ContentCard }) {
  const when = card.publishedAt
    ? `Publicado ${formatShortDate(card.publishedAt)}`
    : card.scheduledAt
      ? `Vai ao ar ${formatShortDate(card.scheduledAt)} ${formatTime(card.scheduledAt)}`
      : card.dueDate
        ? `Pronto ${formatDeadline(card.dueDate)}`
        : null

  if (!when && !card.owner) return null
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn('text-2xs', card.late ? 'text-danger-text font-medium' : 'text-subtle')}>
        {when}
      </span>
      {card.owner && <Avatar name={card.owner.name} src={card.owner.avatarUrl} size="xs" />}
    </div>
  )
}

// ── Lista ────────────────────────────────────────────────────────────────────

export function ContentList({ cards }: { cards: ContentCard[] }) {
  return (
    <TableContainer>
      <Table>
        <THead>
          <tr>
            <TH>Conteúdo</TH>
            <TH>Canal</TH>
            <TH className="hidden lg:table-cell">Campanha</TH>
            <TH className="hidden md:table-cell">Responsável</TH>
            <TH>Data</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <TBody>
          {cards.map((card) => (
            <TR key={card.id} interactive>
              <td className="max-w-0 px-3 py-2">
                <DrawerLink param="conteudo" id={card.id} className="flex flex-col gap-0.5">
                  <EntityCode code={card.code} />
                  <span className="text-strong truncate font-medium hover:underline">
                    {card.title}
                  </span>
                </DrawerLink>
              </td>
              <TD>
                <span className="flex flex-col">
                  <span className="text-xs">{CONTENT_CHANNEL[card.channel].label}</span>
                  <span className="text-2xs text-subtle">{CONTENT_FORMAT[card.format].label}</span>
                </span>
              </TD>
              <TD className="hidden lg:table-cell">
                <span className="text-muted truncate text-xs">{card.campaign?.name ?? '—'}</span>
              </TD>
              <TD className="hidden md:table-cell">
                <span className="text-xs">{card.owner?.name ?? '—'}</span>
              </TD>
              <TD>
                <span className={cn('text-xs', card.late && 'text-danger-text font-medium')}>
                  {card.publishedAt ? (
                    card.publishedUrl ? (
                      <a
                        href={card.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-text inline-flex items-center gap-1 hover:underline"
                      >
                        {formatDate(card.publishedAt)} <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      formatDate(card.publishedAt)
                    )
                  ) : card.scheduledAt ? (
                    formatDateTime(card.scheduledAt)
                  ) : card.dueDate ? (
                    `Pronto ${formatDeadline(card.dueDate)}`
                  ) : (
                    '—'
                  )}
                </span>
              </TD>
              <TD>
                <StatusBadge map={CONTENT_STATUS} value={card.status} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  )
}

// ── Calendário ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Mês em grade, semana começando na segunda. Cada conteúdo aparece no dia em
 * que vai ao ar (ou em que foi publicado); sem data de publicação, no prazo
 * de produção, com marcação diferente.
 */
export function ContentCalendar({
  month,
  today,
  entries,
  hrefFor,
}: {
  month: string
  today: string
  entries: CalendarEntry[]
  hrefFor: (month: string) => string
}) {
  const first = `${month}-01`
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  // getUTCDay: 0 = domingo. Converte para segunda = 0.
  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7
  const start = addDaysISO(first, -offset)

  const previous = addDaysISO(first, -1).slice(0, 7)
  const next = addDaysISO(first, 31).slice(0, 7)

  const byDay = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-strong text-sm font-semibold capitalize">
          {MONTH_LABEL.format(new Date(Date.UTC(year, monthNumber - 1, 1)))}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={hrefFor(previous)}
            className="text-muted hover:bg-hover hover:text-strong flex size-7 items-center justify-center rounded"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={hrefFor(today.slice(0, 7))}
            className="text-muted hover:text-strong px-2 text-xs"
          >
            Hoje
          </Link>
          <Link
            href={hrefFor(next)}
            className="text-muted hover:bg-hover hover:text-strong flex size-7 items-center justify-center rounded"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="border-line overflow-x-auto rounded-lg border">
        <div className="grid min-w-[720px] grid-cols-7">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="border-line bg-sunken text-2xs text-subtle border-b px-2 py-1.5 font-medium"
            >
              {day}
            </div>
          ))}
          {Array.from({ length: cells }, (_, index) => {
            const day = addDaysISO(start, index)
            const inMonth = day.startsWith(month)
            const items = byDay.get(day) ?? []
            return (
              <div
                key={day}
                className={cn(
                  'border-line flex min-h-24 flex-col gap-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0',
                  !inMonth && 'bg-sunken/60',
                )}
              >
                <span
                  className={cn(
                    'text-2xs self-end rounded px-1',
                    day === today
                      ? 'bg-brand text-on-brand font-semibold'
                      : inMonth
                        ? 'text-muted'
                        : 'text-subtle',
                  )}
                  data-tabular
                >
                  {Number(day.slice(8))}
                </span>
                {items.map((entry) => (
                  <DrawerLink
                    key={entry.id}
                    param="conteudo"
                    id={entry.id}
                    className={cn(
                      'text-2xs truncate rounded px-1.5 py-0.5 hover:underline',
                      entry.kind === 'published' && 'bg-success-soft text-success-text',
                      entry.kind === 'scheduled' && 'bg-warning-soft text-warning-text',
                      entry.kind === 'due' && 'border-line text-muted border border-dashed',
                    )}
                  >
                    {entry.kind === 'scheduled' && entry.scheduledAt
                      ? `${formatTime(entry.scheduledAt)} `
                      : ''}
                    {entry.title}
                  </DrawerLink>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="text-2xs text-muted flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="bg-warning-soft size-2.5 rounded-sm" /> Agendado
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-success-soft size-2.5 rounded-sm" /> Publicado
        </span>
        <span className="flex items-center gap-1">
          <span className="border-line size-2.5 rounded-sm border border-dashed" /> Prazo de
          produção
        </span>
      </div>
    </div>
  )
}
