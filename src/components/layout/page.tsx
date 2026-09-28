import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Moldura de página.
 *
 * Garante que toda tela tenha a mesma largura, o mesmo respiro e o mesmo lugar
 * para título, breadcrumb e ações. Consistência de layout é o que faz o sistema
 * parecer um produto só, e não uma coleção de telas.
 */

export function PageContainer({
  className,
  wide = false,
  ...props
}: ComponentProps<'div'> & { wide?: boolean }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-5 sm:px-6',
        wide ? 'max-w-[1600px]' : 'max-w-[1280px]',
        className,
      )}
      {...props}
    />
  )
}

export interface Crumb {
  label: string
  href?: string
}

/**
 * Breadcrumb.
 *
 * Existe para tornar a cadeia navegável: de uma tarefa se chega ao projeto, ao
 * contrato e ao cliente sem voltar ao menu (requisito 38 do produto).
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Trilha de navegação">
      <ol className="text-2xs text-muted flex flex-wrap items-center gap-0.5">
        {items.map((item, index) => {
          const last = index === items.length - 1

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-0.5">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="hover:bg-hover hover:text-strong rounded px-1 py-0.5 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn('px-1 py-0.5', last && 'text-default')}>{item.label}</span>
              )}
              {!last && <ChevronRight className="text-subtle size-3" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  breadcrumb?: Crumb[]
  actions?: ReactNode
  /** Selos ao lado do título: status, código, etc. */
  badges?: ReactNode
  /** Barra de abas logo abaixo do cabeçalho. */
  tabs?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  badges,
  tabs,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-strong text-2xl leading-tight font-semibold tracking-tight">
              {title}
            </h1>
            {badges}
          </div>
          {description && <p className="text-muted max-w-2xl text-sm">{description}</p>}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {tabs}
    </header>
  )
}

/** Título de seção dentro de uma página. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-strong text-sm font-semibold">{title}</h2>
        {description && <p className="text-muted text-xs">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}
