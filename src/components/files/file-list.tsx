'use client'

import {
  Download,
  ExternalLink,
  FileText,
  History,
  MoreHorizontal,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/cn'
import { formatDateTime, formatFileSize, formatRelative } from '@/lib/format'
import type { FileItem } from '@/server/modules/files/queries'
import { FILE_ACCEPT_ATTRIBUTE, fileKindFor, type FileTargetRef } from '@/shared/files'

/**
 * Arquivos de uma entidade.
 *
 * Nova versão não substitui a anterior: ela vira histórico, acessível pelo
 * menu do arquivo. O envio vai direto para `/api/files` (XHR, para mostrar
 * progresso); a validação real — tipo, assinatura, tamanho, permissão — é do
 * servidor. A checagem aqui só evita esperar um upload inteiro para ouvir "não".
 */
export function FileList({
  target,
  files,
  canUpload,
  canDelete,
  maxSizeMb,
  title = 'Arquivos',
  description,
  emptyDescription = 'Arraste arquivos para cá ou use o botão Enviar.',
  bare = false,
}: {
  target: FileTargetRef
  files: FileItem[]
  canUpload: boolean
  canDelete: boolean
  maxSizeMb: number
  title?: string
  description?: string
  emptyDescription?: string
  /** Sem painel em volta — para uso dentro de drawers. */
  bare?: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [versionOf, setVersionOf] = useState<FileItem | null>(null)
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; name: string; version: number } | null>(
    null,
  )
  const [deletePending, setDeletePending] = useState(false)

  const uploading = progress !== null

  const pick = (previous: FileItem | null) => {
    setVersionOf(previous)
    inputRef.current?.click()
  }

  const upload = async (list: File[], previous: FileItem | null) => {
    for (const file of list) {
      const problem = precheck(file, maxSizeMb)
      if (problem) {
        toast.error(`${file.name}: ${problem}`)
        continue
      }

      setProgress({ name: file.name, percent: 0 })
      try {
        await send(file, target, previous?.id, (percent) =>
          setProgress({ name: file.name, percent }),
        )
        toast.success(
          previous ? `Versão nova de ${previous.name} enviada.` : `${file.name} anexado.`,
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.')
      }
    }
    setProgress(null)
    setVersionOf(null)
    router.refresh()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletePending(true)
    try {
      const response = await fetch(`/api/files/${deleting.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await errorMessage(response))
      toast.success('Arquivo excluído.')
      setDeleting(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir.')
    } finally {
      setDeletePending(false)
    }
  }

  const dropProps = canUpload
    ? {
        onDragOver: (event: React.DragEvent) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          setDragging(true)
        },
        onDragLeave: (event: React.DragEvent) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDragging(false)
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault()
          setDragging(false)
          if (uploading) return
          void upload(Array.from(event.dataTransfer.files), null)
        },
      }
    : {}

  const uploadButton = canUpload && (
    <Button
      variant="ghost"
      size="sm"
      icon={<Upload />}
      onClick={() => pick(null)}
      loading={uploading}
    >
      Enviar
    </Button>
  )

  const body = (
    <div {...dropProps} className={cn('relative', dragging && 'bg-brand-soft')}>
      <input
        ref={inputRef}
        type="file"
        multiple={!versionOf}
        accept={FILE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          const list = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (list.length > 0) void upload(versionOf ? list.slice(0, 1) : list, versionOf)
        }}
      />

      {progress && (
        <div className="border-line text-muted flex items-center gap-3 border-b px-4 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate">Enviando {progress.name}…</span>
          <span className="bg-neutral-soft h-1 w-24 overflow-hidden rounded-full">
            <span
              className="bg-brand block h-full transition-[width]"
              style={{ width: `${progress.percent}%` }}
            />
          </span>
          <span data-tabular>{progress.percent}%</span>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState
          compact
          icon={<Paperclip />}
          title="Nenhum arquivo"
          description={canUpload ? emptyDescription : undefined}
        />
      ) : (
        <ul className="divide-y divide-[var(--line-subtle)]">
          {files.map((file) => (
            <li key={file.id}>
              <div className="group flex items-center gap-3 px-4 py-2.5">
                <FileText className="text-subtle size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <a
                    href={fileUrl(file.id, file.inline)}
                    target={file.inline ? '_blank' : undefined}
                    rel="noopener"
                    className="text-strong truncate text-sm font-medium hover:underline"
                  >
                    {file.name}
                  </a>
                  <span className="text-2xs text-muted truncate">
                    {file.label ? `${file.label} · ` : ''}
                    {file.kindLabel} · {formatFileSize(file.sizeBytes)} · v{file.version} ·{' '}
                    <span title={formatDateTime(file.createdAt)}>
                      {formatRelative(file.createdAt)}
                    </span>
                    {file.uploader ? ` · ${file.uploader}` : ''}
                  </span>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="xs" iconOnly aria-label={`Ações de ${file.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {file.inline && (
                      <DropdownMenuItem asChild>
                        <a href={fileUrl(file.id, true)} target="_blank" rel="noopener">
                          <ExternalLink /> Abrir
                        </a>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <a href={fileUrl(file.id, false)}>
                        <Download /> Baixar
                      </a>
                    </DropdownMenuItem>
                    {canUpload && (
                      <DropdownMenuItem disabled={uploading} onSelect={() => pick(file)}>
                        <Upload /> Enviar nova versão
                      </DropdownMenuItem>
                    )}
                    {file.history.length > 0 && (
                      <DropdownMenuItem
                        onSelect={() => setExpanded(expanded === file.id ? null : file.id)}
                      >
                        <History /> {expanded === file.id ? 'Ocultar' : 'Ver'} versões anteriores (
                        {file.history.length})
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          destructive
                          onSelect={() =>
                            setDeleting({ id: file.id, name: file.name, version: file.version })
                          }
                        >
                          <Trash2 /> Excluir esta versão
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {expanded === file.id && (
                <ol
                  className="bg-sunken flex flex-col gap-1 px-4 py-2 pl-11"
                  aria-label="Versões anteriores"
                >
                  {file.history.map((version) => (
                    <li key={version.id} className="text-2xs text-muted flex items-center gap-2">
                      <span className="text-default font-mono">v{version.version}</span>
                      <span title={formatDateTime(version.createdAt)}>
                        {formatRelative(version.createdAt)}
                      </span>
                      {version.uploader && <span>· {version.uploader}</span>}
                      <span>· {formatFileSize(version.sizeBytes)}</span>
                      <a
                        href={fileUrl(version.id, false)}
                        className="text-brand-text ml-auto hover:underline"
                      >
                        Baixar
                      </a>
                      {canDelete && (
                        <button
                          type="button"
                          className="text-subtle hover:text-danger-text"
                          onClick={() =>
                            setDeleting({
                              id: version.id,
                              name: file.name,
                              version: version.version,
                            })
                          }
                          aria-label={`Excluir versão ${version.version}`}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}

      {dragging && (
        <div className="border-brand-border text-brand-text pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed text-sm font-medium">
          Solte para anexar
        </div>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent size="sm">
          <DialogHeader
            title="Excluir arquivo?"
            description={
              deleting
                ? `${deleting.name} (v${deleting.version}) será removido de forma definitiva. A exclusão fica registrada na auditoria.`
                : undefined
            }
          />
          <DialogBody />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={deletePending} onClick={() => void confirmDelete()}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  if (bare) {
    return (
      <div className="flex flex-col">
        {canUpload && <div className="flex justify-end px-2 pb-1">{uploadButton}</div>}
        {body}
      </div>
    )
  }

  return (
    <Panel>
      <PanelHeader
        title={title}
        description={
          description ??
          (files.length > 0
            ? `${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}`
            : undefined)
        }
        actions={uploadButton || undefined}
      />
      {body}
    </Panel>
  )
}

function fileUrl(id: string, inline: boolean): string {
  return inline ? `/api/files/${id}?inline=1` : `/api/files/${id}`
}

function precheck(file: File, maxSizeMb: number): string | null {
  if (!fileKindFor(file.name)) return 'tipo de arquivo não permitido.'
  if (file.size === 0) return 'o arquivo está vazio.'
  if (file.size > maxSizeMb * 1024 * 1024) return `passa do limite de ${maxSizeMb} MB.`
  return null
}

function send(
  file: File,
  target: FileTargetRef,
  previousFileId: string | undefined,
  onProgress: (percent: number) => void,
): Promise<void> {
  const form = new FormData()
  form.set('file', file)
  form.set('targetType', target.type)
  form.set('targetId', target.id)
  if (previousFileId) form.set('previousFileId', previousFileId)

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/files')
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve()
      reject(new Error(parseError(request.responseText) ?? 'Não foi possível enviar o arquivo.'))
    }
    request.onerror = () => reject(new Error('Falha de conexão durante o envio.'))
    request.send(form)
  })
}

function parseError(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { error?: { message?: string } }).error?.message
  } catch {
    return undefined
  }
}

async function errorMessage(response: Response): Promise<string> {
  return parseError(await response.text()) ?? 'Não foi possível concluir a ação.'
}
