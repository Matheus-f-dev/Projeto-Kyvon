'use client'

import { AlertCircle } from 'lucide-react'
import { useFormStatus } from 'react-dom'

import { Button, type ButtonProps } from './button'

/**
 * Peças repetidas em todo formulário ligado a Server Action.
 *
 * `useFormStatus` só enxerga o `<form>` mais próximo — por isso `SubmitButton`
 * precisa ser filho direto do form, nunca um componente separado que recebe
 * `pending` por prop calculado em outro lugar.
 */

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" loading={pending} {...props}>
      {children}
    </Button>
  )
}

export function FormErrorBanner({ message }: { message?: string }) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="border-danger-border bg-danger-soft text-danger-text flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs"
    >
      <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
      {message}
    </div>
  )
}
