import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Painel — o contêiner padrão de conteúdo.
 *
 * Deliberadamente discreto: borda de 1px, sem sombra, sem gradiente. O que
 * separa as seções é espaçamento e hierarquia de texto. Empilhar caixas
 * marcadas é o que faz um sistema parecer um painel administrativo genérico.
 */

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('border-line bg-raised overflow-hidden rounded-lg border', className)}
      {...props}
    />
  )
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
  ...props
}: Omit<ComponentProps<'header'>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header
      className={cn(
        'border-line flex items-center justify-between gap-3 border-b px-4 py-3',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-strong truncate text-sm font-semibold">{title}</h2>
        {description && <p className="text-muted truncate text-xs">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}

export function PanelBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />
}

export function PanelFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'border-line bg-sunken flex items-center gap-2 border-t px-4 py-2.5',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Métrica.
 *
 * Um número grande, um rótulo pequeno e — quando houver — um sinal de direção.
 * Sem gráfico decorativo: se o número não responde a uma pergunta operacional,
 * ele não deveria estar na tela.
 */
export function Metric({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'neutral' | 'danger' | 'warning' | 'success' | 'brand'
  icon?: ReactNode
  className?: string
}) {
  const valueTone = {
    neutral: 'text-strong',
    danger: 'text-danger-text',
    warning: 'text-warning-text',
    success: 'text-success-text',
    brand: 'text-brand-text',
  }[tone]

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="text-muted flex items-center gap-1.5 text-xs">
        {icon && <span className="[&_svg]:size-3.5">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn('text-3xl leading-none font-semibold tracking-tight', valueTone)}
        data-tabular
      >
        {value}
      </p>
      {hint && <p className="text-2xs text-subtle">{hint}</p>}
    </div>
  )
}
