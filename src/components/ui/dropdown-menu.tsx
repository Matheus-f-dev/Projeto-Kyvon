'use client'

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/** Menu de ações. Re-exporta as partes do Radix já estilizadas. */

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuGroup = DropdownPrimitive.Group
export const DropdownMenuSub = DropdownPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'border-line z-50 min-w-[11rem] overflow-hidden rounded-lg border p-1',
          'bg-overlay shadow-[var(--shadow-overlay)]',
          'animate-[var(--animate-slide-up)]',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
}

const itemBase = [
  'relative flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm',
  'text-default outline-none',
  'focus:bg-hover focus:text-strong',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
  '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-subtle',
  'focus:[&_svg]:text-muted',
].join(' ')

export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        itemBase,
        destructive &&
          'text-danger-text focus:bg-danger-soft focus:text-danger-text [&_svg]:text-danger-text',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  )
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownPrimitive.RadioItem>) {
  return (
    <DropdownPrimitive.RadioItem className={cn(itemBase, 'pl-7', className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <span className="bg-brand size-1.5 rounded-full" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.RadioItem>
  )
}

export function DropdownMenuSubTrigger({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.SubTrigger>) {
  return <DropdownPrimitive.SubTrigger className={cn(itemBase, className)} {...props} />
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.SubContent>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.SubContent
        className={cn(
          'border-line z-50 min-w-[10rem] overflow-hidden rounded-lg border p-1',
          'bg-overlay animate-[var(--animate-slide-up)] shadow-[var(--shadow-overlay)]',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn(
        'text-2xs text-subtle px-2 py-1.5 font-semibold tracking-wide uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Separator>) {
  return (
    <DropdownPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-[var(--line-subtle)]', className)}
      {...props}
    />
  )
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-2xs text-subtle ml-auto font-mono tracking-wider', className)}
      {...props}
    />
  )
}
