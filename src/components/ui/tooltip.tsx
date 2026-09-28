'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Tooltip.
 *
 * Só para complementar — nunca para carregar informação que não exista em
 * outro lugar: tooltip não abre em toque e não é lida por todo leitor de tela.
 */

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Atalho de teclado exibido à direita do texto. */
  shortcut?: string
  disabled?: boolean
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  shortcut,
  disabled = false,
}: TooltipProps) {
  if (disabled) return <>{children}</>

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            'text-2xs z-50 flex items-center gap-2 rounded-md px-2 py-1',
            'bg-[var(--text-strong)] text-[var(--text-inverted)]',
            'shadow-[var(--shadow-overlay)]',
            'animate-[var(--animate-fade-in)]',
            'data-[state=closed]:animate-none data-[state=closed]:opacity-0',
          )}
        >
          {content}
          {shortcut && (
            <kbd className="rounded border border-white/20 px-1 font-mono text-[10px] opacity-70">
              {shortcut}
            </kbd>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
