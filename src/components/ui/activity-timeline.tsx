import { CircleSlash } from 'lucide-react'

import { formatRelative } from '@/lib/format'

import { Avatar } from './avatar'
import { EmptyState } from './states'

/**
 * Timeline de atividade — reutilizada na página de cliente, projeto, contrato
 * e no dashboard. Mesma leitura em todo lugar: quem fez o quê, e há quanto tempo.
 */

export interface ActivityTimelineItem {
  id: string
  summary: string
  createdAt: Date | string
  actor: { id: string; name: string; avatarUrl: string | null } | null
}

export function ActivityTimeline({ items }: { items: ActivityTimelineItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        title="Nada registrado ainda"
        description="As mudanças relevantes aparecem aqui à medida que acontecem."
      />
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-[var(--line-subtle)]">
      {items.map((item) => (
        <li key={item.id} className="flex gap-2.5 px-4 py-2.5">
          {item.actor ? (
            <Avatar
              name={item.actor.name}
              src={item.actor.avatarUrl}
              size="sm"
              className="mt-0.5"
            />
          ) : (
            <span className="bg-neutral-soft text-subtle mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
              <CircleSlash className="size-3" />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-default text-xs leading-snug">
              <span className="text-strong font-medium">{item.actor?.name ?? 'Sistema'}</span>{' '}
              {item.summary}
            </p>
            <span className="text-2xs text-subtle">{formatRelative(item.createdAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
