'use client'

import { AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { loginAction } from '@/server/modules/auth/actions'
import { idleState } from '@/server/action-state'

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(loginAction, idleState)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {state.status === 'error' && !state.fieldErrors && (
        <div
          role="alert"
          className="border-danger-border bg-danger-soft text-danger-text flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {state.message}
        </div>
      )}

      <Field label="E-mail" error={state.fieldErrors?.email?.[0]} required>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            name="email"
            type="email"
            autoComplete="username"
            placeholder="voce@kyvon.com.br"
            className="h-9"
            autoFocus
            required
          />
        )}
      </Field>

      <Field label="Senha" error={state.fieldErrors?.password?.[0]} required>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••••"
            className="h-9"
            required
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="text-subtle hover:text-default transition-colors"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
          />
        )}
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        trailingIcon={<ArrowRight />}
        className="mt-1 w-full"
      >
        Entrar
      </Button>
    </form>
  )
}
