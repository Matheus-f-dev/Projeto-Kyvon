import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/**
 * Selo de estado.
 *
 * Variante `dot` para status dentro de tabelas densas: o ponto colorido dá o
 * sinal, o texto dá o significado. Cor nunca é o único portador de informação.
 */

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-soft text-neutral-text',
        brand: 'bg-brand-soft text-brand-text',
        success: 'bg-success-soft text-success-text',
        warning: 'bg-warning-soft text-warning-text',
        danger: 'bg-danger-soft text-danger-text',
        info: 'bg-info-soft text-info-text',
        accent: 'bg-accent-soft text-accent-text',
      },
      size: {
        sm: 'h-4.5 px-1.5 text-2xs',
        md: 'h-5.5 px-2 text-xs',
      },
      outline: {
        true: 'border bg-transparent',
        false: '',
      },
    },
    compoundVariants: [
      { outline: true, tone: 'neutral', class: 'border-neutral-border' },
      { outline: true, tone: 'brand', class: 'border-brand-border' },
      { outline: true, tone: 'success', class: 'border-success-border' },
      { outline: true, tone: 'warning', class: 'border-warning-border' },
      { outline: true, tone: 'danger', class: 'border-danger-border' },
      { outline: true, tone: 'info', class: 'border-info-border' },
      { outline: true, tone: 'accent', class: 'border-accent-border' },
    ],
    defaultVariants: { tone: 'neutral', size: 'sm', outline: false },
  },
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** Ponto colorido antes do texto. */
  dot?: boolean
}

const dotColor: Record<BadgeTone, string> = {
  neutral: 'bg-subtle',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
}

export function Badge({
  className,
  tone = 'neutral',
  size,
  outline,
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size, outline }), className)} {...props}>
      {dot && (
        <span
          className={cn('size-1.5 shrink-0 rounded-full', dotColor[tone ?? 'neutral'])}
          aria-hidden
        />
      )}
      {children}
    </span>
  )
}

/**
 * Ponto de status sem caixa — para tabelas onde o selo inteiro pesaria demais.
 */
export function StatusDot({ tone, className }: { tone: BadgeTone; className?: string }) {
  return (
    <span className={cn('size-2 shrink-0 rounded-full', dotColor[tone], className)} aria-hidden />
  )
}
