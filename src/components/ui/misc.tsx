import * as SeparatorPrimitive from '@radix-ui/react-separator'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** Peças pequenas e sem estado, agrupadas para não virar um arquivo por linha. */

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-[var(--line-subtle)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
}

/** Tecla de atalho. */
export function Kbd({ className, children, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'border-line inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border',
        'bg-sunken text-muted px-1 font-mono text-[10px] leading-none font-medium',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}

/**
 * Barra de progresso.
 *
 * Fina e sem rótulo embutido — o número, quando importa, vive ao lado no texto.
 */
export function ProgressBar({
  value,
  tone = 'brand',
  className,
  showValue = false,
  label,
}: {
  /** 0 a 100. */
  value: number
  tone?: 'brand' | 'success' | 'warning' | 'danger'
  className?: string
  showValue?: boolean
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))

  const barTone = {
    brand: 'bg-brand',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[tone]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="bg-neutral-soft h-1 min-w-10 flex-1 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progresso'}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', barTone)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue && (
        <span className="text-2xs text-muted w-8 shrink-0 text-right" data-tabular>
          {clamped}%
        </span>
      )}
    </div>
  )
}

/** Código legível da entidade (PRJ-0042), em monoespaçada. */
export function EntityCode({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn('text-2xs text-subtle font-mono tracking-tight', className)}>{code}</span>
  )
}

/** Rótulo + valor, o par usado em painéis de detalhe. */
export function DetailItem({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <dt className="text-2xs text-subtle tracking-wide uppercase">{label}</dt>
      <dd className="text-default text-sm">{children}</dd>
    </div>
  )
}

export function DetailList({ className, ...props }: ComponentProps<'dl'>) {
  return <dl className={cn('grid gap-4 sm:grid-cols-2', className)} {...props} />
}
