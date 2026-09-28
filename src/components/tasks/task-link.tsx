'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Abre o drawer de uma tarefa na página atual.
 *
 * O drawer é dirigido pela URL (`?tarefa=`), então abrir uma tarefa não tira
 * a pessoa do quadro nem descarta os filtros aplicados — só acrescenta o
 * parâmetro. Voltar no navegador fecha o drawer.
 */
export function TaskLink({
  taskId,
  children,
  className,
}: {
  taskId: string
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const params = new URLSearchParams(searchParams.toString())
  params.set('tarefa', taskId)

  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false} className={className}>
      {children}
    </Link>
  )
}

/** URL da página atual sem o parâmetro do drawer — usada para fechá-lo. */
export function useCloseTaskHref(): string {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.delete('tarefa')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
