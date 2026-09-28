'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Abre o drawer de uma aprovação na página atual (`?aprovacao=`), mantendo
 * filtros e posição — mesmo padrão do `TaskLink`.
 */
export function ApprovalLink({
  approvalId,
  children,
  className,
}: {
  approvalId: string
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.set('aprovacao', approvalId)

  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false} className={className}>
      {children}
    </Link>
  )
}
