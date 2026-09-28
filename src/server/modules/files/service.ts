import { createHash, randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import { fileLinks, files } from '@/server/db/schema'
import { getEnv } from '@/server/env'
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { recordAudit } from '@/server/modules/audit/service'
import { getStorage } from '@/server/storage'
import { fileKindFor, type FileKind, type FileTargetRef } from '@/shared/files'

import {
  assertCanWriteTarget,
  assertTargetUnlocked,
  canReadTarget,
  isConfidentialTarget,
  LINK_COLUMNS,
  linkValues,
  resolveTarget,
  targetOfLink,
} from './access'
import { validateUpload } from './validation'

/**
 * Arquivos (ADR-008, ADR-010).
 *
 * Ordem das operações no upload: valida → grava o binário → grava os metadados
 * em transação. Se o banco falhar, o binário recém-gravado é apagado; o
 * contrário (metadado sem binário) nunca acontece.
 */

export interface UploadInput {
  target: FileTargetRef
  name: string
  bytes: Uint8Array
  /** Nova versão de um arquivo já vinculado ao mesmo alvo. */
  previousFileId?: string
  label?: string
}

export interface UploadedFile {
  id: string
  name: string
  version: number
  mimeType: string
  sizeBytes: number
}

export function maxUploadBytes(): number {
  return getEnv().STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024
}

export async function uploadFile(context: AuthContext, input: UploadInput): Promise<UploadedFile> {
  await assertCanWriteTarget(context, input.target)
  const target = await resolveTarget(input.target)
  assertTargetUnlocked(target)

  const { name, extension, kind } = validateUpload({
    name: input.name,
    bytes: input.bytes,
    maxBytes: maxUploadBytes(),
  })

  let version = 1
  let previousFileId: string | null = null

  if (input.previousFileId) {
    const previous = await findLinkedFile(input.previousFileId, input.target)
    if (!previous) {
      throw new BusinessRuleError('A versão anterior não pertence a este registro.')
    }
    const [newer] = await db
      .select({ id: files.id })
      .from(files)
      .where(eq(files.previousFileId, previous.id))
      .limit(1)
    if (newer) {
      // Versões formam uma linha, não uma árvore: só a mais recente ganha sucessora.
      throw new BusinessRuleError(
        'Já existe uma versão mais nova deste arquivo. Atualize a página.',
      )
    }
    version = previous.version + 1
    previousFileId = previous.id
  }

  const storage = getStorage()
  const now = new Date()
  const storageKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${extension}`
  const checksum = createHash('sha256').update(input.bytes).digest('hex')

  await storage.put(storageKey, input.bytes)

  try {
    const fileId = randomUUID()

    await db.transaction(async (tx) => {
      await tx.insert(files).values({
        id: fileId,
        name,
        originalName: name,
        mimeType: kind.mime,
        sizeBytes: input.bytes.byteLength,
        storageDriver: storage.name,
        storageKey,
        checksum,
        version,
        previousFileId,
        uploadedBy: context.user.id,
      })

      await tx.insert(fileLinks).values({
        fileId,
        ...linkValues(input.target),
        label: input.label?.trim() || null,
        createdBy: context.user.id,
      })

      await recordActivity(
        {
          actorId: context.user.id,
          verb: 'uploaded',
          entityType: input.target.type,
          entityId: input.target.id,
          entityLabel: target.label,
          summary: uploadSummary(input.target.type, name, version),
          projectId: target.projectId,
          clientId: target.clientId,
          metadata: { fileId, version },
        },
        tx,
      )

      await recordAudit(
        {
          actor: context.user,
          action: 'create',
          entityType: 'file',
          entityId: fileId,
          entityLabel: name,
          changes: {
            target: { from: null, to: `${input.target.type}:${input.target.id}` },
            version: { from: null, to: version },
            checksum: { from: null, to: checksum },
          },
        },
        tx,
      )
    })

    return { id: fileId, name, version, mimeType: kind.mime, sizeBytes: input.bytes.byteLength }
  } catch (error) {
    await storage.delete(storageKey).catch((cleanupError: unknown) => {
      console.error('[files] binário órfão após falha no banco:', storageKey, cleanupError)
    })
    throw error
  }
}

function uploadSummary(type: FileTargetRef['type'], name: string, version: number): string {
  if (isConfidentialTarget(type)) {
    return version > 1 ? `enviou a versão ${version} de um documento` : 'anexou um documento'
  }
  return version > 1 ? `enviou a versão ${version} de ${name}` : `anexou ${name}`
}

async function findLinkedFile(fileId: string, target: FileTargetRef) {
  const [row] = await db
    .select({ id: files.id, version: files.version })
    .from(files)
    .innerJoin(fileLinks, eq(fileLinks.fileId, files.id))
    .where(and(eq(files.id, fileId), eq(LINK_COLUMNS[target.type], target.id)))
    .limit(1)
  return row
}

/** Alvos a que o arquivo está vinculado. */
async function targetsOf(fileId: string): Promise<FileTargetRef[]> {
  const links = await db.select().from(fileLinks).where(eq(fileLinks.fileId, fileId))
  return links.map(targetOfLink).filter((target): target is FileTargetRef => Boolean(target))
}

/**
 * Pode ver o arquivo quem pode ver **qualquer** entidade a que ele está
 * vinculado. Arquivo sem vínculo não é visível para ninguém pela aplicação.
 */
export async function canReadFile(context: AuthContext, fileId: string): Promise<boolean> {
  const targets = await targetsOf(fileId)
  return targets.some((target) => canReadTarget(context, target.type))
}

export interface DownloadableFile {
  name: string
  mimeType: string
  sizeBytes: number
  kind: FileKind | undefined
  bytes: Uint8Array
}

export async function readFileForDownload(
  context: AuthContext,
  fileId: string,
): Promise<DownloadableFile> {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1)

  // Mesmo erro para "não existe" e "sem acesso": não confirma a existência
  // de um arquivo para quem não pode vê-lo.
  if (!file || !(await canReadFile(context, fileId))) throw new NotFoundError('Arquivo')

  const bytes = await getStorage().get(file.storageKey)
  return {
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    kind: fileKindFor(file.name),
    bytes,
  }
}

/**
 * Exclusão definitiva de uma versão.
 *
 * Exige `files.delete` e acesso de leitura à entidade. O registro de auditoria
 * guarda nome, tamanho e checksum — o suficiente para saber o que existiu.
 * Se houver versão mais nova, ela passa a apontar para a anterior à excluída,
 * mantendo a linha de versões contínua.
 */
export async function deleteFile(context: AuthContext, fileId: string): Promise<void> {
  if (!context.can('files.delete')) {
    throw new ForbiddenError('Você não tem permissão para excluir arquivos.')
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1)
  if (!file || !(await canReadFile(context, fileId))) throw new NotFoundError('Arquivo')

  const targets = await targetsOf(fileId)
  const resolved = await Promise.all(targets.map((target) => resolveTarget(target)))
  for (const target of resolved) assertTargetUnlocked(target)

  await db.transaction(async (tx) => {
    await tx
      .update(files)
      .set({ previousFileId: file.previousFileId })
      .where(eq(files.previousFileId, file.id))

    await tx.delete(files).where(eq(files.id, file.id))

    for (const target of resolved) {
      await recordActivity(
        {
          actorId: context.user.id,
          verb: 'deleted',
          entityType: target.ref.type,
          entityId: target.ref.id,
          entityLabel: target.label,
          summary: isConfidentialTarget(target.ref.type)
            ? 'excluiu um documento'
            : `excluiu o arquivo ${file.name}${file.version > 1 ? ` (v${file.version})` : ''}`,
          projectId: target.projectId,
          clientId: target.clientId,
        },
        tx,
      )
    }

    await recordAudit(
      {
        actor: context.user,
        action: 'delete',
        entityType: 'file',
        entityId: file.id,
        entityLabel: file.name,
        changes: {
          name: { from: file.name, to: null },
          version: { from: file.version, to: null },
          sizeBytes: { from: file.sizeBytes, to: null },
          checksum: { from: file.checksum, to: null },
          targets: { from: targets.map((target) => `${target.type}:${target.id}`), to: null },
        },
      },
      tx,
    )
  })

  // Depois do commit: se falhar, sobra um binário órfão (registrado no log),
  // nunca um registro apontando para o vazio.
  await getStorage()
    .delete(file.storageKey)
    .catch((error: unknown) =>
      console.error('[files] falha ao apagar binário:', file.storageKey, error),
    )
}
