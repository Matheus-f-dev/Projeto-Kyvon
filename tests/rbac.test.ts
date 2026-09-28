import { describe, expect, it } from 'vitest'

import { resolvePermissions } from '@/server/rbac/resolve'
import { PERMISSIONS, PERMISSION_KEYS, ROLES, type PermissionKey } from '@/shared/permissions'

/**
 * Resolução de permissões.
 *
 * Função pura e sem banco — é a peça que decide todo acesso do sistema, então
 * precisa de teste rápido e exaustivo nos casos de borda.
 */
describe('resolvePermissions', () => {
  it('parte das permissões do perfil', () => {
    const effective = resolvePermissions({ rolePermissions: ['clients.read', 'tasks.read'] })

    expect(effective.has('clients.read')).toBe(true)
    expect(effective.has('tasks.read')).toBe(true)
    expect(effective.has('contracts.values.read')).toBe(false)
  })

  it('nega por padrão o que não foi concedido', () => {
    const effective = resolvePermissions({ rolePermissions: [] })
    expect(effective.size).toBe(0)
  })

  it('concede o que a sobreposição do usuário permite', () => {
    const effective = resolvePermissions({
      rolePermissions: ['tasks.read'],
      overrides: [{ key: 'contracts.values.read', effect: 'allow' }],
    })

    expect(effective.has('contracts.values.read')).toBe(true)
  })

  it('remove o que a sobreposição do usuário nega', () => {
    const effective = resolvePermissions({
      rolePermissions: ['contracts.read', 'contracts.values.read'],
      overrides: [{ key: 'contracts.values.read', effect: 'deny' }],
    })

    expect(effective.has('contracts.read')).toBe(true)
    expect(effective.has('contracts.values.read')).toBe(false)
  })

  it('faz o deny vencer o allow, na ordem que vierem', () => {
    const denyPrimeiro = resolvePermissions({
      rolePermissions: [],
      overrides: [
        { key: 'audit.read', effect: 'deny' },
        { key: 'audit.read', effect: 'allow' },
      ],
    })

    const allowPrimeiro = resolvePermissions({
      rolePermissions: [],
      overrides: [
        { key: 'audit.read', effect: 'allow' },
        { key: 'audit.read', effect: 'deny' },
      ],
    })

    expect(denyPrimeiro.has('audit.read')).toBe(false)
    expect(allowPrimeiro.has('audit.read')).toBe(false)
  })

  it('faz o deny vencer até sobre o perfil de administrador', () => {
    const adminRole = ROLES.find((role) => role.key === 'admin')
    expect(adminRole).toBeDefined()

    const effective = resolvePermissions({
      rolePermissions: adminRole?.permissions ?? [],
      overrides: [{ key: 'contracts.values.read', effect: 'deny' }],
    })

    // Continua podendo tudo o mais — só o valor financeiro foi retirado.
    expect(effective.has('settings.manage')).toBe(true)
    expect(effective.has('contracts.values.read')).toBe(false)
  })
})

describe('catálogo de permissões', () => {
  it('descreve todas as chaves declaradas', () => {
    const described = new Set(PERMISSIONS.map((permission) => permission.key))
    const missing = PERMISSION_KEYS.filter((key) => !described.has(key))

    expect(missing).toEqual([])
  })

  it('não tem chave duplicada', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })

  it('só concede a perfis chaves que existem no catálogo', () => {
    const valid = new Set<PermissionKey>(PERMISSION_KEYS)

    for (const role of ROLES) {
      const invalid = role.permissions.filter((key) => !valid.has(key))
      expect({ role: role.key, invalid }).toEqual({ role: role.key, invalid: [] })
    }
  })

  it('dá ao administrador o catálogo inteiro', () => {
    const admin = ROLES.find((role) => role.key === 'admin')
    expect(new Set(admin?.permissions ?? []).size).toBe(PERMISSION_KEYS.length)
  })

  it('mantém as permissões sensíveis fora dos perfis de execução', () => {
    const sensitive = new Set(
      PERMISSIONS.filter((permission) => permission.isSensitive).map((p) => p.key),
    )

    // Design, dev e suporte não decidem aprovação nem veem valor de contrato.
    for (const roleKey of ['design', 'dev', 'suporte']) {
      const role = ROLES.find((item) => item.key === roleKey)
      const granted = (role?.permissions ?? []).filter((key) => sensitive.has(key))
      expect({ roleKey, granted }).toEqual({ roleKey, granted: [] })
    }
  })
})
