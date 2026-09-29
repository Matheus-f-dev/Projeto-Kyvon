import { cn } from '@/lib/cn'

/**
 * Colunas mensais de uma série só.
 *
 * Sem legenda (o título do painel diz o que está plotado), sem eixo duplo e
 * sem número em toda coluna: o rótulo fica no maior valor e no mês atual; o
 * resto aparece no hover/foco e na tabela ao lado. Renderizado no servidor —
 * o tooltip é CSS puro, acessível por teclado.
 */

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })

export function monthLabel(month: string, withYear = false): string {
  const date = new Date(`${month}-01T12:00:00Z`)
  const label = MONTH.format(date).replace('.', '')
  return withYear ? `${label}/${month.slice(2, 4)}` : label
}

export function MonthlyColumns({
  data,
  format = (value) => value.toLocaleString('pt-BR'),
  unit,
  height = 140,
  className,
}: {
  data: { month: string; value: number }[]
  format?: (value: number) => string
  /** Texto do tooltip depois do valor ("tarefas"). */
  unit?: string
  height?: number
  className?: string
}) {
  const max = Math.max(0, ...data.map((point) => point.value))
  const maxIndex = data.findIndex((point) => point.value === max)
  const lastIndex = data.length - 1

  if (max === 0) {
    return (
      <div
        className={cn('text-muted flex items-center justify-center text-xs', className)}
        style={{ height: height + 20 }}
      >
        Sem registros no período.
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className="relative flex items-end justify-around gap-0.5 border-b border-[var(--line-strong)]"
        style={{ height }}
      >
        {/* Linha de referência do maior valor — recessiva, sólida, 1px. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-[var(--line-subtle)]" />
        {data.map((point, index) => {
          const pct = (point.value / max) * 100
          const labeled = point.value > 0 && (index === maxIndex || index === lastIndex)
          return (
            <div
              key={point.month}
              tabIndex={0}
              aria-label={`${monthLabel(point.month, true)}: ${format(point.value)}${unit ? ` ${unit}` : ''}`}
              className="group relative flex h-full flex-1 cursor-default flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30"
            >
              {labeled && (
                <span className="text-2xs text-default mb-1 font-medium" data-tabular>
                  {format(point.value)}
                </span>
              )}
              <div
                className={cn(
                  'bg-brand w-full max-w-6 rounded-t transition-opacity',
                  'group-hover:opacity-80 group-focus-visible:opacity-80',
                  point.value === 0 && 'bg-transparent',
                )}
                style={{ height: `${pct}%`, minHeight: point.value > 0 ? 2 : 0 }}
              />
              <span
                role="tooltip"
                className={cn(
                  'border-line bg-raised text-strong pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-[var(--shadow-raised)]',
                  'invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100',
                )}
              >
                <span className="text-muted">{monthLabel(point.month, true)} · </span>
                <span data-tabular>{format(point.value)}</span>
                {unit && <span className="text-muted"> {unit}</span>}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-around gap-0.5" aria-hidden>
        {data.map((point) => (
          <span key={point.month} className="text-2xs text-subtle flex-1 text-center">
            {monthLabel(point.month)}
          </span>
        ))}
      </div>
    </div>
  )
}
