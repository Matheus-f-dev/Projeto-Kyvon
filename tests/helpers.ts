import { eq } from 'drizzle-orm'

import { hashPassword } from '@/server/auth/password'
import { db } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import type { AuthContext } from '@/server/auth/context'
import {
  clients,
  contacts,
  permissions,
  projectTemplates,
  rolePermissions,
  roles,
  users,
} from '@/server/db/schema'
import type { Actor } from '@/server/modules/projects/service'
import { resolvePermissions, type PermissionOverride } from '@/server/rbac/resolve'
import type { PermissionKey } from '@/shared/permissions'

/**
 * Utilidades de teste.
 *
 * Os testes compartilham um banco só (o PGlite é single-connection), então todo
 * registro criado aqui recebe identificador único. Isso permite asserções
 * exatas sem depender da ordem de execução.
 */

let counter = 0

function unique(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export interface TestUser extends Actor {
  name: string
  roleId: string
}

export async function createTestUser(
  roleKey: string,
  overrides: { name?: string; password?: string } = {},
): Promise<TestUser> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, roleKey))
    .limit(1)
  if (!role) throw new Error(`Perfil "${roleKey}" não existe — o seed essencial não rodou.`)

  const email = `${unique('user')}@teste.kyvon.com.br`
  const name = overrides.name ?? `Usuário ${roleKey}`

  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash: await hashPassword(overrides.password ?? 'SenhaDeTeste@2026'),
      roleId: role.id,
      status: 'active',
    })
    .returning({ id: users.id, email: users.email })

  if (!user) throw new Error('Falha ao criar usuário de teste.')

  return { id: user.id, email: user.email, name, roleId: role.id }
}

export interface TestClient {
  id: string
  name: string
  contactId: string
}

export async function createTestClient(ownerId?: string): Promise<TestClient> {
  const name = unique('Cliente')
  const code = await nextCode('client', db)

  const [client] = await db
    .insert(clients)
    .values({ code, name, status: 'active', ownerId: ownerId ?? null })
    .returning({ id: clients.id })

  if (!client) throw new Error('Falha ao criar cliente de teste.')

  const [contact] = await db
    .insert(contacts)
    .values({ clientId: client.id, name: `Contato ${name}`, isPrimary: true, canApprove: true })
    .returning({ id: contacts.id })

  if (!contact) throw new Error('Falha ao criar contato de teste.')

  return { id: client.id, name, contactId: contact.id }
}

export async function getTemplateId(key: string): Promise<string> {
  const [template] = await db
    .select({ id: projectTemplates.id })
    .from(projectTemplates)
    .where(eq(projectTemplates.key, key))
    .limit(1)

  if (!template) throw new Error(`Template "${key}" não existe.`)
  return template.id
}

/**
 * Contexto de autenticação de um usuário de teste, com as permissões lidas do
 * banco — as mesmas que o `getAuthContext` montaria numa requisição real.
 */
export async function contextFor(
  user: TestUser,
  overrides: PermissionOverride[] = [],
): Promise<AuthContext> {
  const granted = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, user.roleId))

  const effective = resolvePermissions({
    rolePermissions: granted.map((row) => row.key as PermissionKey),
    overrides,
  })

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: null,
      jobTitle: null,
      roleId: user.roleId,
      roleKey: '',
      roleName: '',
    },
    sessionId: 'teste',
    permissions: effective,
    can: (permission) => effective.has(permission),
    canAny: (...list) => list.some((permission) => effective.has(permission)),
    canAll: (...list) => list.every((permission) => effective.has(permission)),
  }
}

export { unique }
