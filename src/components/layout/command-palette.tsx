'use client'

import { Command } from 'cmdk'
import {
  Briefcase,
  CheckSquare,
  FileText,
  FolderKanban,
  GitPullRequestArrow,
  Headphones,
  Loader2,
  Megaphone,
  Search,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { Kbd } from '@/components/ui/misc'
import type { PermissionKey } from '@/shared/permissions'

import { onOpenCommandPalette } from './command-palette-events'
import { NAVIGATION } from './navigation'

/**
 * Busca e comandos — Ctrl+K.
 *
 * Um único campo faz as duas coisas: sem texto, oferece criar e navegar; com
 * texto, busca no sistema inteiro. Separar em duas caixas obrigaria a pessoa a
 * decidir antes de digitar o que ela só sabe depois.
 *
 * A busca só dispara a partir de 2 caracteres e com 250 ms de debounce —
 * digitar "projeto" não vira sete requisições.
 */

const DEBOUNCE_MS = 250
const MIN_QUERY = 2

interface SearchResult {
  entity: string
  id: string
  code: string | null
  title: string
  subtitle: string | null
  href: string
}

interface SearchGroup {
  entity: string
  label: string
  results: SearchResult[]
}

const ENTITY_ICON: Record<string, typeof Briefcase> = {
  client: Briefcase,
  project: FolderKanban,
  task: CheckSquare,
  opportunity: Target,
  contract: FileText,
  support_ticket: Headphones,
  marketing_content: Megaphone,
  approval: ShieldCheck,
  scope_change: GitPullRequestArrow,
}

interface QuickAction {
  id: string
  label: string
  href: string
  icon: typeof Briefcase
  permission?: PermissionKey
  keywords: string[]
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'new-client',
    label: 'Criar cliente',
    href: '/clientes?novo=1',
    icon: Briefcase,
    permission: 'clients.write',
    keywords: ['cliente', 'empresa', 'novo'],
  },
  {
    id: 'new-opportunity',
    label: 'Criar oportunidade',
    href: '/comercial?nova=1',
    icon: Target,
    permission: 'crm.write',
    keywords: ['oportunidade', 'negociacao', 'pipeline', 'venda'],
  },
  {
    id: 'new-project',
    label: 'Criar projeto',
    href: '/projetos?novo=1',
    icon: FolderKanban,
    permission: 'projects.write',
    keywords: ['projeto', 'novo'],
  },
  {
    id: 'new-task',
    label: 'Criar tarefa',
    href: '/tarefas?nova=1',
    icon: CheckSquare,
    permission: 'tasks.write',
    keywords: ['tarefa', 'atividade', 'nova'],
  },
  {
    id: 'new-approval',
    label: 'Pedir aprovação',
    href: '/aprovacoes?nova=1',
    icon: ShieldCheck,
    permission: 'approvals.write',
    keywords: ['aprovacao', 'aprovar', 'material', 'validar'],
  },
  {
    id: 'new-ticket',
    label: 'Abrir chamado',
    href: '/suporte?novo=1',
    icon: Headphones,
    permission: 'support.write',
    keywords: ['chamado', 'suporte', 'ticket'],
  },
  {
    id: 'new-content',
    label: 'Criar conteúdo',
    href: '/marketing?novo=1',
    icon: Megaphone,
    permission: 'marketing.write',
    keywords: ['conteudo', 'post', 'marketing'],
  },
]

export function CommandPalette({ permissions }: { permissions: PermissionKey[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  /**
   * Guardado junto com o termo que o produziu.
   *
   * Isso torna "carregando" e "resultados válidos" derivados da renderização,
   * em vez de estados sincronizados por efeito — que é o que gera renderização
   * em cascata e o piscar de resultado velho enquanto o novo não chega.
   */
  const [result, setResult] = useState<{ query: string; groups: SearchGroup[] }>({
    query: '',
    groups: [],
  })

  const permissionSet = useMemo(() => new Set(permissions), [permissions])
  const can = useCallback(
    (permission: PermissionKey) => permissionSet.has(permission),
    [permissionSet],
  )

  // Cancela a requisição anterior quando uma nova tecla chega: sem isso, uma
  // resposta lenta pode sobrescrever o resultado de uma busca mais recente.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const unsubscribe = onOpenCommandPalette(() => setOpen(true))

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      unsubscribe()
    }
  }, [])

  const trimmed = query.trim()
  const searching = trimmed.length >= MIN_QUERY
  const groups = result.query === trimmed ? result.groups : []
  const loading = searching && result.query !== trimmed

  useEffect(() => {
    if (!searching) return

    const timeout = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Busca indisponível')

        const payload = (await response.json()) as { groups: SearchGroup[] }
        setResult({ query: trimmed, groups: payload.groups })
      } catch (error) {
        // Requisição abortada foi substituída por outra mais recente: manter o
        // estado como está deixa o indicador de carregamento ligado, correto.
        if ((error as Error).name !== 'AbortError') setResult({ query: trimmed, groups: [] })
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [trimmed, searching])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery('')
      router.push(href)
    },
    [router],
  )

  const navItems = useMemo(
    () =>
      NAVIGATION.flatMap((section) => section.items).filter(
        (item) => !item.permissions || item.permissions.some(can),
      ),
    [can],
  )

  const actions = useMemo(
    () => QUICK_ACTIONS.filter((action) => !action.permission || can(action.permission)),
    [can],
  )

  const hasResults = groups.some((group) => group.results.length > 0)

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Busca e comandos"
      shouldFilter={!searching}
      className={cn(
        'fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2',
        'border-line bg-overlay overflow-hidden rounded-xl border shadow-[var(--shadow-overlay)]',
        'animate-[var(--animate-slide-up)]',
      )}
      overlayClassName="fixed inset-0 z-50 bg-[oklch(0.15_0.01_265_/_0.45)] backdrop-blur-[2px]"
    >
      <div className="border-line flex items-center gap-2.5 border-b px-3.5">
        {loading ? (
          <Loader2 className="text-subtle size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Search className="text-subtle size-4 shrink-0" aria-hidden />
        )}
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Buscar ou executar um comando…"
          className="text-strong placeholder:text-subtle h-11 flex-1 bg-transparent text-sm outline-none"
        />
        <Kbd>esc</Kbd>
      </div>

      <Command.List className="max-h-[54vh] overflow-y-auto overscroll-contain p-1.5">
        <Command.Empty className="text-muted px-3 py-10 text-center text-xs">
          {searching
            ? loading
              ? 'Buscando…'
              : `Nada encontrado para "${query.trim()}".`
            : 'Digite para buscar.'}
        </Command.Empty>

        {searching &&
          hasResults &&
          groups.map((group) => (
            <Command.Group
              key={group.entity}
              heading={group.label}
              className="[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
            >
              {group.results.map((result) => {
                const Icon = ENTITY_ICON[result.entity] ?? FolderKanban

                return (
                  <Item key={result.id} onSelect={() => go(result.href)}>
                    <Icon className="text-subtle size-3.5 shrink-0" />
                    <span className="text-strong flex-1 truncate">{result.title}</span>
                    {result.subtitle && (
                      <span className="text-2xs text-muted max-w-[40%] truncate">
                        {result.subtitle}
                      </span>
                    )}
                    {result.code && (
                      <span className="text-2xs text-subtle shrink-0 font-mono">{result.code}</span>
                    )}
                  </Item>
                )
              })}
            </Command.Group>
          ))}

        {!searching && (
          <>
            {actions.length > 0 && (
              <Command.Group
                heading="Criar"
                className="[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
              >
                {actions.map((action) => {
                  const Icon = action.icon
                  return (
                    <Item
                      key={action.id}
                      value={`${action.label} ${action.keywords.join(' ')}`}
                      onSelect={() => go(action.href)}
                    >
                      <Icon className="text-subtle size-3.5 shrink-0" />
                      <span className="text-strong flex-1">{action.label}</span>
                    </Item>
                  )
                })}
              </Command.Group>
            )}

            <Command.Group
              heading="Ir para"
              className="[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
            >
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Item key={item.href} onSelect={() => go(item.href)}>
                    <Icon className="text-subtle size-3.5 shrink-0" />
                    <span className="text-strong flex-1">{item.label}</span>
                    {item.shortcut && (
                      <span className="flex gap-0.5">
                        {item.shortcut.split(' ').map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </span>
                    )}
                  </Item>
                )
              })}
            </Command.Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  )
}

function Item({
  children,
  onSelect,
  value,
}: {
  children: React.ReactNode
  onSelect: () => void
  value?: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm',
        'data-[selected=true]:bg-hover',
      )}
    >
      {children}
    </Command.Item>
  )
}
