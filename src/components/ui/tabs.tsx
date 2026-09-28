'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/**
 * Abas.
 *
 * Sublinhado em vez de pílula: ocupa menos altura e não compete com os botões
 * de ação da página.
 */

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('border-line flex items-center gap-1 border-b', className)}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  count,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2',
        'text-muted text-sm font-medium transition-colors',
        'hover:text-strong',
        'data-[state=active]:border-brand data-[state=active]:text-strong',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className="bg-neutral-soft text-2xs text-muted rounded px-1 font-semibold"
          data-tabular
        >
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn('focus-visible:outline-none', className)} {...props} />
  )
}
