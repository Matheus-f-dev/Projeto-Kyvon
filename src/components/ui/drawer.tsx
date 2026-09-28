'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { Button } from './button'

/**
 * Drawer lateral.
 *
 * Forma padrão de ver um registro (tarefa, aprovação, chamado). Mantém a lista
 * visível atrás, então a pessoa não perde o contexto nem a posição de rolagem —
 * é a diferença entre revisar dez tarefas e navegar dez vezes.
 *
 * Construído sobre o Dialog do Radix, que já resolve foco preso, `Esc` e
 * restauração de foco ao fechar.
 */

export const Drawer = DialogPrimitive.Root
export const DrawerTrigger = DialogPrimitive.Trigger
export const DrawerClose = DialogPrimitive.Close

const widthClasses = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
} as const

export interface DrawerContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  size?: keyof typeof widthClasses
}

export function DrawerContent({ className, children, size = 'md', ...props }: DrawerContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-[oklch(0.15_0.01_265_/_0.4)]',
          'data-[state=open]:animate-[var(--animate-fade-in)]',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'border-line fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l',
          'bg-base shadow-[var(--shadow-overlay)]',
          'data-[state=open]:animate-[var(--animate-slide-left)]',
          widthClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DrawerHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Linha de metadados acima do título — código, cliente, projeto. */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn('border-line flex shrink-0 flex-col gap-2 border-b px-5 py-4', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {meta && <div className="text-2xs text-muted flex items-center gap-2">{meta}</div>}
          <DialogPrimitive.Title className="text-strong text-base leading-snug font-semibold">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-muted text-xs">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="sm" iconOnly aria-label="Fechar">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
      </div>
    </header>
  )
}

export function DrawerBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex-1 overflow-y-auto', className)} {...props} />
}

export function DrawerFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'border-line bg-sunken flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}
