/**
 * Datas de negócio como texto `YYYY-MM-DD`.
 *
 * Colunas `date` do Postgres não têm fuso. Convertê-las para `Date` para
 * comparar prazos introduz o bug clássico: às 21h em São Paulo o servidor em
 * UTC já virou o dia, e "vence hoje" passa a "venceu ontem".
 *
 * Trabalhar com a string no fuso da empresa elimina a classe inteira de erro.
 */

const TIMEZONE = 'America/Sao_Paulo'

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIMEZONE,
})

/** Data de hoje no fuso da empresa, como `YYYY-MM-DD`. */
export function todayISO(reference: Date = new Date()): string {
  // 'en-CA' já formata como YYYY-MM-DD.
  return isoFormatter.format(reference)
}

/** Soma dias a uma data ISO, sem passar por fuso horário. */
export function addDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso

  // UTC de propósito: aritmética pura de calendário, sem horário de verão.
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

/** Diferença em dias de calendário entre duas datas ISO. */
export function diffDaysISO(from: string, to: string): number {
  const parse = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number)
    return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  }

  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

/** Início do dia de hoje, como instante, para comparar com `timestamptz`. */
export function startOfTodayUTC(reference: Date = new Date()): Date {
  return new Date(`${todayISO(reference)}T00:00:00.000Z`)
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Diferença (ms) entre o relógio do fuso da empresa e o UTC, num instante. */
function zoneOffsetMs(instant: number): number {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  )
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUTC - instant
}

/**
 * Converte o valor de um `<input type="datetime-local">` ("2026-09-30T14:00"),
 * que não tem fuso, no instante correspondente no fuso da empresa.
 *
 * Interpretar no fuso do servidor (UTC em produção) agendaria o post 3 horas
 * antes do que a pessoa escolheu.
 */
export function localDateTimeToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number) as number[]
  const naive = Date.UTC(year!, month! - 1, day!, hour!, minute!)
  // Duas passadas cobrem a virada de horário de verão, se o fuso tiver.
  const first = naive - zoneOffsetMs(naive)
  return new Date(naive - zoneOffsetMs(first))
}

/** Inverso de `localDateTimeToDate`: instante → valor para `datetime-local`. */
export function dateToLocalDateTime(date: Date): string {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** Mês (`YYYY-MM`) de um instante, no fuso da empresa. */
export function monthOf(date: Date): string {
  return todayISO(date).slice(0, 7)
}
