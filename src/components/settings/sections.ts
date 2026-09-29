import type { PermissionKey } from '@/shared/permissions'

/**
 * Seções de Configurações.
 *
 * Cada seção abre com a permissão da própria área — alguém com `audit.read`
 * mas sem `users.read` vê só a auditoria. A mesma lista alimenta a navegação
 * lateral e o redirecionamento de `/configuracoes`.
 */

export interface SettingsSection {
  href: string
  label: string
  description: string
  permission: PermissionKey
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: '/configuracoes/usuarios',
    label: 'Usuários',
    description: 'Quem acessa o sistema e com qual perfil.',
    permission: 'users.read',
  },
  {
    href: '/configuracoes/perfis',
    label: 'Perfis e permissões',
    description: 'O que cada perfil pode ver e fazer.',
    permission: 'roles.manage',
  },
  {
    href: '/configuracoes/templates',
    label: 'Templates de projeto',
    description: 'Etapas e tarefas geradas ao criar um projeto.',
    permission: 'projects.templates.manage',
  },
  {
    href: '/configuracoes/catalogos',
    label: 'Catálogos',
    description: 'Origens de lead e tipos de serviço.',
    permission: 'settings.manage',
  },
  {
    href: '/configuracoes/empresa',
    label: 'Empresa',
    description: 'Dados da Kyvon usados em documentos.',
    permission: 'settings.manage',
  },
  {
    href: '/configuracoes/auditoria',
    label: 'Auditoria',
    description: 'Registro imutável de toda mudança relevante.',
    permission: 'audit.read',
  },
]

export const SETTINGS_PERMISSIONS = [
  ...new Set(SETTINGS_SECTIONS.map((section) => section.permission)),
]
