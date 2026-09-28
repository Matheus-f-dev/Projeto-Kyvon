'use client'

import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { FileList } from '@/components/files/file-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@/components/ui/drawer'
import { useCloseDrawerHref } from '@/components/ui/drawer-link'
import { DetailItem, DetailList, EntityCode } from '@/components/ui/misc'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatDeadline, formatRelative } from '@/lib/format'
import { deleteContentAction } from '@/server/modules/marketing/actions'
import type { ContentDetail } from '@/server/modules/marketing/queries'
import { dateToLocalDateTime } from '@/shared/dates'
import { CONTENT_CHANNEL, CONTENT_FORMAT, CONTENT_STATUS } from '@/shared/domain'

import { ContentFormDialog } from './content-form-dialog'
import { ContentMoveMenu } from './content-move'

/**
 * Drawer do conteúdo: o que é, em que pé está e o que falta. Publicado vira
 * somente leitura, com o link do que foi ao ar.
 */
export function ContentDrawer({
  content,
  campaigns,
  owners,
  permissions,
}: {
  content: ContentDetail
  campaigns: { id: string; name: string }[]
  owners: { id: string; name: string }[]
  permissions: { canWrite: boolean; canPublish: boolean }
}) {
  const router = useRouter()
  const closeHref = useCloseDrawerHref('conteudo')
  const published = content.status === 'published'
  const canWrite = permissions.canWrite && !published

  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="lg">
        <DrawerHeader
          meta={
            <>
              <EntityCode code={content.code} />
              {content.campaign && (
                <>
                  <span>·</span>
                  <span>{content.campaign.name}</span>
                </>
              )}
            </>
          }
          title={content.title}
          actions={
            canWrite && (
              <>
                <ContentFormDialog
                  campaigns={campaigns}
                  owners={owners}
                  defaultValues={{
                    id: content.id,
                    title: content.title,
                    format: content.format,
                    channel: content.channel,
                    campaignId: content.campaign?.id,
                    ownerId: content.owner?.id,
                    dueDate: content.dueDate ?? undefined,
                    briefing: content.briefing ?? undefined,
                    copy: content.copy ?? undefined,
                    referencesNotes: content.referencesNotes ?? undefined,
                  }}
                  trigger={
                    <Button variant="ghost" size="sm" icon={<Pencil />}>
                      Editar
                    </Button>
                  }
                />
                {content.status === 'idea' && (
                  <ConfirmButton
                    label="Descartar"
                    icon={<Trash2 />}
                    variant="danger-ghost"
                    title="Descartar ideia"
                    description="A ideia é removida. Fica registrado na auditoria quem descartou."
                    confirmLabel="Descartar"
                    action={() => deleteContentAction(content.id)}
                    onSuccess={() => router.push(closeHref, { scroll: false })}
                  />
                )}
              </>
            )
          }
        />

        <DrawerBody className="flex flex-col gap-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={CONTENT_STATUS} value={content.status} size="md" />
            <Badge tone={CONTENT_CHANNEL[content.channel].tone} size="sm">
              {CONTENT_CHANNEL[content.channel].label}
            </Badge>
            <Badge tone="neutral" size="sm">
              {CONTENT_FORMAT[content.format].label}
            </Badge>
            {canWrite && (
              <span className="ml-auto">
                <ContentMoveMenu
                  contentId={content.id}
                  status={content.status}
                  canPublish={permissions.canPublish}
                  scheduledValue={
                    content.scheduledAt ? dateToLocalDateTime(content.scheduledAt) : undefined
                  }
                  variant="button"
                />
              </span>
            )}
          </div>

          {published && content.publishedUrl && (
            <a
              href={content.publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-success-border bg-success-soft text-success-text flex items-center gap-2 rounded-lg border px-4 py-3 text-sm hover:underline"
            >
              <ExternalLink className="size-4" />
              No ar desde {content.publishedAt ? formatDateTime(content.publishedAt) : '—'}
            </a>
          )}

          <DetailList>
            <DetailItem label="Responsável">{content.owner?.name ?? '—'}</DetailItem>
            <DetailItem label="Pronto até">
              <span className={cn(content.late && 'text-danger-text font-medium')}>
                {content.dueDate
                  ? `${formatDate(content.dueDate)} · ${formatDeadline(content.dueDate)}`
                  : '—'}
              </span>
            </DetailItem>
            <DetailItem label="Vai ao ar">
              {content.scheduledAt ? formatDateTime(content.scheduledAt) : '—'}
            </DetailItem>
            <DetailItem label="Criado">
              {content.creator?.name ?? '—'}
              <span className="text-2xs text-muted block" title={formatDateTime(content.createdAt)}>
                {formatRelative(content.createdAt)}
              </span>
            </DetailItem>
          </DetailList>

          <TextBlock label="Briefing" value={content.briefing} />
          <TextBlock label="Texto" value={content.copy} />
          <TextBlock label="Referências" value={content.referencesNotes} />

          {content.files && (
            <FileList
              {...content.files}
              title="Peças e arquivos"
              description="Artes, vídeos, versões finais."
            />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">{label}</h3>
      <p className="text-default text-sm whitespace-pre-line">{value}</p>
    </section>
  )
}

export function MissingContentDrawer() {
  const router = useRouter()
  const closeHref = useCloseDrawerHref('conteudo')
  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="sm">
        <DrawerHeader title="Conteúdo não encontrado" />
        <DrawerBody className="text-muted px-5 py-4 text-sm">
          Ele pode ter sido descartado, ou você não tem acesso ao marketing.
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
