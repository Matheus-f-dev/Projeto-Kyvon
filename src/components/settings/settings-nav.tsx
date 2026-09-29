'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'

import type { SettingsSection } from './sections'

/** Navegação lateral de Configurações — vira faixa rolável no celular. */
export function SettingsNav({ sections }: { sections: Pick<SettingsSection, 'href' | 'label'>[] }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Seções de configurações"
      className="border-line -mx-4 flex gap-1 overflow-x-auto border-b px-4 pb-px md:mx-0 md:flex-col md:overflow-visible md:border-b-0 md:px-0"
    >
      {sections.map((section) => {
        const active = pathname === section.href || pathname.startsWith(`${section.href}/`)
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors',
              active
                ? 'bg-active text-strong font-medium'
                : 'text-muted hover:bg-hover hover:text-strong',
            )}
          >
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
