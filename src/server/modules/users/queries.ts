import { and, eq, isNull, sql } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { permissions, rolePermissions, userPermissions, users } from '@/server/db/schema'
import type { PermissionKey } from '@/shared/permissions'

export interface UserOption {
  id: string
  name: string
}

/**
 * Pessoas que podem receber trabalho: responsáveis, atribuições, aprovadores.
 * Só usuários ativos — atribuir a alguém suspenso criaria trabalho sem dono.
 */
export async function listUserOptions(): Promise<UserOption[]> {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.status, 'active'), isNull(users.deletedAt)))
    .orderBy(users.name)
}

/**
 * Condição SQL "o usuário tem a permissão", com a mesma precedência de
 * `rbac/resolve.ts`: negação individual vence tudo; concessão individual ou do
 * perfil libera.
 */
function hasPermissionCondition(key: PermissionKey) {
  return sql<boolean>`(
    not exists (
      select 1 from ${userPermissions}
      join ${permissions} on ${permissions.id} = ${userPermissions.permissionId}
      where ${userPermissions.userId} = ${users.id}
        and ${permissions.key} = ${key}
        and ${userPermissions.effect} = 'deny'
    )
    and (
      exists (
        select 1 from ${userPermissions}
        join ${permissions} on ${permissions.id} = ${userPermissions.permissionId}
        where ${userPermissions.userId} = ${users.id}
          and ${permissions.key} = ${key}
          and ${userPermissions.effect} = 'allow'
      )
      or exists (
        select 1 from ${rolePermissions}
        join ${permissions} on ${permissions.id} = ${rolePermissions.permissionId}
        where ${rolePermissions.roleId} = ${users.roleId}
          and ${permissions.key} = ${key}
      )
    )
  )`
}

/** Usuários ativos com uma permissão efetiva — ex.: quem pode ser aprovador. */
export async function listUsersWithPermission(key: PermissionKey): Promise<UserOption[]> {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.status, 'active'), isNull(users.deletedAt), hasPermissionCondition(key)))
    .orderBy(users.name)
}

export async function userHasPermission(
  userId: string,
  key: PermissionKey,
  database: Database = db,
): Promise<boolean> {
  const [row] = await database
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        hasPermissionCondition(key),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Quantos usuários ativos têm a permissão. Usado como trava: nenhuma mudança
 * de perfil, status ou exceção pode deixar o sistema sem ninguém capaz de
 * administrá-lo.
 */
export async function countUsersWithPermission(key: PermissionKey, database: Database = db): Promise<number> {
  const [row] = await database
    .select({ value: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.status, 'active'), isNull(users.deletedAt), hasPermissionCondition(key)))
  return row?.value ?? 0
}
