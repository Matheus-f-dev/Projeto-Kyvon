'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { setStoredPreference, useStoredPreference } from '@/lib/stored-preference'
import type { PermissionKey } from '@/shared/permissions'

import { CommandPalette } from './command-palette'
import { Header, type HeaderUser } from './header'
import { Sidebar } from './sidebar'

/**
 * Estrutura da aplicação.
 *
 * No desktop a sidebar é fixa e recolhível; abaixo de `lg` vira drawer, porque
 * 216px de menu num celular deixariam o conteúdo inutilizável.
 *
 * Só o `main` rola. Cabeçalho e sidebar ficam parados — ao percorrer uma lista
 * longa, busca e navegação continuam ao alcance.
 */

const COLLAPSE_STORAGE_KEY = 'kyvon-sidebar-collapsed'

export interface AppShellProps {
  user: HeaderUser
  permissions: PermissionKey[]
  unreadNotifications: number
  children: ReactNode
}

export function AppShell({ user, permissions, unreadNotifications, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Vem do localStorage já na primeira renderização do cliente, sem o efeito
  // que faria a sidebar "pular" de expandida para recolhida após a hidratação.
  const collapsed = useStoredPreference(COLLAPSE_STORAGE_KEY, '0') === '1'
  const toggleCollapse = () => setStoredPreference(COLLAPSE_STORAGE_KEY, collapsed ? '0' : '1')

  return (
    <div className="bg-sunken flex h-dvh overflow-hidden">
      <Sidebar
        permissions={permissions}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        className="hidden lg:flex"
      />

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.15_0.01_265_/_0.5)] data-[state=open]:animate-[var(--animate-fade-in)] lg:hidden" />
          <Dialog.Content
            className={cn(
              'fixed inset-y-0 left-0 z-50 lg:hidden',
              'data-[state=open]:animate-[var(--animate-slide-up)]',
            )}
            aria-label="Menu de navegação"
          >
            <Dialog.Title className="sr-only">Navegação</Dialog.Title>
            <Sidebar
              permissions={permissions}
              collapsed={false}
              onToggleCollapse={toggleCollapse}
              onNavigate={() => setMobileOpen(false)}
              className="w-[250px]"
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          user={user}
          permissions={permissions}
          unreadNotifications={unreadNotifications}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <CommandPalette permissions={permissions} />
    </div>
  )
}
