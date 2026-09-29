'use client'

import { Check, Copy, Plus } from 'lucide-react'
import { useActionState, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

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
import { Input, NativeSelect } from '@/components/ui/input'
import { useUpsertFormAction } from '@/lib/use-upsert-action'
import type { ActionState } from '@/server/action-state'
import { createUserAction, updateUserAction } from '@/server/modules/admin/actions'

export interface RoleOption {
  id: string
  name: string
}

/**
 * Senha temporária mostrada uma única vez.
 *
 * O servidor não guarda a senha em texto — se quem administra fechar sem
 * copiar, o caminho é "Redefinir senha", não recuperar esta.
 */
export function TemporaryPasswordNotice({ email, password }: { email?: string; password: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      toast.success('Senha copiada.')
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-default text-sm">
        Envie a senha temporária {email ? <strong>para {email}</strong> : 'para a pessoa'} por um
        canal seguro. Ela não será exibida novamente.
      </p>
      <div className="border-line bg-sunken flex items-center gap-2 rounded-md border px-3 py-2">
        <code className="text-strong flex-1 font-mono text-sm break-all select-all">
          {password}
        </code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={copied ? <Check /> : <Copy />}
          onClick={copy}
        >
          {copied ? 'Copiada' : 'Copiar'}
        </Button>
      </div>
      <p className="text-2xs text-muted">
        No primeiro acesso, a pessoa deve trocar a senha em Meu perfil.
      </p>
    </div>
  )
}

export function CreateUserDialog({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false)
  // Cada abertura monta um formulário novo: o `useActionState` anterior —
  // inclusive a senha exibida — é descartado junto.
  const [formKey, setFormKey] = useState(0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setFormKey((key) => key + 1)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" size="md" icon={<Plus />}>
          Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <CreateUserForm key={formKey} roles={roles} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CreateUserForm({ roles, onClose }: { roles: RoleOption[]; onClose: () => void }) {
  const [state, formAction] = useActionState(createUserAction, { status: 'idle' } as ActionState<{
    temporaryPassword: string
    email: string
  }>)

  if (state.status === 'success' && state.data) {
    return (
      <>
        <DialogHeader title="Usuário criado" />
        <DialogBody>
          <TemporaryPasswordNotice
            email={state.data.email}
            password={state.data.temporaryPassword}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Concluir
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogHeader
        title="Novo usuário"
        description="A pessoa recebe uma senha temporária e troca no primeiro acesso."
      />
      <form action={formAction} className="contents">
        <UserFields
          roles={roles}
          errors={state.status === 'error' ? state : undefined}
          includeEmail
        />
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton>Criar usuário</SubmitButton>
        </DialogFooter>
      </form>
    </>
  )
}

export interface UserDefaults {
  id: string
  name: string
  roleId: string
  jobTitle: string | null
  phone: string | null
}

export function EditUserDialog({
  roles,
  user,
  trigger,
}: {
  roles: RoleOption[]
  user: UserDefaults
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useUpsertFormAction(
    updateUserAction.bind(null, user.id),
    open,
    setOpen,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="md">
        <DialogHeader
          title="Editar usuário"
          description="O e-mail de acesso não é alterado aqui."
        />
        <form action={formAction} className="contents">
          <UserFields
            roles={roles}
            errors={state.status === 'error' ? state : undefined}
            defaults={user}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Salvar alterações</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UserFields({
  roles,
  errors,
  defaults,
  includeEmail = false,
}: {
  roles: RoleOption[]
  errors?: ActionState<unknown>
  defaults?: UserDefaults
  includeEmail?: boolean
}) {
  const fieldError = (name: string) => errors?.fieldErrors?.[name]?.[0]

  return (
    <DialogBody className="flex flex-col gap-4">
      <FormErrorBanner message={errors?.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={fieldError('name')} className="sm:col-span-2">
          {(props) => (
            <Input {...props} name="name" defaultValue={defaults?.name} required autoFocus />
          )}
        </Field>
        {includeEmail && (
          <Field label="E-mail" required error={fieldError('email')} className="sm:col-span-2">
            {(props) => <Input {...props} name="email" type="email" required />}
          </Field>
        )}
        <Field
          label="Perfil"
          required
          error={fieldError('roleId')}
          hint="Você só atribui perfis cujas permissões você também tem."
          className="sm:col-span-2"
        >
          {(props) => (
            <NativeSelect {...props} name="roleId" defaultValue={defaults?.roleId ?? ''} required>
              <option value="" disabled>
                Selecione…
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Cargo" error={fieldError('jobTitle')}>
          {(props) => (
            <Input {...props} name="jobTitle" defaultValue={defaults?.jobTitle ?? undefined} />
          )}
        </Field>
        <Field label="Telefone" error={fieldError('phone')}>
          {(props) => <Input {...props} name="phone" defaultValue={defaults?.phone ?? undefined} />}
        </Field>
      </div>
    </DialogBody>
  )
}
