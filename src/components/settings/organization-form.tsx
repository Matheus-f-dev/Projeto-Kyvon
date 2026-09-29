'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'

import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input } from '@/components/ui/input'
import { PanelBody, PanelFooter } from '@/components/ui/panel'
import { idleState, type ActionState } from '@/server/action-state'
import { updateOrganizationAction } from '@/server/modules/admin/actions'
import type { OrganizationInput } from '@/shared/schemas/admin'

type Defaults = { [K in keyof OrganizationInput]?: string | null }

export function OrganizationForm({ defaults }: { defaults: Defaults }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateOrganizationAction,
    idleState,
  )

  const [tracked, setTracked] = useState(state)
  if (state !== tracked) {
    setTracked(state)
    if (state.status === 'success') toast.success(state.message ?? 'Salvo.')
  }

  const error = (name: keyof OrganizationInput) => state.fieldErrors?.[name]?.[0]
  const value = (name: keyof OrganizationInput) => defaults[name] ?? undefined

  return (
    <form action={formAction}>
      <PanelBody className="flex flex-col gap-4">
        <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" required error={error('name')}>
            {(props) => <Input {...props} name="name" defaultValue={value('name')} required />}
          </Field>
          <Field label="Razão social" error={error('legalName')}>
            {(props) => <Input {...props} name="legalName" defaultValue={value('legalName')} />}
          </Field>
          <Field label="CNPJ" error={error('document')}>
            {(props) => (
              <Input
                {...props}
                name="document"
                defaultValue={value('document')}
                placeholder="Somente números"
              />
            )}
          </Field>
          <Field label="E-mail" error={error('email')}>
            {(props) => (
              <Input {...props} name="email" type="email" defaultValue={value('email')} />
            )}
          </Field>
          <Field label="Telefone" error={error('phone')}>
            {(props) => <Input {...props} name="phone" defaultValue={value('phone')} />}
          </Field>
          <Field label="Site" error={error('website')}>
            {(props) => (
              <Input
                {...props}
                name="website"
                defaultValue={value('website')}
                placeholder="https://"
              />
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
