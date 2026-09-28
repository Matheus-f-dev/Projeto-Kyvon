import {
  BarChart3,
  Briefcase,
  CheckSquare,
  CircleUser,
  FileText,
  FolderKanban,
  Headphones,
  LayoutDashboard,
  Megaphone,
  Paperclip,
  Settings,
  ShieldCheck,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { PermissionKey } from '@/shared/permissions'

/**
 * Navegação principal.
 *
 * Cada item declara a permissão que o torna visível. A sidebar esconde o que a
 * pessoa não pode abrir — não por segurança (isso é do servidor), mas porque
 * um menu cheio de becos sem saída torna o sistema mais difícil de usar.
 *
 * A ordem segue o ciclo de vida do trabalho: o dia a dia primeiro, o comercial
 * depois, a administração por último.
 */

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Visível quando o usuário tem **alguma** destas permissões. */
  permissions?: PermissionKey[]
  /** Casa o item com a URL atual mesmo em subrotas. */
  matchPrefix?: boolean
  shortcut?: string
}

export interface NavSection {
  id: string
  label?: string
  items: NavItem[]
}

export const NAVIGATION: NavSection[] = [
  {
    id: 'principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'G D' },
      { href: '/meu-trabalho', label: 'Meu trabalho', icon: CircleUser, shortcut: 'G M' },
    ],
  },
  {
    id: 'operacao',
    label: 'Operação',
    items: [
      {
        href: '/projetos',
        label: 'Projetos',
        icon: FolderKanban,
        permissions: ['projects.read'],
        matchPrefix: true,
        shortcut: 'G P',
      },
      {
        href: '/tarefas',
        label: 'Tarefas',
        icon: CheckSquare,
        permissions: ['tasks.read'],
        matchPrefix: true,
        shortcut: 'G T',
      },
      {
        href: '/aprovacoes',
        label: 'Aprovações',
        icon: ShieldCheck,
        permissions: ['approvals.read'],
        matchPrefix: true,
        shortcut: 'G A',
      },
      {
        href: '/suporte',
        label: 'Suporte',
        icon: Headphones,
        permissions: ['support.read'],
        matchPrefix: true,
        shortcut: 'G S',
      },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    items: [
      {
        href: '/clientes',
        label: 'Clientes',
        icon: Briefcase,
        permissions: ['clients.read'],
        matchPrefix: true,
        shortcut: 'G C',
      },
      {
        href: '/comercial',
        label: 'Pipeline',
        icon: Target,
        permissions: ['crm.read'],
        matchPrefix: true,
        shortcut: 'G O',
      },
      {
        href: '/contratos',
        label: 'Contratos',
        icon: FileText,
        permissions: ['contracts.read'],
        matchPrefix: true,
      },
    ],
  },
  {
    id: 'kyvon',
    label: 'Kyvon',
    items: [
      {
        href: '/marketing',
        label: 'Marketing',
        icon: Megaphone,
        permissions: ['marketing.read', 'cases.read'],
        matchPrefix: true,
      },
      {
        href: '/arquivos',
        label: 'Arquivos',
        icon: Paperclip,
        permissions: ['files.read'],
        matchPrefix: true,
      },
      {
        href: '/relatorios',
        label: 'Relatórios',
        icon: BarChart3,
        permissions: ['reports.read'],
        matchPrefix: true,
      },
    ],
  },
  {
    id: 'sistema',
    items: [
      {
        href: '/configuracoes',
        label: 'Configurações',
        icon: Settings,
        permissions: [
          'settings.manage',
          'users.read',
          'roles.manage',
          'audit.read',
          'projects.templates.manage',
        ],
        matchPrefix: true,
      },
    ],
  },
]

/** True quando `href` corresponde à rota atual. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true
  if (!item.matchPrefix) return false
  return pathname.startsWith(`${item.href}/`)
}

/** Filtra a navegação pelo que o usuário pode abrir. */
export function visibleSections(can: (permission: PermissionKey) => boolean): NavSection[] {
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permissions || item.permissions.some((permission) => can(permission)),
    ),
  })).filter((section) => section.items.length > 0)
}
