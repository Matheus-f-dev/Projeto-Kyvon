import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

/**
 * Avatar de pessoa.
 *
 * Sem foto, cai para as iniciais sobre uma cor derivada do nome — sempre a
 * mesma para a mesma pessoa, o que torna os rostos reconhecíveis numa lista
 * mesmo quando ninguém subiu imagem.
 */

const PALETTE = [
  'bg-brand-soft text-brand-text',
  'bg-success-soft text-success-text',
  'bg-warning-soft text-warning-text',
  'bg-danger-soft text-danger-text',
  'bg-info-soft text-info-text',
  'bg-accent-soft text-accent-text',
] as const

function toneFor(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[0]
}

const sizeClasses = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-7 text-2xs',
  lg: 'size-9 text-xs',
  xl: 'size-14 text-base',
} as const

export interface AvatarProps {
  name: string
  src?: string | null
  size?: keyof typeof sizeClasses
  className?: string
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full select-none',
        sizeClasses[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        className={cn('flex size-full items-center justify-center font-semibold', toneFor(name))}
        // Sem atraso: a espera padrão do Radix faz o avatar "piscar" em listas.
        delayMs={0}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

/** Pilha de avatares com excedente resumido. */
export function AvatarStack({
  people,
  max = 3,
  size = 'sm',
}: {
  people: { id: string; name: string; avatarUrl?: string | null }[]
  max?: number
  size?: keyof typeof sizeClasses
}) {
  const visible = people.slice(0, max)
  const overflow = people.length - visible.length

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((person) => (
        <Avatar
          key={person.id}
          name={person.name}
          src={person.avatarUrl}
          size={size}
          className="ring-2 ring-[var(--surface-raised)]"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'bg-neutral-soft text-muted inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-[var(--surface-raised)]',
            sizeClasses[size],
          )}
          title={people
            .slice(max)
            .map((person) => person.name)
            .join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
