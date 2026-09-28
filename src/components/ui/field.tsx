'use client'

import { AlertCircle } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Envelope de campo de formulário.
 *
 * Amarra rótulo, dica, erro e controle pelos ids corretos (`htmlFor`,
 * `aria-describedby`, `aria-invalid`), de modo que leitor de tela anuncie o
 * erro junto do campo em vez de deixá-lo solto na página.
 */

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string | undefined
  required?: boolean
  className?: string
  /** Recebe os atributos de acessibilidade já calculados. */
  children: (props: {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
  }) => ReactNode
}

export function Field({ label, hint, error, required = false, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-default flex items-center gap-1 text-xs font-medium">
          {label}
          {required && (
            <span className="text-danger-text" aria-hidden>
              *
            </span>
          )}
        </label>
      )}

      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}

      {hint && !error && (
        <p id={hintId} className="text-2xs text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-2xs text-danger-text flex items-start gap-1">
          <AlertCircle className="mt-px size-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

/** Agrupa campos relacionados com um título discreto. */
export function FieldGroup({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {(title || description) && (
        <header className="flex flex-col gap-0.5">
          {title && (
            <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">{title}</h3>
          )}
          {description && <p className="text-muted text-xs">{description}</p>}
        </header>
      )}
      {children}
    </section>
  )
}
