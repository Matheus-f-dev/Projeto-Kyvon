import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/**
 * Tabela de dados.
 *
 * Densa de propósito: linhas de 36px, 13px de texto, sem listras zebradas e
 * sem borda vertical. O olho segue a coluna pelo alinhamento, não por uma
 * grade desenhada — é o que permite ler 25 projetos sem cansaço.
 *
 * O contêiner rola na horizontal sozinho, de modo que a página nunca ganhe
 * rolagem lateral por causa de uma tabela larga.
 */

export function TableContainer({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('border-line [&_th]:bg-raised border-b [&_th]:sticky [&_th]:top-0', className)}
      {...props}
    />
  )
}

export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TR({
  className,
  interactive = false,
  ...props
}: ComponentProps<'tr'> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--line-subtle)]',
        interactive && 'hover:bg-hover cursor-pointer transition-colors',
        className,
      )}
      {...props}
    />
  )
}

export function TH({
  className,
  align = 'left',
  ...props
}: ComponentProps<'th'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        'text-2xs text-muted px-3 py-2 font-semibold tracking-wide whitespace-nowrap uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...props}
    />
  )
}

export function TD({
  className,
  align = 'left',
  ...props
}: ComponentProps<'td'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'text-default px-3 py-2 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  )
}

/** Célula principal da linha: nome + metadado abaixo, truncando com elegância. */
export function TDPrimary({
  title,
  subtitle,
  leading,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  leading?: React.ReactNode
  className?: string
}) {
  return (
    <td className={cn('max-w-0 px-3 py-2', className)}>
      <div className="flex items-center gap-2.5">
        {leading}
        <div className="flex min-w-0 flex-col">
          <span className="text-strong truncate font-medium">{title}</span>
          {subtitle && <span className="text-2xs text-muted truncate">{subtitle}</span>}
        </div>
      </div>
    </td>
  )
}
