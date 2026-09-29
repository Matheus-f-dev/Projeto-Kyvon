import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'

import { Breadcrumb, SectionHeader } from '@/components/layout/page'
import { EditRoleDialog } from '@/components/settings/role-form-dialog'
import { RolePermissionsEditor } from '@/components/settings/role-permissions-editor'
import { DeleteRoleButton } from '@/components/settings/delete-role-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { NoPermissionState } from '@/components/ui/states'
import { requireAuth } from '@/server/auth/context'
import { listRoles } from '@/server/modules/admin/queries'
import { PERMISSION_KEYS, permissionsByModule } from '@/shared/permissions'

export const metadata: Metadata = { title: 'Perfil' }
export const dynamic = 'force-dynamic'

export default async function SettingsRolePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireAuth()
  if (!context.can('roles.manage')) return <NoPermissionState permission="roles.manage" />

  const { id } = await params
  const role = (await listRoles()).find((row) => row.id === id)
  if (!role) notFound()

  // Administrador tem tudo por definição — editar a matriz dele só abriria
  // espaço para trancar o sistema.
  const editable = role.key !== 'admin'

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Perfis e permissões', href: '/configuracoes/perfis' },
          { label: role.name },
        ]}
      />
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            {role.name}
            {role.isSystem && <Badge>Padrão</Badge>}
          </span>
        }
        description={
          role.description ??
          `${role.users} ${role.users === 1 ? 'pessoa usa' : 'pessoas usam'} este perfil.`
        }
        actions={
          <>
            <EditRoleDialog
              role={role}
              trigger={
                <Button variant="secondary" size="sm" icon={<Pencil />}>
                  Renomear
                </Button>
              }
            />
            {!role.isSystem && (
              <DeleteRoleButton
                roleId={role.id}
                name={role.name}
                disabledReason={
                  role.users > 0
                    ? 'Há pessoas neste perfil. Mova-as para outro antes de excluir.'
                    : undefined
                }
                icon={<Trash2 />}
              />
            )}
          </>
        }
      />

      <Panel>
        <PanelHeader
          title="Permissões"
          description={
            editable
              ? `${role.permissions.length} de ${PERMISSION_KEYS.length}. Permissões marcadas como sensíveis dão acesso a valores, documentos ou decisões.`
              : 'O Administrador sempre tem todas as permissões.'
          }
        />
        <RolePermissionsEditor
          roleId={role.id}
          modules={[...permissionsByModule().entries()]}
          initial={role.permissions}
          grantable={PERMISSION_KEYS.filter((key) => context.can(key))}
          editable={editable}
        />
      </Panel>
    </>
  )
}
