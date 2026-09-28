'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { Button } from './button'

/**
 * Diálogo modal.
 *
 * Reservado para o que **exige** decisão antes de continuar: confirmação
 * destrutiva e formulário curto de criação. Ver um registro abre drawer, não
 * modal — modal interrompe, drawer acompanha.
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-[oklch(0.15_0.01_265_/_0.5)] backdrop-blur-[2px]',
        'data-[state=open]:animate-[var(--animate-fade-in)]',
        className,
      )}
      {...props}
    />
  )
}

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  size?: 'sm' | 'md' | 'lg'
  /** Oculta o X do canto — use quando a decisão for obrigatória. */
  hideClose?: boolean
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

export function DialogContent({
  className,
  children,
  size = 'md',
  hideClose = false,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'border-line flex max-h-[85vh] flex-col overflow-hidden rounded-xl border',
          'bg-raised shadow-[var(--shadow-overlay)]',
          'data-[state=open]:animate-[var(--animate-slide-up)]',
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              className="absolute top-3 right-3"
              aria-label="Fechar"
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({
  title,
  description,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('border-line flex flex-col gap-1 border-b px-5 py-4 pr-12', className)}>
      <DialogPrimitive.Title className="text-strong text-base font-semibold">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="text-muted text-xs">
          {description}
        </DialogPrimitive.Description>
      ) : (
        // O Radix avisa no console quando não há descrição; declarar a ausência
        // é explícito e evita ruído em desenvolvimento.
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
      )}
    </header>
  )
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'border-line bg-sunken flex items-center justify-end gap-2 border-t px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}
