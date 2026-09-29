'use client'

import { RotateCcw, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PanelFooter } from '@/components/ui/panel'
import { Checkbox, CheckboxField } from '@/components/ui/toggle'
import { setRolePermissionsAction } from '@/server/modules/admin/actions'
import { PERMISSION_MODULE_LABEL } from '@/shared/domain'
import type { PermissionDefinition, PermissionKey } from '@/shared/permissions'

/**
 * Matriz de permissões de um perfil.
 *
 * Diferente das exceções individuais, aqui a edição é em lote com botão de
 * salvar: mudar um perfil afeta todo mundo que o usa, e a pessoa precisa ver o
 * conjunto antes de confirmar.
 */
export function RolePermissionsEditor({
  roleId,
  modules,
  initial,
  grantable,
  editable,
}: {
  roleId: string
  modules: [string, PermissionDefinition[]][]
  initial: PermissionKey[]
  grantable: PermissionKey[]
  editable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState(() => new Set(initial))
  const canGrant = new Set(grantable)
  const initialSet = new Set(initial)

  const added = [...selected].filter((key) => !initialSet.has(key)).length
  const removed = initial.filter((key) => !selected.has(key)).length
  const dirty = added + removed > 0

  // Quem edita não perde o que já está no perfil por não ter a permissão —
  // só não consegue *acrescentar* o que não tem.
  const isLocked = (key: PermissionKey) => !editable || (!canGrant.has(key) && !selected.has(key))

  const toggle = (key: PermissionKey, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const toggleModule = (list: PermissionDefinition[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const permission of list) {
        if (on && canGrant.has(permission.key)) next.add(permission.key)
        if (!on) next.delete(permission.key)
      }
      return next
    })

  const save = () =>
    startTransition(async () => {
      const result = await setRolePermissionsAction(roleId, [...selected])
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível salvar.')
        return
      }
      toast.success(result.message ?? 'Permissões salvas.')
      router.refresh()
    })

  return (
    <>
      <div className="divide-y divide-[var(--line-subtle)]">
        {modules.map(([module, list]) => {
          const count = list.filter((permission) => selected.has(permission.key)).length
          const all = count === list.length
          return (
            <section key={module} className="px-4 py-3">
              <label className="mb-2 flex w-fit cursor-pointer items-center gap-2">
                <Checkbox
                  checked={all ? true : count > 0 ? 'indeterminate' : false}
                  disabled={!editable}
                  onCheckedChange={() => toggleModule(list, !all)}
                  aria-label={`Todas as permissões de ${PERMISSION_MODULE_LABEL[module] ?? module}`}
                />
                <span className="text-2xs text-subtle font-semibold tracking-wide uppercase">
                  {PERMISSION_MODULE_LABEL[module] ?? module}
                </span>
                <span className="text-2xs text-muted" data-tabular>
                  {count}/{list.length}
                </span>
              </label>
              <div className="grid gap-x-6 gap-y-2.5 pl-6 sm:grid-cols-2">
                {list.map((permission) => (
                  <CheckboxField
                    key={permission.key}
                    checked={selected.has(permission.key)}
                    disabled={isLocked(permission.key)}
                    onCheckedChange={(value) => toggle(permission.key, value === true)}
                    label={
                      <span className="flex flex-wrap items-center gap-1.5">
                        {permission.label}
                        {permission.isSensitive && <Badge tone="warning">Sensível</Badge>}
                      </span>
                    }
                    description={permission.description}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {editable && (
        <PanelFooter className="sticky bottom-0 justify-between">
          <span className="text-2xs text-muted">
            {dirty
              ? `${added} adicionada${added === 1 ? '' : 's'} · ${removed} removida${removed === 1 ? '' : 's'} — vale para todos com este perfil.`
              : `${selected.size} permissões neste perfil.`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw />}
              disabled={!dirty || pending}
              onClick={() => setSelected(new Set(initial))}
            >
              Descartar
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Save />}
              disabled={!dirty}
              loading={pending}
              onClick={save}
            >
              Salvar permissões
            </Button>
          </div>
        </PanelFooter>
      )}
    </>
  )
}
