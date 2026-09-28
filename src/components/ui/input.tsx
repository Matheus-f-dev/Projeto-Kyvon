'use client'

import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Campos de texto.
 *
 * O estado de erro é comunicado por borda **e** por `aria-invalid` —
 * cor sozinha não serve a quem não a distingue.
 */

const fieldBase = [
  'w-full rounded-md border bg-raised text-strong',
  'border-line placeholder:text-subtle',
  'transition-[border-color,box-shadow] duration-100',
  'hover:border-line-strong',
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
  'disabled:cursor-not-allowed disabled:bg-hover disabled:text-muted',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20',
].join(' ')

export interface InputProps extends ComponentProps<'input'> {
  /** Elemento fixo à esquerda (ícone, prefixo). Não recebe eventos. */
  leading?: ReactNode
  trailing?: ReactNode
}

export function Input({ className, leading, trailing, ...props }: InputProps) {
  const input = (
    <input
      className={cn(
        fieldBase,
        'h-8 px-2.5 text-sm',
        leading && 'pl-8',
        trailing && 'pr-8',
        className,
      )}
      {...props}
    />
  )

  if (!leading && !trailing) return input

  return (
    <div className="relative flex items-center">
      {leading && (
        <span className="text-subtle pointer-events-none absolute left-2.5 flex [&_svg]:size-3.5">
          {leading}
        </span>
      )}
      {input}
      {trailing && (
        <span className="text-subtle absolute right-2.5 flex [&_svg]:size-3.5">{trailing}</span>
      )}
    </div>
  )
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(fieldBase, 'resize-y px-2.5 py-2 text-sm leading-relaxed', className)}
      {...props}
    />
  )
}

/** `<select>` nativo — mais rápido e acessível que um combobox customizado. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        fieldBase,
        'h-8 cursor-pointer appearance-none px-2.5 pr-7 text-sm',
        // Seta desenhada em CSS: evita depender de uma imagem por tema.
        'bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378788c' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
