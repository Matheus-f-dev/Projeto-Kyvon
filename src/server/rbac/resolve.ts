import type { PermissionKey } from '@/shared/permissions'

/**
 * Resolução de permissões — função pura, sem banco, para ser testável.
 *
 * Ordem de precedência (documentada em `docs/permissions.md`):
 *
 *   1. `deny` explícito no usuário  → NEGA  (vence tudo, inclusive ADMIN)
 *   2. `allow` explícito no usuário → PERMITE
 *   3. permissão concedida ao perfil → PERMITE
 *   4. caso contrário                → NEGA  (default deny)
 *
 * O `deny` vencer o ADMIN é deliberado: permite um administrador de sistema que
 * mesmo assim não enxerga valores financeiros, sem precisar inventar um perfil.
 */

export interface PermissionOverride {
  key: PermissionKey
  effect: 'allow' | 'deny'
}

export interface ResolveInput {
  /** Permissões concedidas ao perfil do usuário. */
  rolePermissions: readonly PermissionKey[]
  /** Sobreposições individuais. */
  overrides?: readonly PermissionOverride[]
}

export function resolvePermissions({
  rolePermissions,
  overrides = [],
}: ResolveInput): Set<PermissionKey> {
  const effective = new Set<PermissionKey>(rolePermissions)

  // Aplica `allow` antes de `deny` para que um `deny` sempre tenha a última
  // palavra, independentemente da ordem em que as sobreposições chegaram.
  for (const override of overrides) {
    if (override.effect === 'allow') effective.add(override.key)
  }

  for (const override of overrides) {
    if (override.effect === 'deny') effective.delete(override.key)
  }

  return effective
}

export function hasPermission(
  permissions: ReadonlySet<PermissionKey>,
  required: PermissionKey,
): boolean {
  return permissions.has(required)
}

/** True se o usuário tiver **todas** as permissões exigidas. */
export function hasAllPermissions(
  permissions: ReadonlySet<PermissionKey>,
  required: readonly PermissionKey[],
): boolean {
  return required.every((key) => permissions.has(key))
}

/** True se o usuário tiver **pelo menos uma** das permissões. */
export function hasAnyPermission(
  permissions: ReadonlySet<PermissionKey>,
  required: readonly PermissionKey[],
): boolean {
  return required.some((key) => permissions.has(key))
}
