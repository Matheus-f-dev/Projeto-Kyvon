'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Check, Minus } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** Caixa de seleção e chave liga/desliga. */

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer border-line-strong flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
        'bg-raised transition-colors',
        'hover:border-brand',
        'data-[state=checked]:border-brand data-[state=checked]:bg-brand',
        'data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex text-[var(--on-brand)]">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

/** Checkbox com rótulo clicável. */
export function CheckboxField({
  label,
  description,
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root> & {
  label: ReactNode
  description?: ReactNode
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <Checkbox className="mt-0.5" {...props} />
      <span className="flex flex-col gap-0.5">
        <span className="text-default text-sm">{label}</span>
        {description && <span className="text-2xs text-muted">{description}</span>}
      </span>
    </label>
  )
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full',
        'border border-transparent bg-[var(--line-strong)] transition-colors',
        'data-[state=checked]:bg-brand',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-3.5 rounded-full bg-white shadow-sm ring-0',
          'transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-0.5',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
