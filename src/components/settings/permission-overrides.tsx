'use client'

import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { setUserOverrideAction } from '@/server/modules/admin/actions'
import { PERMISSION_MODULE_LABEL } from '@/shared/domain'
import type { PermissionDefinition, PermissionKey } from '@/shared/permissions'

type Effect = 'allow' | 'deny' | 'inherit'

const EFFECT_OPTIONS: { value: Effect; label: string }[] = [
  { value: 'inherit', label: 'Perfil' },
  { value: 'allow', label: 'Conceder' },
  { value: 'deny', label: 'Negar' },
]

/**
 * Exceções individuais de permissão.
 *
 * Três estados por permissão: segue o perfil, concede além dele ou nega mesmo
 * que o perfil dê. Negar vence tudo (`rbac/resolve.ts`). A mudança é aplicada
 * na hora, com atualização otimista — é uma chave por vez, não um formulário.
 */
export function PermissionOverrides({
  userId,
  modules,
  rolePermissions,
  overrides,
  grantable,
  editable,
}: {
  userId: string
  modules: [string, PermissionDefinition[]][]
  rolePermissions: PermissionKey[]
  overrides: { key: PermissionKey; effect: 'allow' | 'deny' }[]
  /** Permissões que quem está editando pode conceder (tem ela própria). */
  grantable: PermissionKey[]
  editable: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(
    new Map(overrides.map((override) => [override.key, override.effect as Effect])),
    (current, update: { key: PermissionKey; effect: Effect }) => {
      const next = new Map(current)
      if (update.effect === 'inherit') next.delete(update.key)
      else next.set(update.key, update.effect)
      return next
    },
  )
  const fromRole = new Set(rolePermissions)
  const canGrant = new Set(grantable)

  const change = (key: PermissionKey, effect: Effect) =>
    startTransition(async () => {
      setOptimistic({ key, effect })
      const formData = new FormData()
      formData.set('userId', userId)
      formData.set('permission', key)
      formData.set('effect', effect)
      const result = await setUserOverrideAction(formData)
      if (result.status === 'error') toast.error(result.message ?? 'Não foi possível salvar.')
      else toast.success(result.message ?? 'Exceção atualizada.')
      router.refresh()
    })

  return (
    <div className="divide-y divide-[var(--line-subtle)]">
      {modules.map(([module, list]) => (
        <section key={module} className="px-4 py-3">
          <h3 className="text-2xs text-subtle mb-2 font-semibold tracking-wide uppercase">
            {PERMISSION_MODULE_LABEL[module] ?? module}
          </h3>
          <ul className="flex flex-col gap-1">
            {list.map((permission) => {
              const effect = optimistic.get(permission.key) ?? 'inherit'
              const effective =
                effect === 'deny' ? false : effect === 'allow' ? true : fromRole.has(permission.key)

              return (
                <li
                  key={permission.key}
                  className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'text-sm',
                          effective ? 'text-strong' : 'text-subtle line-through',
                        )}
                      >
                        {permission.label}
                      </span>
                      {permission.isSensitive && <Badge tone="warning">Sensível</Badge>}
                      {fromRole.has(permission.key) && effect === 'inherit' && (
                        <span className="text-2xs text-muted">pelo perfil</span>
                      )}
                    </span>
                    <span className="text-2xs text-muted">{permission.description}</span>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label={`Exceção para ${permission.label}`}
                    className="border-line bg-sunken flex shrink-0 rounded-md border p-0.5"
                  >
                    {EFFECT_OPTIONS.map((option) => {
                      const selected = effect === option.value
                      const disabled =
                        !editable ||
                        (option.value === 'allow' && !canGrant.has(permission.key) && !selected)
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={disabled}
                          title={
                            option.value === 'allow' && !canGrant.has(permission.key)
                              ? 'Você não pode conceder uma permissão que não tem.'
                              : undefined
                          }
                          onClick={() => !selected && change(permission.key, option.value)}
                          className={cn(
                            'text-2xs rounded px-2 py-1 font-medium transition-colors',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                            selected
                              ? option.value === 'deny'
                                ? 'bg-danger-soft text-danger-text'
                                : option.value === 'allow'
                                  ? 'bg-success-soft text-success-text'
                                  : 'bg-raised text-strong shadow-[var(--shadow-raised)]'
                              : 'text-muted hover:text-strong',
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
