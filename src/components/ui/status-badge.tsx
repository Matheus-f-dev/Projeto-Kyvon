import { statusMeta, type StatusMeta } from '@/shared/domain'

import { Badge, type BadgeProps } from './badge'

/**
 * Selo de status ligado ao mapa de domínio.
 *
 * Evita a repetição de `PROJECT_STATUS[status].label` + `tone` em toda tela e
 * garante que um valor desconhecido apareça como texto neutro em vez de
 * quebrar a renderização.
 */
export function StatusBadge<T extends string>({
  map,
  value,
  dot = true,
  ...props
}: Omit<BadgeProps, 'tone' | 'children'> & {
  map: Record<T, StatusMeta>
  value: T | null | undefined
}) {
  const meta = statusMeta(map, value)

  return (
    <Badge tone={meta.tone} dot={dot} title={meta.hint} {...props}>
      {meta.label}
    </Badge>
  )
}
