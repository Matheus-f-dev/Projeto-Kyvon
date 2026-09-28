import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Botão.
 *
 * Uma tela tem no máximo uma ação `primary`. As demais são `secondary` ou
 * `ghost` — é o contraste que comunica a hierarquia, não o tamanho nem a cor.
 */

const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5',
    'rounded-md font-medium whitespace-nowrap',
    'transition-[background-color,border-color,color,box-shadow] duration-100',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-active',
        secondary:
          'border border-line bg-raised text-strong shadow-[var(--shadow-raised)] hover:bg-hover active:bg-active',
        ghost: 'text-muted hover:bg-hover hover:text-strong active:bg-active',
        subtle: 'bg-neutral-soft text-default hover:bg-active',
        danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
        'danger-ghost': 'text-danger-text hover:bg-danger-soft',
        link: 'text-brand-text underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 px-2 text-2xs gap-1 [&_svg:not([class*=size-])]:size-3',
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-sm',
      },
      iconOnly: {
        true: 'px-0 aspect-square',
        false: '',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md', iconOnly: false },
  },
)

export interface ButtonProps
  extends Omit<ComponentProps<'button'>, 'prefix'>, VariantProps<typeof buttonVariants> {
  /** Renderiza no elemento filho (ex.: um `<Link>`), preservando o estilo. */
  asChild?: boolean
  /** Mostra spinner e desabilita. */
  loading?: boolean
  icon?: ReactNode
  trailingIcon?: ReactNode
}

export function Button({
  className,
  variant,
  size,
  iconOnly,
  asChild = false,
  loading = false,
  icon,
  trailingIcon,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button'

  // Com `asChild` o filho é quem renderiza — injetar spinner e ícones aqui
  // quebraria a expectativa de filho único do Slot.
  if (asChild) {
    return (
      <Component className={cn(buttonVariants({ variant, size, iconOnly }), className)} {...props}>
        {children}
      </Component>
    )
  }

  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, iconOnly }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && trailingIcon}
    </button>
  )
}

export { buttonVariants }
