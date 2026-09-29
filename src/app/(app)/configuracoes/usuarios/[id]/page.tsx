import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { Breadcrumb } from '@/components/layout/page'
import { PermissionOverrides } from '@/components/settings/permission-overrides'
import { ResetPasswordButton, UserStatusButton } from '@/components/settings/user-actions'
import { EditUserDialog } from '@/components/settings/user-form-dialog'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DetailItem, DetailList } from '@/components/ui/misc'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { NoPermissionState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDateTime, formatPhone } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { getAdminUser, listRoles } from '@/server/modules/admin/queries'
import { USER_STATUS } from '@/shared/domain'
import { PERMISSION_KEYS, permissionsByModule } from '@/shared/permissions'

export const metadata: Metadata = { title: 'Usuário' }
export const dynamic = 'force-dynamic'

export default async function SettingsUserPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireAuth()
  if (!context.can('users.read')) return <NoPermissionState permission="users.read" />

  const { id } = await params
  const canWrite = context.can('users.write')
  const canManageRoles = context.can('roles.manage')
  const [user, roles] = await Promise.all([
    getAdminUser(id),
    canWrite ? listRoles() : Promise.resolve([]),
  ])
  if (!user) notFound()

  const isSelf = user.id === context.user.id
  // O perfil atual sempre aparece: manter o perfil não é escalada, e sem ele o
  // formulário ficaria sem opção válida ao editar alguém com mais acesso.
  const assignableRoles = roles
    .filter(
      (role) => role.id === user.role.id || role.permissions.every((key) => context.can(key)),
    )
    .map((role) => ({ id: role.id, name: role.name }))
  const effective = new Set(user.effective)

  return (
    <>
      <Breadcrumb
        items={[{ label: 'Usuários', href: '/configuracoes/usuarios' }, { label: user.name }]}
      />

      <Panel>
        <PanelBody className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={user.name} size="xl" />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-strong text-lg font-semibold">{user.name}</h2>
                  <StatusBadge map={USER_STATUS} value={user.status} />
                </div>
                <span className="text-muted truncate text-sm">{user.email}</span>
              </div>
            </div>

            {canWrite && !isSelf && (
              <div className="flex flex-wrap items-center gap-2">
                <EditUserDialog
                  roles={assignableRoles}
                  user={{
                    id: user.id,
                    name: user.name,
                    roleId: user.role.id,
                    jobTitle: user.jobTitle,
                    phone: user.phone,
                  }}
                  trigger={
                    <Button variant="secondary" size="sm" icon={<Pencil />}>
                      Editar
                    </Button>
                  }
                />
                <ResetPasswordButton userId={user.id} name={user.name} />
                <UserStatusButton userId={user.id} name={user.name} status={user.status} />
              </div>
            )}
          </div>

          {isSelf && (
            <p className="text-2xs text-muted">
              Esta é a sua conta. Perfil, status e exceções da própria conta são alterados por outra
              pessoa com acesso — seus dados pessoais ficam em Meu perfil.
            </p>
          )}

          <DetailList className="sm:grid-cols-4">
            <DetailItem label="Perfil">{user.role.name}</DetailItem>
            <DetailItem label="Cargo">{user.jobTitle ?? '—'}</DetailItem>
            <DetailItem label="Telefone">{formatPhone(user.phone)}</DetailItem>
            <DetailItem label="Último acesso">
              {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca entrou'}
            </DetailItem>
          </DetailList>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Permissões"
          description={`${effective.size} de ${PERMISSION_KEYS.length} permissões efetivas. Exceções valem só para esta pessoa e vencem o perfil.`}
        />
        <PermissionOverrides
          userId={user.id}
          modules={[...permissionsByModule().entries()]}
          rolePermissions={user.rolePermissions}
          overrides={user.overridesList}
          grantable={PERMISSION_KEYS.filter((key) => context.can(key))}
          editable={canManageRoles && !isSelf}
        />
      </Panel>
    </>
  )
}
