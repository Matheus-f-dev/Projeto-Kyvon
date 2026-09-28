'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

/** Abre o drawer da mudança de escopo na página atual (`?escopo=`). */
export function ScopeLink({
  scopeChangeId,
  children,
  className,
}: {
  scopeChangeId: string
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.set('escopo', scopeChangeId)
  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false} className={className}>
      {children}
    </Link>
  )
}
