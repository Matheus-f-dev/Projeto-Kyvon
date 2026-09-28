'use client'

import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { Input } from '@/components/ui/input'

/**
 * Barra de filtro das listagens.
 *
 * O estado mora na URL — não em `useState` local — para que o filtro
 * sobreviva a um F5, seja compartilhável por link e não se perca ao voltar da
 * página de detalhe. Debounce de 300ms antes de tocar no histórico: digitar
 * "aurora" não deve gerar seis navegações.
 */

const DEBOUNCE_MS = 300

export function ListSearchInput({
  paramKey = 'q',
  placeholder = 'Buscar…',
  className,
}: {
  paramKey?: string
  placeholder?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paramValue = searchParams.get(paramKey) ?? ''

  const [value, setValue] = useState(paramValue)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * A URL é a fonte de verdade; se ela mudar por fora (voltar no navegador),
   * o campo acompanha.
   *
   * Ajustado durante a renderização, não em um `useEffect`: é o padrão que o
   * próprio React recomenda para "adequar estado a uma mudança externa" — evita
   * o passo extra de commit-then-effect-then-rerender que um efeito exigiria.
   */
  const [trackedParamValue, setTrackedParamValue] = useState(paramValue)
  if (paramValue !== trackedParamValue) {
    setTrackedParamValue(paramValue)
    setValue(paramValue)
  }

  const onChange = (next: string) => {
    setValue(next)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (next.trim()) params.set(paramKey, next)
      else params.delete(paramKey)
      params.delete('page')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, DEBOUNCE_MS)
  }

  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      leading={<Search />}
      trailing={
        value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-subtle hover:text-default pointer-events-auto"
            aria-label="Limpar busca"
          >
            <X />
          </button>
        ) : undefined
      }
      className={cn('w-full sm:w-64', className)}
    />
  )
}

/** Select nativo sincronizado com um parâmetro da URL. */
export function ListFilterSelect({
  paramKey,
  options,
  placeholder = 'Todos',
  className,
}: {
  paramKey: string
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get(paramKey) ?? ''

  const onChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set(paramKey, next)
    else params.delete(paramKey)
    params.delete('page')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <select
      value={current}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'border-line bg-raised text-strong h-8 cursor-pointer appearance-none rounded-md border px-2.5 pr-7 text-sm',
        'hover:border-line-strong transition-colors',
        'bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378788c' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        'focus:border-brand focus:ring-brand/20 focus:ring-2 focus:outline-none',
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function ListToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

/** Paginação simples de "anterior/próximo" — suficiente para listas administrativas. */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const goTo = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(nextPage))
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="border-line text-muted flex items-center justify-between border-t px-4 py-2.5 text-xs">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          className="hover:bg-hover rounded px-2 py-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="px-1" data-tabular>
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
          className="hover:bg-hover rounded px-2 py-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          Próximo
        </button>
      </div>
    </div>
  )
}
