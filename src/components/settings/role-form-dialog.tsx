'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import type { ActionState } from '@/server/action-state'
import { createRoleAction, updateRoleAction } from '@/server/modules/admin/actions'

/** Novo perfil. Ao criar, abre o editor de permissões do perfil recém-criado. */
export function CreateRoleDialog({ roles }: { roles: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const [state, formAction] = useActionState(createRoleAction, { status: 'idle' } as ActionState<{
    id: string
  }>)

  const [tracked, setTracked] = useState(state)
  if (state !== tracked) {
    setTracked(state)
    if (state.status === 'success' && state.data) {
      setOpen(false)
      router.push(`/configuracoes/perfis/${state.data.id}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="md" icon={<Plus />}>
          Novo perfil
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader
          title="Novo perfil"
          description="Comece de um perfil existente para ajustar só o que muda."
        />
        <form action={formAction} className="contents">
          <RoleFields state={state}>
            <Field
              label="Copiar permissões de"
              error={state.fieldErrors?.copyFromRoleId?.[0]}
              hint="Você ajusta as permissões na tela seguinte."
            >
              {(props) => (
                <NativeSelect {...props} name="copyFromRoleId" defaultValue="">
                  <option value="">Começar sem permissões</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </RoleFields>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Criar perfil</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditRoleDialog({
  role,
  trigger,
}: {
  role: { id: string; name: string; description: string | null }
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useUpsertFormAction(
    updateRoleAction.bind(null, role.id),
    open,
    setOpen,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="md">
        <DialogHeader title="Editar perfil" />
        <form action={formAction} className="contents">
          <RoleFields state={state} defaults={role} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Salvar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RoleFields({
  state,
  defaults,
  children,
}: {
  state: ActionState<unknown>
  defaults?: { name: string; description: string | null }
  children?: ReactNode
}) {
  return (
    <DialogBody className="flex flex-col gap-4">
      <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
      <Field label="Nome" required error={state.fieldErrors?.name?.[0]}>
        {(props) => (
          <Input {...props} name="name" defaultValue={defaults?.name} required autoFocus />
        )}
      </Field>
      <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
        {(props) => (
          <Textarea
            {...props}
            name="description"
            rows={2}
            defaultValue={defaults?.description ?? undefined}
            placeholder="Para quem é este perfil e o que ele faz."
          />
        )}
      </Field>
      {children}
    </DialogBody>
  )
}
