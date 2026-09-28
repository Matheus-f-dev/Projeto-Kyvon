'use client'

import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * Seletor pesquisável assíncrono.
 *
 * Para listas que podem crescer além de algumas dezenas de linhas (clientes,
 * contratos), um `<select>` nativo violaria o requisito de nunca carregar
 * "milhares de registros de uma vez" (item 32 do produto). Este componente
 * busca no servidor com debounce, e nunca segura mais do que a página atual
 * de resultados.
 *
 * Participa de formulário nativo via `<input type="hidden">` — não depende de
 * JavaScript no submit, só na experiência de busca.
 */

export interface ComboboxOption {
  id: string
  label: string
  sublabel?: string
}

export interface ComboboxProps {
  name: string
  endpoint: string
  placeholder?: string
  emptyMessage?: string
  defaultValue?: ComboboxOption
  required?: boolean
  disabled?: boolean
  className?: string
  onSelect?: (option: ComboboxOption | null) => void
}

const DEBOUNCE_MS = 250

export function Combobox({
  name,
  endpoint,
  placeholder = 'Buscar…',
  emptyMessage = 'Nada encontrado.',
  defaultValue,
  required,
  disabled,
  className,
  onSelect,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ComboboxOption[]>(defaultValue ? [defaultValue] : [])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ComboboxOption | null>(defaultValue ?? null)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(
    async (term: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const payload = (await response.json()) as { options: ComboboxOption[] }
        setOptions(payload.options)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setOptions([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [endpoint],
  )

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => void search(query), DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [open, query, search])

  const handleSelect = (option: ComboboxOption) => {
    setSelected(option)
    setOpen(false)
    setQuery('')
    onSelect?.(option)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={selected?.id ?? ''} required={required} />

      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'border-line bg-raised flex h-8 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-sm',
            'hover:border-line-strong transition-colors',
            'focus:border-brand focus:ring-brand/20 focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-subtle',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="text-subtle size-3.5 shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            'border-line z-50 w-[--radix-popover-trigger-width] overflow-hidden rounded-lg border',
            'bg-overlay animate-[var(--animate-slide-up)] shadow-[var(--shadow-overlay)]',
          )}
        >
          <Command shouldFilter={false}>
            <div className="border-line flex items-center gap-2 border-b px-2.5">
              {loading ? (
                <Loader2 className="text-subtle size-3.5 shrink-0 animate-spin" />
              ) : (
                <Search className="text-subtle size-3.5 shrink-0" />
              )}
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
                className="text-strong placeholder:text-subtle h-9 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <Command.List className="max-h-56 overflow-y-auto p-1">
              <Command.Empty className="text-muted px-3 py-6 text-center text-xs">
                {loading ? 'Buscando…' : emptyMessage}
              </Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.id}
                  value={option.id}
                  onSelect={() => handleSelect(option)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    'data-[selected=true]:bg-hover',
                  )}
                >
                  <Check
                    className={cn(
                      'text-brand size-3.5 shrink-0',
                      selected?.id === option.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-strong truncate">{option.label}</span>
                    {option.sublabel && (
                      <span className="text-2xs text-muted truncate">{option.sublabel}</span>
                    )}
                  </span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
