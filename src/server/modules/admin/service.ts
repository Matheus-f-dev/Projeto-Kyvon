import { randomBytes } from 'node:crypto'

import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm'

import type { AuthContext } from '@/server/auth/context'
import { hashPassword } from '@/server/auth/password'
import { revokeAllUserSessions } from '@/server/auth/session'
import { db, type Database } from '@/server/db/client'
import {
  leadSources,
  organization,
  permissions,
  projectTemplates,
  rolePermissions,
  roles,
  serviceTypes,
  sessions,
  userPermissions,
  users,
} from '@/server/db/schema'
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '@/server/errors'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { countUsersWithPermission } from '@/server/modules/users/queries'
import { PERMISSION_KEYS, type PermissionKey } from '@/shared/permissions'
import type {
  CatalogItemInput,
  CreateRoleInput,
  CreateUserInput,
  OrganizationInput,
  ProfileInput,
  RoleInput,
  UpdateUserInput,
  UserOverrideInput,
} from '@/shared/schemas/admin'

/**
 * Administração: usuários, perfis, exceções individuais, catálogos e empresa.
 *
 * Três travas valem para tudo aqui (`docs/permissions.md`, seção 12):
 *
 * 1. **Sem escalada** — ninguém concede uma permissão que não tem: nem ao
 *    editar um perfil, nem por exceção, nem ao atribuir um perfil a alguém.
 * 2. **Sem autotrava** — ninguém mexe no próprio perfil, status ou exceções.
 * 3. **Sempre há um administrador** — nenhuma operação pode deixar o sistema
 *    sem ao menos um usuário ativo com `roles.manage`.
 */

const ADMIN_ROLE_KEY = 'admin'

type Actor = Pick<AuthContext, 'user' | 'can'>

const auditActor = (actor: Actor) => ({ id: actor.user.id, email: actor.user.email })

/** Senha temporária forte, mostrada uma única vez para quem administra. */
function temporaryPassword(): string {
  // 12 bytes → 16 caracteres base64url; o sufixo garante número e símbolo
  // para passar na própria política de senha.
  return `${randomBytes(12).toString('base64url')}#7`
}

async function rolePermissionKeys(roleId: string, tx: Database): Promise<PermissionKey[]> {
  const rows = await tx
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId))
  return rows.map((row) => row.key as PermissionKey)
}

function assertNoEscalation(actor: Actor, keys: readonly PermissionKey[], what: string) {
  const missing = keys.filter((key) => !actor.can(key))
  if (missing.length > 0) {
    throw new ForbiddenError(
      `${what} concederia permissões que você não tem: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}.`,
    )
  }
}

async function assertRoleAssignable(actor: Actor, roleId: string, tx: Database) {
  const [role] = await tx
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1)
  if (!role) throw new NotFoundError('Perfil')
  assertNoEscalation(
    actor,
    await rolePermissionKeys(role.id, tx),
    `Atribuir o perfil "${role.name}"`,
  )
  return role
}

/** Chamada dentro da transação, depois da mudança: se ninguém mais administra, desfaz tudo. */
async function assertAdminRemains(tx: Database) {
  if ((await countUsersWithPermission('roles.manage', tx)) === 0) {
    throw new BusinessRuleError(
      'Esta mudança deixaria o sistema sem ninguém capaz de gerenciar perfis. Promova outra pessoa antes.',
    )
  }
}

function assertNotSelf(actor: Actor, userId: string, what: string) {
  if (actor.user.id === userId) {
    throw new BusinessRuleError(
      `Você não pode ${what} da própria conta. Peça a outra pessoa com acesso.`,
    )
  }
}

// ── Usuários ─────────────────────────────────────────────────────────────────

export async function createUser(
  input: CreateUserInput,
  actor: Actor,
): Promise<{ id: string; temporaryPassword: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1)
    if (existing) throw new ConflictError('Já existe um usuário com este e-mail.')

    const role = await assertRoleAssignable(actor, input.roleId, tx)
    const password = temporaryPassword()

    const [row] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        roleId: role.id,
        jobTitle: input.jobTitle ?? null,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(password),
        status: 'active',
      })
      .returning({ id: users.id })
    if (!row) throw new Error('Falha ao criar usuário.')

    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'create',
        entityType: 'user',
        entityId: row.id,
        entityLabel: input.email,
        changes: { role: { from: null, to: role.name }, status: { from: null, to: 'active' } },
      },
      tx,
    )
    return { id: row.id, temporaryPassword: password }
  })
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
    if (!current) throw new NotFoundError('Usuário')

    const roleChanged = current.roleId !== input.roleId
    if (roleChanged) {
      assertNotSelf(actor, userId, 'alterar o perfil')
      await assertRoleAssignable(actor, input.roleId, tx)
    }

    const next = {
      name: input.name,
      jobTitle: input.jobTitle ?? null,
      phone: input.phone ?? null,
      roleId: input.roleId,
    }
    const changes = diffChanges(current, next, ['name', 'jobTitle', 'phone', 'roleId'])
    if (!changes) return

    await tx.update(users).set(next).where(eq(users.id, userId))
    if (roleChanged) await assertAdminRemains(tx)

    await recordAudit(
      {
        actor: auditActor(actor),
        action: roleChanged ? 'permission_change' : 'update',
        entityType: 'user',
        entityId: userId,
        entityLabel: current.email,
        changes,
      },
      tx,
    )
  })
}

/** Suspender derruba as sessões na hora; reativar não devolve sessão nenhuma. */
export async function setUserStatus(
  userId: string,
  status: 'active' | 'suspended',
  actor: Actor,
): Promise<void> {
  assertNotSelf(actor, userId, status === 'suspended' ? 'suspender' : 'reativar')

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: users.id, email: users.email, status: users.status })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
    if (!current) throw new NotFoundError('Usuário')
    if (current.status === status) return

    await tx.update(users).set({ status }).where(eq(users.id, userId))
    if (status === 'suspended') await assertAdminRemains(tx)

    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'update',
        entityType: 'user',
        entityId: userId,
        entityLabel: current.email,
        changes: { status: { from: current.status, to: status } },
      },
      tx,
    )
  })

  if (status === 'suspended') await revokeAllUserSessions(userId)
}

export async function resetUserPassword(
  userId: string,
  actor: Actor,
): Promise<{ temporaryPassword: string }> {
  assertNotSelf(actor, userId, 'redefinir a senha por aqui — use Meu perfil')
  const [current] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)
  if (!current) throw new NotFoundError('Usuário')

  const password = temporaryPassword()
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId))
  await revokeAllUserSessions(userId)

  await recordAudit({
    actor: auditActor(actor),
    action: 'update',
    entityType: 'user',
    entityId: userId,
    entityLabel: current.email,
    changes: { password: { from: '********', to: 'redefinida' } },
  })
  return { temporaryPassword: password }
}

/**
 * Exceção individual sobre o perfil. `deny` vence tudo; `allow` concede algo
 * que o perfil não dá — e só pode ser concedido por quem já tem a permissão.
 */
export async function setUserOverride(input: UserOverrideInput, actor: Actor): Promise<void> {
  assertNotSelf(actor, input.userId, 'criar exceções de permissão')
  if (input.effect === 'allow') assertNoEscalation(actor, [input.permission], 'Esta exceção')

  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
      .limit(1)
    if (!target) throw new NotFoundError('Usuário')

    const [permission] = await tx
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, input.permission))
      .limit(1)
    if (!permission) throw new NotFoundError('Permissão')

    const [previous] = await tx
      .select({ effect: userPermissions.effect })
      .from(userPermissions)
      .where(
        and(eq(userPermissions.userId, target.id), eq(userPermissions.permissionId, permission.id)),
      )
      .limit(1)

    await tx
      .delete(userPermissions)
      .where(
        and(eq(userPermissions.userId, target.id), eq(userPermissions.permissionId, permission.id)),
      )

    if (input.effect !== 'inherit') {
      await tx.insert(userPermissions).values({
        userId: target.id,
        permissionId: permission.id,
        effect: input.effect,
        grantedBy: actor.user.id,
      })
    }

    await assertAdminRemains(tx)

    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'permission_change',
        entityType: 'user',
        entityId: target.id,
        entityLabel: target.email,
        changes: {
          [input.permission]: {
            from: previous?.effect ?? 'perfil',
            to: input.effect === 'inherit' ? 'perfil' : input.effect,
          },
        },
      },
      tx,
    )
  })
}

// ── Perfis ───────────────────────────────────────────────────────────────────

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
}

export async function createRole(input: CreateRoleInput, actor: Actor): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const base = slug(input.name) || 'perfil'
    let key = base
    for (let attempt = 2; ; attempt += 1) {
      const [clash] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, key))
        .limit(1)
      if (!clash) break
      key = `${base}-${attempt}`.slice(0, 40)
    }

    const copied = input.copyFromRoleId ? await rolePermissionKeys(input.copyFromRoleId, tx) : []
    assertNoEscalation(actor, copied, 'Copiar este perfil')

    const [row] = await tx
      .insert(roles)
      .values({ key, name: input.name, description: input.description ?? null, isSystem: false })
      .returning({ id: roles.id })
    if (!row) throw new Error('Falha ao criar perfil.')

    if (copied.length > 0) {
      const ids = await tx
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.key, copied))
      await tx
        .insert(rolePermissions)
        .values(ids.map((permission) => ({ roleId: row.id, permissionId: permission.id })))
    }

    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'create',
        entityType: 'role',
        entityId: row.id,
        entityLabel: input.name,
        changes: { permissions: { from: null, to: copied } },
      },
      tx,
    )
    return row
  })
}

export async function updateRole(roleId: string, input: RoleInput, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1)
    if (!role) throw new NotFoundError('Perfil')
    const next = { name: input.name, description: input.description ?? null }
    const changes = diffChanges(role, next, ['name', 'description'])
    if (!changes) return
    await tx.update(roles).set(next).where(eq(roles.id, roleId))
    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'update',
        entityType: 'role',
        entityId: roleId,
        entityLabel: next.name,
        changes,
      },
      tx,
    )
  })
}

/**
 * Substitui as permissões de um perfil. O Administrador não é editável: ele
 * sempre tem tudo, e é o que garante que o sistema continua administrável.
 */
export async function setRolePermissions(
  roleId: string,
  keys: readonly PermissionKey[],
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1)
    if (!role) throw new NotFoundError('Perfil')
    if (role.key === ADMIN_ROLE_KEY) {
      throw new BusinessRuleError('O perfil Administrador sempre tem todas as permissões.')
    }

    const wanted = [...new Set(keys)].filter((key) =>
      (PERMISSION_KEYS as readonly string[]).includes(key),
    )
    const current = await rolePermissionKeys(role.id, tx)
    const added = wanted.filter((key) => !current.includes(key))
    const removed = current.filter((key) => !wanted.includes(key))
    if (added.length === 0 && removed.length === 0) return

    assertNoEscalation(actor, added, 'Esta alteração')

    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id))
    if (wanted.length > 0) {
      const ids = await tx
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.key, wanted))
      await tx
        .insert(rolePermissions)
        .values(ids.map((permission) => ({ roleId: role.id, permissionId: permission.id })))
    }

    await assertAdminRemains(tx)

    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'permission_change',
        entityType: 'role',
        entityId: role.id,
        entityLabel: role.name,
        changes: { added: { from: null, to: added }, removed: { from: removed, to: null } },
      },
      tx,
    )
  })
}

/** Só perfis criados pela Kyvon, e sem ninguém usando. */
export async function deleteRole(roleId: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1)
    if (!role) throw new NotFoundError('Perfil')
    if (role.isSystem)
      throw new BusinessRuleError('Perfis padrão não são excluídos — edite as permissões.')

    const [inUse] = await tx
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.roleId, roleId), isNull(users.deletedAt)))
    if ((inUse?.value ?? 0) > 0) {
      throw new BusinessRuleError('Há usuários neste perfil. Mova-os para outro antes de excluir.')
    }

    await tx.delete(roles).where(eq(roles.id, roleId))
    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'delete',
        entityType: 'role',
        entityId: roleId,
        entityLabel: role.name,
      },
      tx,
    )
  })
}

// ── Catálogos, templates e empresa ───────────────────────────────────────────

const catalogTable = (kind: CatalogItemInput['kind']) =>
  kind === 'lead_source' ? leadSources : serviceTypes

export async function createCatalogItem(input: CatalogItemInput, actor: Actor): Promise<void> {
  const table = catalogTable(input.kind)
  await db.transaction(async (tx) => {
    const base = slug(input.name) || 'item'
    let key = base
    for (let attempt = 2; ; attempt += 1) {
      const [clash] = await tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.key, key))
        .limit(1)
      if (!clash) break
      key = `${base}-${attempt}`.slice(0, 40)
    }
    const [last] = await tx.select({ value: count() }).from(table)
    await tx.insert(table).values({ key, name: input.name, position: last?.value ?? 0 })
    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'create',
        entityType: 'setting',
        entityLabel: `${input.kind}: ${input.name}`,
      },
      tx,
    )
  })
}

export async function updateCatalogItem(
  kind: CatalogItemInput['kind'],
  id: string,
  patch: { name?: string; isActive?: boolean },
  actor: Actor,
): Promise<void> {
  const table = catalogTable(kind)
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(table).where(eq(table.id, id)).limit(1)
    if (!current) throw new NotFoundError('Item')
    const changes = diffChanges(current, patch, ['name', 'isActive'])
    if (!changes) return
    await tx.update(table).set(patch).where(eq(table.id, id))
    await recordAudit(
      {
        actor: auditActor(actor),
        action: 'update',
        entityType: 'setting',
        entityId: id,
        entityLabel: `${kind}: ${current.name}`,
        changes,
      },
      tx,
    )
  })
}

export async function setTemplateActive(
  templateId: string,
  isActive: boolean,
  actor: Actor,
): Promise<void> {
  const [current] = await db
    .select()
    .from(projectTemplates)
    .where(eq(projectTemplates.id, templateId))
    .limit(1)
  if (!current) throw new NotFoundError('Template')
  if (current.isActive === isActive) return
  await db.update(projectTemplates).set({ isActive }).where(eq(projectTemplates.id, templateId))
  await recordAudit({
    actor: auditActor(actor),
    action: 'update',
    entityType: 'project_template',
    entityId: templateId,
    entityLabel: current.name,
    changes: { isActive: { from: current.isActive, to: isActive } },
  })
}

export async function updateOrganization(input: OrganizationInput, actor: Actor): Promise<void> {
  const [current] = await db.select().from(organization).where(eq(organization.id, 1)).limit(1)
  const next = {
    name: input.name,
    legalName: input.legalName ?? null,
    document: input.document ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
  }
  const changes = diffChanges(current, next, [
    'name',
    'legalName',
    'document',
    'email',
    'phone',
    'website',
  ])
  if (!changes) return
  await db.update(organization).set(next).where(eq(organization.id, 1))
  await recordAudit({
    actor: auditActor(actor),
    action: 'update',
    entityType: 'setting',
    entityLabel: 'Empresa',
    changes,
  })
}

// ── Perfil da própria pessoa ─────────────────────────────────────────────────

export async function updateOwnProfile(
  userId: string,
  email: string,
  input: ProfileInput,
): Promise<void> {
  const [current] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!current) throw new NotFoundError('Usuário')
  const next = { name: input.name, jobTitle: input.jobTitle ?? null, phone: input.phone ?? null }
  const changes = diffChanges(current, next, ['name', 'jobTitle', 'phone'])
  if (!changes) return
  await db.update(users).set(next).where(eq(users.id, userId))
  await recordAudit({
    actor: { id: userId, email },
    action: 'update',
    entityType: 'user',
    entityId: userId,
    entityLabel: email,
    changes,
  })
}

/** Encerra as outras sessões da pessoa — a atual continua. */
export async function revokeOtherSessions(
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        ne(sessions.id, currentSessionId),
        isNull(sessions.revokedAt),
      ),
    )
    .returning({ id: sessions.id })
  return rows.length
}
