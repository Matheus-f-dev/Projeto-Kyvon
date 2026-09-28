import { cache } from 'react'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { permissions, rolePermissions, userPermissions, users } from '@/server/db/schema'
import { ForbiddenError, UnauthorizedError } from '@/server/errors'
import { resolvePermissions, type PermissionOverride } from '@/server/rbac/resolve'
import type { PermissionKey } from '@/shared/permissions'

import { SESSION_COOKIE, validateSessionToken } from './session'

/**
 * Contexto de autenticação da requisição.
 *
 * Resolvido **uma vez por requisição** (via `cache` do React) e carregado junto
 * com o conjunto efetivo de permissões. Verificar permissão depois disso é
 * consulta a um `Set` em memória — não ida ao banco.
 */

export interface AuthUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  jobTitle: string | null
  roleId: string
  roleKey: string
  roleName: string
}

export interface AuthContext {
  user: AuthUser
  sessionId: string
  permissions: ReadonlySet<PermissionKey>
  can: (permission: PermissionKey) => boolean
  canAny: (...list: PermissionKey[]) => boolean
  canAll: (...list: PermissionKey[]) => boolean
}

async function loadEffectivePermissions(
  userId: string,
  roleId: string,
): Promise<Set<PermissionKey>> {
  const [granted, overrides] = await Promise.all([
    db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId)),
    db
      .select({ key: permissions.key, effect: userPermissions.effect })
      .from(userPermissions)
      .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
      .where(eq(userPermissions.userId, userId)),
  ])

  return resolvePermissions({
    rolePermissions: granted.map((row) => row.key as PermissionKey),
    overrides: overrides as PermissionOverride[],
  })
}

/**
 * Contexto do usuário logado, ou `null`.
 * Use quando a ausência de sessão é um estado válido (ex.: layout público).
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await validateSessionToken(token)
  if (!session) return null

  const row = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      jobTitle: true,
      roleId: true,
      status: true,
      deletedAt: true,
    },
    with: { role: { columns: { key: true, name: true } } },
  })

  if (!row || row.deletedAt || row.status !== 'active' || !row.role) return null

  const effective = await loadEffectivePermissions(row.id, row.roleId)

  const user: AuthUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    jobTitle: row.jobTitle,
    roleId: row.roleId,
    roleKey: row.role.key,
    roleName: row.role.name,
  }

  return {
    user,
    sessionId: session.sessionId,
    permissions: effective,
    can: (permission) => effective.has(permission),
    canAny: (...list) => list.some((permission) => effective.has(permission)),
    canAll: (...list) => list.every((permission) => effective.has(permission)),
  }
})

/** Exige sessão válida. Lança `UnauthorizedError` se não houver. */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext()
  if (!context) throw new UnauthorizedError()
  return context
}

/**
 * Exige sessão **e** permissão. É a fronteira de autorização real do sistema —
 * toda Server Action e todo Route Handler que causa efeito passa por aqui.
 */
export async function requirePermission(permission: PermissionKey): Promise<AuthContext> {
  const context = await requireAuth()
  if (!context.can(permission)) {
    throw new ForbiddenError(`Ação não permitida: requer "${permission}".`)
  }
  return context
}

export async function requireAnyPermission(...list: PermissionKey[]): Promise<AuthContext> {
  const context = await requireAuth()
  if (!context.canAny(...list)) {
    throw new ForbiddenError(`Ação não permitida: requer uma de "${list.join('", "')}".`)
  }
  return context
}
