import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/**
 * Esqueleto de carregamento.
 *
 * Deve ter aproximadamente a forma do conteúdo que vai chegar — um bloco
 * genérico não reduz a sensação de espera, só substitui o vazio por cinza.
 */

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('bg-neutral-soft animate-[var(--animate-shimmer)] rounded', className)}
      aria-hidden
      {...props}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_unused, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/** Esqueleto de tabela com a mesma grade de colunas do conteúdo real. */
export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col" aria-busy aria-label="Carregando">
      <div className="border-line flex items-center gap-4 border-b px-4 py-2.5">
        {Array.from({ length: columns }, (_unused, index) => (
          <Skeleton key={index} className={cn('h-2.5', index === 0 ? 'w-40' : 'w-20')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_unused, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-[var(--line-subtle)] px-4 py-3"
        >
          {Array.from({ length: columns }, (_unusedCell, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-3', columnIndex === 0 ? 'w-48' : 'w-16')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy aria-label="Carregando">
      {Array.from({ length: count }, (_unused, index) => (
        <div
          key={index}
          className="border-line bg-raised flex flex-col gap-3 rounded-lg border p-4"
        >
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-2 w-32" />
        </div>
      ))}
    </div>
  )
}
