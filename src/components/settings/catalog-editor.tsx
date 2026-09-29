'use client'

import { Check, Pencil, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { FormErrorBanner } from '@/components/ui/form-helpers'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/toggle'
import { cn } from '@/lib/cn'
import { idleState, type ActionState } from '@/server/action-state'
import { createCatalogItemAction, updateCatalogItemAction } from '@/server/modules/admin/actions'

interface CatalogItem {
  id: string
  name: string
  isActive: boolean
}

/**
 * Catálogo editável (origens de lead, tipos de serviço).
 *
 * Itens não são excluídos — são desativados. Um lead antigo continua
 * mostrando a origem de quando foi cadastrado, mas ela some das opções novas.
 */
export function CatalogEditor({
  kind,
  items,
  emptyLabel,
}: {
  kind: 'lead_source' | 'service_type'
  items: CatalogItem[]
  emptyLabel: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (previous, formData) => {
      const result = await createCatalogItemAction(previous, formData)
      if (result.status === 'success') {
        formRef.current?.reset()
        toast.success(result.message ?? 'Item adicionado.')
        router.refresh()
      }
      return result
    },
    idleState,
  )

  return (
    <div className="flex flex-col">
      {items.length === 0 ? (
        <p className="text-muted px-4 py-6 text-center text-sm">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-[var(--line-subtle)]">
          {items.map((item) => (
            <CatalogRow key={item.id} kind={kind} item={item} />
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="border-line bg-sunken flex flex-col gap-2 border-t px-4 py-3"
      >
        <input type="hidden" name="kind" value={kind} />
        <div className="flex items-center gap-2">
          <Input
            name="name"
            placeholder="Novo item…"
            aria-label="Nome do novo item"
            minLength={2}
            maxLength={80}
            required
            className="flex-1"
          />
          <Button type="submit" size="md" icon={<Plus />} loading={pending}>
            Adicionar
          </Button>
        </div>
        <FormErrorBanner
          message={
            state.status === 'error' ? (state.fieldErrors?.name?.[0] ?? state.message) : undefined
          }
        />
      </form>
    </div>
  )
}

function CatalogRow({ kind, item }: { kind: 'lead_source' | 'service_type'; item: CatalogItem }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [pending, startTransition] = useTransition()

  const save = (patch: { name?: string; isActive?: boolean }) =>
    startTransition(async () => {
      const result = await updateCatalogItemAction(kind, item.id, patch)
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível salvar.')
        return
      }
      toast.success(result.message ?? 'Catálogo atualizado.')
      setEditing(false)
      router.refresh()
    })

  return (
    <li className="flex items-center gap-3 px-4 py-2">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim().length < 2) return
            save({ name: name.trim() })
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Nome"
            autoFocus
            maxLength={80}
            className="h-7 flex-1"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setName(item.name)
                setEditing(false)
              }
            }}
          />
          <Button
            type="submit"
            size="sm"
            iconOnly
            icon={<Check />}
            loading={pending}
            aria-label="Salvar"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            iconOnly
            icon={<X />}
            aria-label="Cancelar"
            onClick={() => {
              setName(item.name)
              setEditing(false)
            }}
          />
        </form>
      ) : (
        <>
          <span className={cn('flex-1 text-sm', item.isActive ? 'text-strong' : 'text-subtle')}>
            {item.name}
            {!item.isActive && <span className="text-2xs text-muted"> · inativo</span>}
          </span>
          <Button
            size="xs"
            variant="ghost"
            iconOnly
            icon={<Pencil />}
            aria-label={`Renomear ${item.name}`}
            onClick={() => setEditing(true)}
          />
          <Switch
            checked={item.isActive}
            disabled={pending}
            onCheckedChange={(checked) => save({ isActive: checked })}
            aria-label={item.isActive ? `Desativar ${item.name}` : `Ativar ${item.name}`}
          />
        </>
      )}
    </li>
  )
}
