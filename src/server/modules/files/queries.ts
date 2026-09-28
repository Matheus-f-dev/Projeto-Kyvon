import { and, count, desc, eq, ilike, isNotNull, notExists, or, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import { fileLinks, files, users } from '@/server/db/schema'
import { getEnv } from '@/server/env'
import { buildPageResult, DEFAULT_PAGE_SIZE, type PageResult } from '@/server/pagination'
import { fileKindFor, type FileTarget, type FileTargetRef } from '@/shared/files'

import {
  assertCanWriteTarget,
  canReadTarget,
  LINK_COLUMNS,
  readableTargets,
  resolveTarget,
  targetOfLink,
} from './access'

export interface FileVersion {
  id: string
  version: number
  sizeBytes: number
  createdAt: Date
  uploader: string | null
}

export interface FileItem extends FileVersion {
  name: string
  mimeType: string
  label: string | null
  /** Pode abrir no navegador (imagem raster, PDF). */
  inline: boolean
  kindLabel: string
  /** Versões anteriores, da mais recente para a mais antiga. */
  history: FileVersion[]
}

/**
 * Arquivos de uma entidade, agrupados por linha de versão.
 *
 * Mostra só a versão mais recente de cada arquivo; as anteriores vêm em
 * `history`. São poucos por entidade, então a montagem da cadeia é feita em
 * memória — mais simples e mais legível que uma CTE recursiva.
 */
export async function listFilesForTarget(
  context: AuthContext,
  target: FileTargetRef,
): Promise<FileItem[]> {
  if (!canReadTarget(context, target.type)) return []

  const rows = await db
    .select({
      id: files.id,
      name: files.name,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      version: files.version,
      previousFileId: files.previousFileId,
      createdAt: files.createdAt,
      uploader: users.name,
      label: fileLinks.label,
    })
    .from(files)
    .innerJoin(fileLinks, eq(fileLinks.fileId, files.id))
    .leftJoin(users, eq(users.id, files.uploadedBy))
    .where(eq(LINK_COLUMNS[target.type], target.id))
    .orderBy(desc(files.createdAt))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const superseded = new Set(rows.map((row) => row.previousFileId).filter(Boolean))

  return rows
    .filter((row) => !superseded.has(row.id))
    .map((row) => {
      const history: FileVersion[] = []
      let cursor = row.previousFileId ? byId.get(row.previousFileId) : undefined
      // O limite protege contra um ciclo por dado corrompido.
      while (cursor && history.length < 100) {
        history.push(toVersion(cursor))
        cursor = cursor.previousFileId ? byId.get(cursor.previousFileId) : undefined
      }

      const kind = fileKindFor(row.name)
      return {
        ...toVersion(row),
        name: row.name,
        mimeType: row.mimeType,
        label: row.label,
        inline: kind?.inline ?? false,
        kindLabel: kind?.label ?? 'Arquivo',
        history,
      }
    })
}

function toVersion(row: {
  id: string
  version: number
  sizeBytes: number
  createdAt: Date
  uploader: string | null
}): FileVersion {
  return {
    id: row.id,
    version: row.version,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    uploader: row.uploader,
  }
}

// ── Listagem geral ───────────────────────────────────────────────────────────

export interface FileListRow {
  id: string
  name: string
  version: number
  sizeBytes: number
  createdAt: Date
  uploader: string | null
  inline: boolean
  kindLabel: string
  target: { type: FileTarget; label: string; href: string | null } | null
}

export interface FileListFilter {
  q?: string
  target?: FileTarget
  page?: number
}

/**
 * Todos os arquivos que o usuário pode ver — só a versão mais recente de cada
 * um, filtrados pelos tipos de entidade que ele tem permissão de ler.
 */
export async function listFiles(
  context: AuthContext,
  filter: FileListFilter = {},
): Promise<PageResult<FileListRow>> {
  const page = Math.max(1, filter.page ?? 1)
  const allowed = readableTargets(context).filter(
    (type) => !filter.target || type === filter.target,
  )

  if (allowed.length === 0) return buildPageResult([], 0, page, DEFAULT_PAGE_SIZE)

  const newer = alias(files, 'newer')
  const conditions: SQL[] = [
    or(...allowed.map((type) => isNotNull(LINK_COLUMNS[type]))) as SQL,
    notExists(db.select({ id: newer.id }).from(newer).where(eq(newer.previousFileId, files.id))),
  ]
  const q = filter.q?.trim()
  if (q) conditions.push(ilike(files.name, `%${q.replace(/[%_\\]/g, '\\$&')}%`))

  const where = and(...conditions)

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: files.id,
        name: files.name,
        version: files.version,
        sizeBytes: files.sizeBytes,
        createdAt: files.createdAt,
        uploader: users.name,
        link: fileLinks,
      })
      .from(files)
      .innerJoin(fileLinks, eq(fileLinks.fileId, files.id))
      .leftJoin(users, eq(users.id, files.uploadedBy))
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(DEFAULT_PAGE_SIZE)
      .offset((page - 1) * DEFAULT_PAGE_SIZE),
    db
      .select({ value: count() })
      .from(files)
      .innerJoin(fileLinks, eq(fileLinks.fileId, files.id))
      .where(where),
  ])

  const items = await Promise.all(
    rows.map(async (row): Promise<FileListRow> => {
      const ref = targetOfLink(row.link)
      const resolved = ref ? await resolveTarget(ref).catch(() => undefined) : undefined
      const kind = fileKindFor(row.name)
      return {
        id: row.id,
        name: row.name,
        version: row.version,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        uploader: row.uploader,
        inline: kind?.inline ?? false,
        kindLabel: kind?.label ?? 'Arquivo',
        target:
          ref && resolved ? { type: ref.type, label: resolved.label, href: resolved.href } : null,
      }
    }),
  )

  return buildPageResult(items, total?.value ?? 0, page, DEFAULT_PAGE_SIZE)
}

// ── Painel de arquivos de uma entidade ───────────────────────────────────────

export interface FilePanelData {
  target: FileTargetRef
  files: FileItem[]
  canUpload: boolean
  canDelete: boolean
  maxSizeMb: number
}

/**
 * Tudo que o `FileList` precisa, já com as permissões resolvidas no servidor.
 * `null` quando o usuário não pode ver arquivos desta entidade — a página
 * simplesmente não mostra o painel.
 */
export async function getFilePanel(
  context: AuthContext,
  target: FileTargetRef,
): Promise<FilePanelData | null> {
  if (!canReadTarget(context, target.type)) return null

  const [items, canUpload, resolved] = await Promise.all([
    listFilesForTarget(context, target),
    assertCanWriteTarget(context, target).then(
      () => true,
      () => false,
    ),
    resolveTarget(target).catch(() => undefined),
  ])

  const locked = resolved?.locked ?? false
  return {
    target,
    files: items,
    canUpload: canUpload && !locked,
    canDelete: context.can('files.delete') && !locked,
    maxSizeMb: getEnv().STORAGE_MAX_FILE_SIZE_MB,
  }
}
