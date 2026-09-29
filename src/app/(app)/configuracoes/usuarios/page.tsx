import type { Metadata } from 'next'
import Link from 'next/link'
import { Users } from 'lucide-react'

import { SectionHeader } from '@/components/layout/page'
import { CreateUserDialog } from '@/components/settings/user-form-dialog'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { formatRelative } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { listAdminUsers, listRoles } from '@/server/modules/admin/queries'
import { USER_STATUS } from '@/shared/domain'

export const metadata: Metadata = { title: 'Usuários' }
export const dynamic = 'force-dynamic'

export default async function SettingsUsersPage() {
  const context = await requireAuth()
  if (!context.can('users.read')) return <NoPermissionState permission="users.read" />

  const canWrite = context.can('users.write')
  const [users, roles] = await Promise.all([
    listAdminUsers(),
    canWrite ? listRoles() : Promise.resolve([]),
  ])
  // Só oferece perfis que quem administra poderia atribuir (sem escalada).
  const assignableRoles = roles
    .filter((role) => role.permissions.every((key) => context.can(key)))
    .map((role) => ({ id: role.id, name: role.name }))

  const active = users.filter((user) => user.status === 'active').length

  return (
    <>
      <SectionHeader
        title="Usuários"
        description={`${active} ${active === 1 ? 'pessoa ativa' : 'pessoas ativas'} de ${users.length} cadastradas.`}
        actions={canWrite && <CreateUserDialog roles={assignableRoles} />}
      />

      <Panel>
        {users.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Nenhum usuário"
            description="Cadastre a equipe para distribuir trabalho."
          />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Pessoa</TH>
                  <TH>Perfil</TH>
                  <TH className="hidden md:table-cell">Último acesso</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {users.map((user) => (
                  <TR key={user.id} interactive>
                    <TD>
                      <Link
                        href={`/configuracoes/usuarios/${user.id}`}
                        className="group flex min-w-0 items-center gap-2.5"
                      >
                        <Avatar name={user.name} size="md" />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-strong truncate text-sm font-medium group-hover:underline">
                            {user.name}
                            {user.id === context.user.id && (
                              <span className="text-muted font-normal"> (você)</span>
                            )}
                          </span>
                          <span className="text-2xs text-muted truncate">
                            {user.jobTitle ? `${user.jobTitle} · ${user.email}` : user.email}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-default text-xs">{user.role.name}</span>
                        {user.overrides > 0 && (
                          <Badge tone="accent" title="Permissões individuais além do perfil">
                            {user.overrides} {user.overrides === 1 ? 'exceção' : 'exceções'}
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <span className="text-muted text-xs">
                        {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Nunca entrou'}
                      </span>
                    </TD>
                    <TD>
                      <StatusBadge map={USER_STATUS} value={user.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Panel>
    </>
  )
}
