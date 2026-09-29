import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'

import {
  ListDateInput,
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { SectionHeader } from '@/components/layout/page'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDateTime } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { listAuditLogs } from '@/server/modules/admin/queries'
import { listUserOptions } from '@/server/modules/users/queries'
import { AUDIT_ACTION, ENTITY_TYPE_LABEL } from '@/shared/domain'
import { auditFilterSchema } from '@/shared/schemas/admin'

export const metadata: Metadata = { title: 'Auditoria' }
export const dynamic = 'force-dynamic'

/**
 * Log de auditoria. Somente leitura: não há ação de editar ou apagar um
 * registro em lugar nenhum do sistema.
 */
export default async function SettingsAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  if (!context.can('audit.read')) return <NoPermissionState permission="audit.read" />

  const params = await searchParams
  // Parâmetro inválido na URL vira "sem filtro", nunca erro de página.
  const parsed = auditFilterSchema.safeParse(params)
  const filter = parsed.success ? parsed.data : {}

  const [result, users] = await Promise.all([listAuditLogs(filter), listUserOptions()])
  const hasFilters = Boolean(
    filter.q || filter.action || filter.entityType || filter.actorId || filter.from || filter.to,
  )

  return (
    <>
      <SectionHeader
        title="Auditoria"
        description="Quem mudou o quê, quando e de onde. Os registros não podem ser alterados."
      />

      <Panel>
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar registro ou e-mail…" />
            <ListFilterSelect
              paramKey="action"
              placeholder="Todas as ações"
              options={Object.entries(AUDIT_ACTION).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
            />
            <ListFilterSelect
              paramKey="entityType"
              placeholder="Todas as entidades"
              options={Object.entries(ENTITY_TYPE_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <ListFilterSelect
              paramKey="actorId"
              placeholder="Todas as pessoas"
              options={users.map((user) => ({ value: user.id, label: user.name }))}
            />
            <ListDateInput paramKey="from" label="De" />
            <ListDateInput paramKey="to" label="Até" />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={filter.q} />
          ) : (
            <EmptyState
              icon={<ScrollText />}
              title="Nenhum registro ainda"
              description="Toda criação, alteração, login e mudança de permissão aparece aqui."
            />
          )
        ) : (
          <>
            <ul className="divide-y divide-[var(--line-subtle)]">
              {result.items.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5">
                  <AuditEntry entry={entry} />
                </li>
              ))}
            </ul>
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </Panel>
    </>
  )
}

type Entry = Awaited<ReturnType<typeof listAuditLogs>>['items'][number]

function AuditEntry({ entry }: { entry: Entry }) {
  const changes = normalizeChanges(entry.changes)

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusBadge
        map={AUDIT_ACTION}
        value={entry.action as keyof typeof AUDIT_ACTION}
        dot={false}
      />
      <span className="text-strong min-w-0 flex-1 truncate text-sm">
        <span className="text-muted">
          {ENTITY_TYPE_LABEL[entry.entityType] ?? entry.entityType}
        </span>
        {entry.entityLabel && <> · {entry.entityLabel}</>}
      </span>
      <span className="text-2xs text-muted">
        {entry.actorName ?? entry.actorEmail ?? 'Sistema'}
        {entry.ipAddress && <span className="text-subtle"> · {entry.ipAddress}</span>}
      </span>
      <time
        className="text-2xs text-subtle w-32 text-right"
        dateTime={entry.createdAt.toISOString()}
        data-tabular
      >
        {formatDateTime(entry.createdAt)}
      </time>
    </div>
  )

  if (changes.length === 0) return header

  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {header}
        <span className="text-2xs text-brand-text mt-1 inline-block group-open:hidden">
          Ver {changes.length} {changes.length === 1 ? 'campo alterado' : 'campos alterados'}
        </span>
      </summary>
      <dl className="bg-sunken mt-2 grid gap-1.5 rounded-md px-3 py-2">
        {changes.map((change) => (
          <div key={change.field} className="grid gap-1 text-xs sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted font-mono">{change.field}</dt>
            <dd className="flex flex-wrap items-center gap-1.5 break-all">
              <span className="text-danger-text line-through">{formatValue(change.from)}</span>
              <span className="text-subtle">→</span>
              <span className="text-success-text">{formatValue(change.to)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/** `changes` é `{ campo: { from, to } }` (ver `diffChanges`); qualquer outra forma é ignorada. */
function normalizeChanges(value: unknown): { field: string; from: unknown; to: unknown }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([field, change]) =>
    change && typeof change === 'object' && ('from' in change || 'to' in change)
      ? [{ field, from: (change as { from?: unknown }).from, to: (change as { to?: unknown }).to }]
      : [],
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ')
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
