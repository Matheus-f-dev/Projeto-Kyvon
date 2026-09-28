'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Abre o drawer de um chamado na página atual (`?chamado=`), mantendo
 * filtros e posição — mesmo padrão do `TaskLink`.
 */
export function TicketLink({
  ticketId,
  children,
  className,
}: {
  ticketId: string
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.set('chamado', ticketId)

  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false} className={className}>
      {children}
    </Link>
  )
}
