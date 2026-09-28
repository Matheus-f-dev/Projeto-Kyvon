'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/tooltip'
import type { PermissionKey } from '@/shared/permissions'

import { isActive, visibleSections } from './navigation'

/**
 * Barra lateral.
 *
 * Recolhível para 52px, em que só os ícones permanecem — quem já conhece o
 * sistema ganha largura de tela sem perder a navegação. Nesse estado cada item
 * recebe tooltip, porque ícone sozinho é adivinhação.
 */

export interface SidebarProps {
  permissions: PermissionKey[]
  collapsed: boolean
  onToggleCollapse: () => void
  /** Fecha o drawer no mobile ao navegar. */
  onNavigate?: () => void
  className?: string
}

export function Sidebar({
  permissions,
  collapsed,
  onToggleCollapse,
  onNavigate,
  className,
}: SidebarProps) {
  const pathname = usePathname()
  const permissionSet = new Set(permissions)
  const sections = visibleSections((permission) => permissionSet.has(permission))

  return (
    <aside
      className={cn(
        'border-line bg-base flex h-full flex-col border-r',
        'transition-[width] duration-150 ease-out',
        collapsed ? 'w-[52px]' : 'w-[216px]',
        className,
      )}
      aria-label="Navegação principal"
    >
      <div
        className={cn(
          'border-line flex h-12 shrink-0 items-center border-b',
          collapsed ? 'justify-center px-2' : 'justify-between pr-2 pl-3',
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded"
          aria-label="Kyvon OS — início"
        >
          <Logo />
          {!collapsed && (
            <span className="text-strong text-sm font-semibold tracking-tight">Kyvon</span>
          )}
        </Link>

        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-subtle hover:bg-hover hover:text-strong hidden size-6 items-center justify-center rounded transition-colors lg:flex"
            aria-label="Recolher menu"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-x-hidden overflow-y-auto px-2 py-3">
        {sections.map((section, sectionIndex) => (
          <div key={section.id} className={cn(sectionIndex > 0 && 'mt-4')}>
            {section.label && !collapsed && (
              <p className="text-2xs text-subtle mb-1 px-2 font-semibold tracking-wide uppercase">
                {section.label}
              </p>
            )}
            {section.label && collapsed && sectionIndex > 0 && (
              <div className="mx-2 mb-2 h-px bg-[var(--line-subtle)]" aria-hidden />
            )}

            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(item, pathname)
                const Icon = item.icon

                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors',
                      collapsed ? 'justify-center px-0' : 'px-2',
                      active
                        ? 'bg-brand-soft text-brand-text font-medium'
                        : 'text-muted hover:bg-hover hover:text-strong',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        active ? 'text-brand' : 'text-subtle group-hover:text-muted',
                      )}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )

                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip content={item.label} side="right" shortcut={item.shortcut}>
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {collapsed && (
        <div className="border-line hidden shrink-0 border-t p-2 lg:block">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-subtle hover:bg-hover hover:text-strong flex size-8 w-full items-center justify-center rounded-md transition-colors"
            aria-label="Expandir menu"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        </div>
      )}
    </aside>
  )
}

/**
 * Marca.
 *
 * Um monograma geométrico em SVG: escala sem perder nitidez, herda a cor da
 * marca do tema e não depende de arquivo de imagem.
 */
function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6 shrink-0', className)} fill="none" aria-hidden>
      <rect width="24" height="24" rx="6" className="fill-brand" />
      <path
        d="M8 6.5v11M8 12.2l5.6-5.7M9.9 13.6L16 17.5"
        stroke="var(--on-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export { Logo }
