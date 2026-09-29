'use client'

import { LogOut, Menu, Plus, Search, Settings, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/misc'
import { SETTINGS_PERMISSIONS } from '@/components/settings/sections'
import { ThemeSwitcher } from '@/components/theme'
import { logoutAction } from '@/server/modules/auth/actions'
import type { PermissionKey } from '@/shared/permissions'

import { openCommandPalette } from './command-palette-events'
import { NotificationsMenu } from './notifications-menu'

/** Cabeçalho: busca, criação rápida, notificações e perfil. */

export interface HeaderUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  roleName: string
  jobTitle: string | null
}

export interface HeaderProps {
  user: HeaderUser
  permissions: PermissionKey[]
  unreadNotifications: number
  onOpenMobileMenu: () => void
}

const CREATE_OPTIONS: { label: string; href: string; permission: PermissionKey }[] = [
  { label: 'Cliente', href: '/clientes?novo=1', permission: 'clients.write' },
  { label: 'Oportunidade', href: '/comercial?nova=1', permission: 'crm.write' },
  { label: 'Projeto', href: '/projetos?novo=1', permission: 'projects.write' },
  { label: 'Tarefa', href: '/tarefas?nova=1', permission: 'tasks.write' },
  { label: 'Chamado', href: '/suporte?novo=1', permission: 'support.write' },
  { label: 'Conteúdo', href: '/marketing?novo=1', permission: 'marketing.write' },
]

export function Header({ user, permissions, unreadNotifications, onOpenMobileMenu }: HeaderProps) {
  const router = useRouter()
  const permissionSet = new Set(permissions)
  const createOptions = CREATE_OPTIONS.filter((option) => permissionSet.has(option.permission))

  return (
    <header className="border-line bg-base flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="text-muted hover:bg-hover hover:text-strong flex size-8 items-center justify-center rounded-md transition-colors lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="size-4" />
      </button>

      {/* Campo de busca: é um botão, não um input — quem digita cai no palette,
          que já resolve busca e comandos com teclado. */}
      <button
        type="button"
        onClick={openCommandPalette}
        className={cn(
          'border-line bg-sunken flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5',
          'text-subtle hover:border-line-strong hover:bg-hover text-sm transition-colors',
          'sm:max-w-sm',
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Buscar…</span>
        <span className="hidden shrink-0 gap-0.5 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex-1" />

      {createOptions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="primary" size="sm" icon={<Plus />}>
              <span className="hidden sm:inline">Criar</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Criar novo</DropdownMenuLabel>
            {createOptions.map((option) => (
              <DropdownMenuItem key={option.href} onSelect={() => router.push(option.href)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <NotificationsMenu initialUnread={unreadNotifications} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center rounded-full transition-opacity hover:opacity-85"
            aria-label="Conta"
          >
            <Avatar name={user.name} src={user.avatarUrl} size="md" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-60">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user.name} src={user.avatarUrl} size="lg" />
            <div className="flex min-w-0 flex-col">
              <span className="text-strong truncate text-sm font-medium">{user.name}</span>
              <span className="text-2xs text-muted truncate">{user.email}</span>
              <span className="text-2xs text-subtle mt-0.5 truncate">
                {user.jobTitle ?? user.roleName}
              </span>
            </div>
          </div>

          <DropdownMenuSeparator />

          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-default text-sm">Tema</span>
            <ThemeSwitcher />
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/perfil">
              <User />
              Meu perfil
            </Link>
          </DropdownMenuItem>

          {SETTINGS_PERMISSIONS.some((permission) => permissionSet.has(permission)) && (
            <DropdownMenuItem asChild>
              <Link href="/configuracoes">
                <Settings />
                Configurações
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onSelect={() => openCommandPalette()}>
            <Search />
            Buscar
            <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem destructive onSelect={() => void logoutAction()}>
            <LogOut />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
