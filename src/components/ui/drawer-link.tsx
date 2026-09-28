'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Abre um drawer dirigido pela URL (`?<param>=<id>`) na página atual, mantendo
 * filtros e posição. Voltar no navegador fecha o drawer.
 */
export function DrawerLink({
  param,
  id,
  children,
  className,
}: {
  param: string
  id: string
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.set(param, id)
  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false} className={className}>
      {children}
    </Link>
  )
}

/** URL da página atual sem o parâmetro do drawer — usada para fechá-lo. */
export function useCloseDrawerHref(param: string): string {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.delete(param)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
