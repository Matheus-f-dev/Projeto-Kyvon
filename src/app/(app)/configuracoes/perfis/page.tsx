import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { SectionHeader } from '@/components/layout/page'
import { CreateRoleDialog } from '@/components/settings/role-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { NoPermissionState } from '@/components/ui/states'
import { requireAuth } from '@/server/auth/context'
import { listRoles } from '@/server/modules/admin/queries'
import { PERMISSION_KEYS } from '@/shared/permissions'

export const metadata: Metadata = { title: 'Perfis e permissões' }
export const dynamic = 'force-dynamic'

export default async function SettingsRolesPage() {
  const context = await requireAuth()
  if (!context.can('roles.manage')) return <NoPermissionState permission="roles.manage" />

  const roles = await listRoles()

  return (
    <>
      <SectionHeader
        title="Perfis e permissões"
        description="Cada pessoa tem um perfil. Ajustes pontuais são feitos como exceção, na tela do usuário."
        actions={<CreateRoleDialog roles={roles.map(({ id, name }) => ({ id, name }))} />}
      />

      <Panel>
        <ul className="divide-y divide-[var(--line-subtle)]">
          {roles.map((role) => (
            <li key={role.id}>
              <Link
                href={`/configuracoes/perfis/${role.id}`}
                className="hover:bg-hover flex items-center gap-4 px-4 py-3 transition-colors"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-strong text-sm font-medium">{role.name}</span>
                    {role.isSystem && <Badge>Padrão</Badge>}
                  </span>
                  {role.description && (
                    <span className="text-2xs text-muted truncate">{role.description}</span>
                  )}
                </div>
                <span className="text-2xs text-muted hidden shrink-0 sm:block" data-tabular>
                  {role.permissions.length}/{PERMISSION_KEYS.length} permissões
                </span>
                <span className="text-2xs text-muted w-20 shrink-0 text-right" data-tabular>
                  {role.users} {role.users === 1 ? 'pessoa' : 'pessoas'}
                </span>
                <ChevronRight className="text-subtle size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
