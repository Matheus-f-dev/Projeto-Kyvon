'use client'

import { LogOut } from 'lucide-react'
import { useActionState, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/ui/action-button'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input } from '@/components/ui/input'
import { PanelBody, PanelFooter } from '@/components/ui/panel'
import { idleState, type ActionState } from '@/server/action-state'
import { revokeOtherSessionsAction, updateProfileAction } from '@/server/modules/admin/actions'
import { changePasswordAction } from '@/server/modules/auth/actions'

/** Toast na transição para sucesso, comparando a identidade do estado. */
function useSuccessToast(state: ActionState, onSuccess?: () => void) {
  const [tracked, setTracked] = useState(state)
  if (state !== tracked) {
    setTracked(state)
    if (state.status === 'success') {
      toast.success(state.message ?? 'Salvo.')
      onSuccess?.()
    }
  }
}

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; jobTitle: string | null; phone: string | null }
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateProfileAction, idleState)
  useSuccessToast(state)

  return (
    <form action={formAction}>
      <PanelBody className="flex flex-col gap-4">
        <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Nome"
            required
            error={state.fieldErrors?.name?.[0]}
            className="sm:col-span-2"
          >
            {(props) => <Input {...props} name="name" defaultValue={defaults.name} required />}
          </Field>
          <Field label="Cargo" error={state.fieldErrors?.jobTitle?.[0]}>
            {(props) => (
              <Input {...props} name="jobTitle" defaultValue={defaults.jobTitle ?? undefined} />
            )}
          </Field>
          <Field label="Telefone" error={state.fieldErrors?.phone?.[0]}>
            {(props) => (
              <Input {...props} name="phone" defaultValue={defaults.phone ?? undefined} />
            )}
          </Field>
        </div>
      </PanelBody>
      <PanelFooter className="justify-end">
        <SubmitButton size="sm">Salvar</SubmitButton>
      </PanelFooter>
    </form>
  )
}

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState<ActionState, FormData>(changePasswordAction, idleState)
  useSuccessToast(state, () => formRef.current?.reset())

  return (
    <form ref={formRef} action={formAction}>
      <PanelBody className="flex flex-col gap-4">
        <FormErrorBanner
          message={state.status === 'error' && !state.fieldErrors ? state.message : undefined}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Senha atual" required error={state.fieldErrors?.currentPassword?.[0]}>
            {(props) => (
              <Input
                {...props}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            )}
          </Field>
          <Field
            label="Nova senha"
            required
            error={state.fieldErrors?.newPassword?.[0]}
            hint="Ao menos 10 caracteres, com letra e número ou símbolo."
          >
            {(props) => (
              <Input
                {...props}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            )}
          </Field>
          <Field
            label="Confirmar nova senha"
            required
            error={state.fieldErrors?.confirmPassword?.[0]}
          >
            {(props) => (
              <Input
                {...props}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            )}
          </Field>
        </div>
      </PanelBody>
      <PanelFooter className="justify-between">
        <span className="text-2xs text-muted">
          As outras sessões são encerradas ao trocar a senha.
        </span>
        <SubmitButton size="sm">Trocar senha</SubmitButton>
      </PanelFooter>
    </form>
  )
}

export function RevokeSessionsButton() {
  return (
    <ActionButton icon={<LogOut />} action={revokeOtherSessionsAction}>
      Encerrar outras sessões
    </ActionButton>
  )
}
