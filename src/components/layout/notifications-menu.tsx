'use client'

import * as Popover from '@radix-ui/react-popover'
import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { Tooltip } from '@/components/ui/tooltip'

/**
 * Painel de notificações.
 *
 * Atualiza por polling a cada 60 s, e imediatamente quando a aba volta ao
 * foco. Sem WebSocket na V1: o ganho não justificaria a infraestrutura de
 * conexão persistente para um time do tamanho da Kyvon.
 *
 * Toda notificação leva a um lugar — clicar marca como lida e navega.
 */

const POLL_INTERVAL_MS = 60_000

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
  actor: { id: string; name: string; avatarUrl: string | null } | null
}

export function NotificationsMenu({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(initialUnread)
  const [loaded, setLoaded] = useState(false)

  /**
   * Nenhum `setState` acontece antes do primeiro `await`.
   *
   * Isso é intencional: chamar `load()` de dentro de um efeito com um
   * `setState` síncrono no começo dispara uma renderização em cascata logo na
   * montagem. Com o estado sendo escrito só depois da resposta, o efeito
   * apenas inicia a busca — que é o papel dele.
   */
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      if (!response.ok) return

      const payload = (await response.json()) as {
        items: NotificationItem[]
        unreadCount: number
      }
      setItems(payload.items)
      setUnread(payload.unreadCount)
    } catch {
      // Falha de rede não deve quebrar o cabeçalho — a próxima rodada tenta de novo.
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }

    tick()
    const interval = setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', tick)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  // Abrir o painel é um evento, não sincronização de estado — por isso o
  // refetch vive no handler e não em um efeito sobre `open`.
  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (next) void load()
    },
    [load],
  )

  const markRead = useCallback(
    async (ids: string[]) => {
      // Atualização otimista: o badge responde na hora, o servidor confirma depois.
      setItems((current) =>
        current.map((item) =>
          ids.includes(item.id) && !item.readAt
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      )
      setUnread((current) => Math.max(0, current - ids.length))

      try {
        const response = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        })
        if (response.ok) {
          const payload = (await response.json()) as { unreadCount: number }
          setUnread(payload.unreadCount)
        }
      } catch {
        void load()
      }
    },
    [load],
  )

  const markAll = useCallback(async () => {
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() })),
    )
    setUnread(0)

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch {
      void load()
    }
  }, [load])

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip content="Notificações" disabled={open}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              'relative flex size-8 items-center justify-center rounded-md transition-colors',
              'text-muted hover:bg-hover hover:text-strong',
              open && 'bg-hover text-strong',
            )}
            aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'}
          >
            <Bell className="size-4" />
            {unread > 0 && (
              <span
                className="bg-danger absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
                data-tabular
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            'border-line z-50 flex w-[22rem] flex-col overflow-hidden rounded-lg border',
            'bg-overlay animate-[var(--animate-slide-up)] shadow-[var(--shadow-overlay)]',
          )}
        >
          <header className="border-line flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-strong text-xs font-semibold">Notificações</h3>
            {unread > 0 && (
              <Button variant="ghost" size="xs" icon={<CheckCheck />} onClick={markAll}>
                Marcar todas
              </Button>
            )}
          </header>

          <div className="max-h-[22rem] overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState
                compact
                icon={<Bell />}
                title={loaded ? 'Nada por aqui' : 'Carregando…'}
                description={
                  loaded ? 'Você será avisado quando algo precisar da sua atenção.' : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--line-subtle)]">
                {items.map((item) => {
                  const unreadItem = !item.readAt

                  const content = (
                    <div
                      className={cn(
                        'flex gap-2.5 px-3 py-2.5 transition-colors',
                        item.link && 'hover:bg-hover cursor-pointer',
                        unreadItem && 'bg-brand-soft/40',
                      )}
                    >
                      {item.actor ? (
                        <Avatar
                          name={item.actor.name}
                          src={item.actor.avatarUrl}
                          size="sm"
                          className="mt-0.5"
                        />
                      ) : (
                        <span className="bg-neutral-soft text-subtle mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                          <Bell className="size-3" />
                        </span>
                      )}

                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="text-strong text-xs leading-snug font-medium">{item.title}</p>
                        {item.body && (
                          <p className="text-2xs text-muted line-clamp-2 leading-relaxed">
                            {item.body}
                          </p>
                        )}
                        <span className="text-2xs text-subtle">
                          {formatRelative(item.createdAt)}
                        </span>
                      </div>

                      {unreadItem && (
                        <span
                          className="bg-brand mt-1.5 size-1.5 shrink-0 rounded-full"
                          aria-label="Não lida"
                        />
                      )}
                    </div>
                  )

                  return (
                    <li key={item.id}>
                      {item.link ? (
                        <Link
                          href={item.link}
                          onClick={() => {
                            setOpen(false)
                            if (unreadItem) void markRead([item.id])
                          }}
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => unreadItem && void markRead([item.id])}
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
