/**
 * Formatação para exibição — pt-BR, fuso de São Paulo.
 *
 * Centralizado para que uma data nunca apareça em dois formatos diferentes em
 * duas telas. Tudo tolera `null`: campo vazio é estado normal, não exceção.
 */

const LOCALE = 'pt-BR'
const TIMEZONE = 'America/Sao_Paulo'

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})

const compactCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const numberFormatter = new Intl.NumberFormat(LOCALE)

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TIMEZONE,
})

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  timeZone: TIMEZONE,
})

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIMEZONE,
})

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIMEZONE,
})

const monthYearFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: TIMEZONE,
})

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

export type DateInput = Date | string | null | undefined

/**
 * Converte a entrada em `Date`.
 *
 * Datas de negócio vêm do Postgres como `YYYY-MM-DD`. Passá-las direto ao
 * `new Date()` as interpreta como UTC meia-noite, o que no Brasil exibe o dia
 * anterior. Por isso a string pura de data é montada como hora local.
 */
export function toDate(value: DateInput): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(value: DateInput, fallback = '—'): string {
  const date = toDate(value)
  return date ? dateFormatter.format(date) : fallback
}

export function formatShortDate(value: DateInput, fallback = '—'): string {
  const date = toDate(value)
  return date ? shortDateFormatter.format(date).replace('.', '') : fallback
}

export function formatDateTime(value: DateInput, fallback = '—'): string {
  const date = toDate(value)
  return date ? dateTimeFormatter.format(date) : fallback
}

export function formatTime(value: DateInput, fallback = '—'): string {
  const date = toDate(value)
  return date ? timeFormatter.format(date) : fallback
}

export function formatMonthYear(value: DateInput, fallback = '—'): string {
  const date = toDate(value)
  return date ? monthYearFormatter.format(date) : fallback
}

/** "há 2 dias", "em 3 semanas". */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value)
  if (!date) return '—'

  const diffMs = date.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / 60_000)

  if (Math.abs(diffMinutes) < 1) return 'agora'
  if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(diffMinutes, 'minute')

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return relativeFormatter.format(diffHours, 'hour')

  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) < 7) return relativeFormatter.format(diffDays, 'day')
  if (Math.abs(diffDays) < 30) return relativeFormatter.format(Math.round(diffDays / 7), 'week')
  if (Math.abs(diffDays) < 365) return relativeFormatter.format(Math.round(diffDays / 30), 'month')

  return relativeFormatter.format(Math.round(diffDays / 365), 'year')
}

/**
 * Dias até a data, em dias de calendário.
 *
 * Compara meia-noite com meia-noite: "vence hoje" precisa dar 0 às 23h, e
 * subtrair timestamps daria -1.
 */
export function daysUntil(value: DateInput, now: Date = new Date()): number | null {
  const date = toDate(value)
  if (!date) return null

  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function isOverdue(value: DateInput, now: Date = new Date()): boolean {
  const days = daysUntil(value, now)
  return days !== null && days < 0
}

export function isToday(value: DateInput, now: Date = new Date()): boolean {
  return daysUntil(value, now) === 0
}

/** Rótulo curto e humano para um prazo: "Hoje", "Amanhã", "3 dias atrás". */
export function formatDeadline(value: DateInput, now: Date = new Date()): string {
  const days = daysUntil(value, now)
  if (days === null) return '—'

  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  if (days === -1) return 'Ontem'
  if (days < 0) return `${Math.abs(days)} dias atrás`
  if (days <= 7) return `Em ${days} dias`

  return formatShortDate(value)
}

// ── Números e dinheiro ───────────────────────────────────────────────────────

/** Valores `numeric` do Postgres chegam como string — nunca use `parseFloat` solto. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatCurrency(value: string | number | null | undefined, fallback = '—'): string {
  const parsed = toNumber(value)
  return parsed === null ? fallback : currencyFormatter.format(parsed)
}

/** "R$ 1,2 mil" — para cartões de métrica onde o valor exato não importa. */
export function formatCompactCurrency(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  const parsed = toNumber(value)
  return parsed === null ? fallback : compactCurrencyFormatter.format(parsed)
}

export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback
  return numberFormatter.format(value)
}

export function formatHours(value: string | number | null | undefined, fallback = '—'): string {
  const parsed = toNumber(value)
  if (parsed === null) return fallback
  return `${numberFormatter.format(parsed)}h`
}

export function formatPercent(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback
  return `${Math.round(value)}%`
}

// ── Texto ────────────────────────────────────────────────────────────────────

/** Iniciais para avatar: "Ana Paula Souza" → "AS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'

  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''

  return (first + last).toUpperCase()
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}

/** 12.345.678/0001-95 */
export function formatDocument(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')

  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }

  return value
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')

  if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')

  return value
}

/** Tamanho de arquivo legível. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`
}

/** Impacto em prazo: "+14 dias", "−3 dias", "sem impacto no prazo". */
export function formatDayImpact(days: number): string {
  if (days === 0) return 'sem impacto no prazo'
  const abs = Math.abs(days)
  return `${days > 0 ? '+' : '−'}${abs} ${abs === 1 ? 'dia' : 'dias'}`
}
