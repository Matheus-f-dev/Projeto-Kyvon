import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createSession } from '@/server/auth/session'
import { db } from '@/server/db/client'
import { seedEssential } from '@/server/db/seed/essential'
import {
  leadSources,
  permissions,
  rolePermissions,
  roles,
  sessions,
  users,
} from '@/server/db/schema'
import { BusinessRuleError, ConflictError, ForbiddenError } from '@/server/errors'
import { getAdminUser, listRoles } from '@/server/modules/admin/queries'
import {
  createRole,
  createUser,
  resetUserPassword,
  setRolePermissions,
  setUserOverride,
  setUserStatus,
  updateCatalogItem,
  updateUser,
} from '@/server/modules/admin/service'
import { login } from '@/server/modules/auth/service'
import { __resetAllRateLimits } from '@/server/security/rate-limit'
import { passwordSchema } from '@/shared/schemas/auth'

import { contextFor, createTestUser, unique } from './helpers'

/**
 * Administração. As três travas: ninguém concede o que não tem, ninguém mexe
 * na própria conta por aqui, e perfis editados na tela não são desfeitos por
 * um novo deploy (seed).
 */

async function roleId(key: string) {
  const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key))
  return row!.id
}

const email = () => `${unique('pessoa')}@teste.kyvon.com.br`

describe('usuários', () => {
  it('cria com senha temporária válida, que funciona no login', async () => {
    const admin = await contextFor(await createTestUser('admin'))
    const address = email()
    const { temporaryPassword } = await createUser(
      { name: 'Nova Pessoa', email: address, roleId: await roleId('design') },
      admin,
    )

    expect(passwordSchema.safeParse(temporaryPassword).success).toBe(true)
    __resetAllRateLimits()
    const result = await login(address, temporaryPassword, {
      ipAddress: '127.0.0.1',
      userAgent: 'teste',
    })
    expect(result.user.email).toBe(address)

    await expect(
      createUser({ name: 'Outra', email: address, roleId: await roleId('design') }, admin),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('não atribui perfil com permissões que quem atribui não tem', async () => {
    const gestorUser = await createTestUser('gestor')
    // Gestor com `users.write` concedido individualmente: pode cadastrar, mas não criar administradores.
    const gestor = await contextFor(gestorUser, [{ key: 'users.write', effect: 'allow' }])

    await expect(
      createUser({ name: 'X', email: email(), roleId: await roleId('admin') }, gestor),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      createUser({ name: 'Y', email: email(), roleId: await roleId('dev') }, gestor),
    ).resolves.toMatchObject({ id: expect.any(String) })
  })

  it('ninguém altera o próprio perfil nem se suspende', async () => {
    const adminUser = await createTestUser('admin')
    const admin = await contextFor(adminUser)

    await expect(
      updateUser(adminUser.id, { name: 'Eu', roleId: await roleId('dev') }, admin),
    ).rejects.toThrow(/própria conta/)
    await expect(setUserStatus(adminUser.id, 'suspended', admin)).rejects.toThrow(/própria conta/)
  })

  it('suspender e redefinir senha encerram as sessões da pessoa', async () => {
    const admin = await contextFor(await createTestUser('admin'))
    const target = await createTestUser('dev')

    await createSession(target.id, { ipAddress: null, userAgent: null })
    await setUserStatus(target.id, 'suspended', admin)
    const open = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt)))
    expect(open).toHaveLength(0)

    await setUserStatus(target.id, 'active', admin)
    await createSession(target.id, { ipAddress: null, userAgent: null })
    const { temporaryPassword } = await resetUserPassword(target.id, admin)
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(16)
    const stillOpen = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt)))
    expect(stillOpen).toHaveLength(0)
  })
})

describe('exceções individuais', () => {
  it('negar vence o perfil; conceder exige ter a permissão', async () => {
    const admin = await contextFor(await createTestUser('admin'))
    const target = await createTestUser('comercial')

    await setUserOverride(
      { userId: target.id, permission: 'crm.values.read', effect: 'deny' },
      admin,
    )
    const detail = await getAdminUser(target.id)
    expect(detail?.effective).not.toContain('crm.values.read')
    expect(detail?.rolePermissions).toContain('crm.values.read')

    await setUserOverride(
      { userId: target.id, permission: 'crm.values.read', effect: 'inherit' },
      admin,
    )
    expect((await getAdminUser(target.id))?.effective).toContain('crm.values.read')

    const gestor = await contextFor(await createTestUser('gestor'), [
      { key: 'roles.manage', effect: 'allow' },
    ])
    await expect(
      setUserOverride(
        { userId: target.id, permission: 'settings.manage', effect: 'allow' },
        gestor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('ninguém cria exceção para si mesmo', async () => {
    const adminUser = await createTestUser('admin')
    await expect(
      setUserOverride(
        { userId: adminUser.id, permission: 'audit.read', effect: 'deny' },
        await contextFor(adminUser),
      ),
    ).rejects.toThrow(/própria conta/)
  })
})

describe('perfis', () => {
  it('Administrador não é editável', async () => {
    const admin = await contextFor(await createTestUser('admin'))
    await expect(setRolePermissions(await roleId('admin'), [], admin)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
  })

  it('edita perfil criado e não deixa conceder o que não tem', async () => {
    const admin = await contextFor(await createTestUser('admin'))
    const { id } = await createRole(
      { name: unique('Freelancer'), copyFromRoleId: await roleId('design') },
      admin,
    )

    const created = (await listRoles()).find((role) => role.id === id)
    expect(created?.permissions.length).toBeGreaterThan(0)

    await setRolePermissions(id, ['clients.read', 'tasks.read'], admin)
    expect((await listRoles()).find((role) => role.id === id)?.permissions.sort()).toEqual([
      'clients.read',
      'tasks.read',
    ])

    const gestor = await contextFor(await createTestUser('gestor'), [
      { key: 'roles.manage', effect: 'allow' },
    ])
    await expect(
      setRolePermissions(id, ['clients.read', 'settings.manage'], gestor),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('seed não desfaz o que foi configurado na tela', () => {
  it('permissão removida de um perfil de sistema continua removida; Administrador segue com tudo', async () => {
    const devRole = await roleId('dev')
    const [permission] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, 'tasks.assign'))
    const admin = await contextFor(await createTestUser('admin'))

    const current = (await listRoles()).find((role) => role.id === devRole)!.permissions
    await setRolePermissions(
      devRole,
      current.filter((key) => key !== 'tasks.assign'),
      admin,
    )

    const [source] = await db
      .select({ id: leadSources.id })
      .from(leadSources)
      .where(eq(leadSources.key, 'site'))
    await updateCatalogItem('lead_source', source!.id, { name: 'Site institucional' }, admin)

    await seedEssential(db)

    const after = await db
      .select()
      .from(rolePermissions)
      .where(
        and(eq(rolePermissions.roleId, devRole), eq(rolePermissions.permissionId, permission!.id)),
      )
    expect(after).toHaveLength(0)

    const [renamed] = await db
      .select({ name: leadSources.name })
      .from(leadSources)
      .where(eq(leadSources.id, source!.id))
    expect(renamed?.name).toBe('Site institucional')

    const adminRole = (await listRoles()).find((role) => role.key === 'admin')!
    const total = await db.select({ id: permissions.id }).from(permissions)
    expect(adminRole.permissions).toHaveLength(total.length)

    // Devolve o estado para não afetar outros arquivos de teste.
    await setRolePermissions(devRole, current, admin)
    await updateCatalogItem('lead_source', source!.id, { name: 'Site' }, admin)
  })
})

describe('usuários inativos não entram', () => {
  it('suspenso não faz login', async () => {
    const admin = await contextFor(await createTestUser('admin'))
    const target = await createTestUser('dev', { password: 'SenhaDeTeste@2026' })
    await setUserStatus(target.id, 'suspended', admin)
    __resetAllRateLimits()
    await expect(
      login(target.email, 'SenhaDeTeste@2026', { ipAddress: '127.0.0.1', userAgent: 'x' }),
    ).rejects.toThrow()
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, target.id))
    expect(row?.status).toBe('suspended')
  })
})
