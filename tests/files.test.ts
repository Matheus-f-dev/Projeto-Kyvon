import { and, desc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import { activities, auditLogs, files } from '@/server/db/schema'
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '@/server/errors'
import { convertOpportunityToContract } from '@/server/modules/contracts/service'
import { createOpportunity, markOpportunityWon } from '@/server/modules/crm/service'
import { getFilePanel, listFiles, listFilesForTarget } from '@/server/modules/files/queries'
import { deleteFile, readFileForDownload, uploadFile } from '@/server/modules/files/service'
import { sanitizeFileName, validateUpload } from '@/server/modules/files/validation'
import { addProjectMember, createProject } from '@/server/modules/projects/service'
import {
  __setStorageForTests,
  createLocalDriver,
  createSupabaseDriver,
  type StorageDriver,
} from '@/server/storage'

import { contextFor, createTestClient, createTestUser, unique } from './helpers'

/**
 * Arquivos: o binário nunca vai para o banco, a permissão vem da entidade
 * vinculada, versão nova preserva a anterior e o conteúdo é conferido pela
 * assinatura — não pela extensão nem pelo MIME do navegador.
 */

function memoryStorage(): StorageDriver & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    name: 'local',
    objects,
    async put(key, data) {
      if (objects.has(key)) throw new Error('colisão')
      objects.set(key, data)
    },
    async get(key) {
      const data = objects.get(key)
      if (!data) throw new Error('inexistente')
      return data
    },
    async delete(key) {
      objects.delete(key)
    },
    async exists(key) {
      return objects.has(key)
    },
  }
}

const storage = memoryStorage()

beforeAll(() => __setStorageForTests(storage))
afterAll(() => __setStorageForTests(undefined))

const encoder = new TextEncoder()
const pdf = (text = 'conteúdo') => encoder.encode(`%PDF-1.7\n${text}\n%%EOF`)
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

async function projectWithTeam() {
  const gestor = await createTestUser('gestor')
  const designer = await createTestUser('design')
  const outsider = await createTestUser('dev')
  const client = await createTestClient(gestor.id)
  const project = await createProject(
    { name: unique('Projeto'), clientId: client.id, ownerId: gestor.id },
    gestor,
  )
  await addProjectMember(project.id, designer.id, 'UI Designer', gestor)
  return {
    projectId: project.id,
    clientId: client.id,
    gestor: await contextFor(gestor),
    designer: await contextFor(designer),
    outsider: await contextFor(outsider),
  }
}

describe('validação de conteúdo', () => {
  const max = 1024 * 1024

  it('aceita um PDF de verdade e grava o MIME da tabela, não o do navegador', () => {
    const result = validateUpload({ name: 'proposta.PDF', bytes: pdf(), maxBytes: max })
    expect(result.kind.mime).toBe('application/pdf')
    expect(result.extension).toBe('pdf')
  })

  it('recusa extensão fora da lista', () => {
    expect(() => validateUpload({ name: 'instalador.exe', bytes: pdf(), maxBytes: max })).toThrow(
      ValidationError,
    )
    expect(() => validateUpload({ name: 'pagina.html', bytes: pdf(), maxBytes: max })).toThrow(
      ValidationError,
    )
  })

  it('recusa conteúdo que não corresponde à extensão', () => {
    const html = encoder.encode('<html><script>alert(1)</script></html>')
    expect(() => validateUpload({ name: 'contrato.pdf', bytes: html, maxBytes: max })).toThrow(
      /não corresponde/,
    )
    expect(() => validateUpload({ name: 'foto.png', bytes: pdf(), maxBytes: max })).toThrow(
      /não corresponde/,
    )
  })

  it('recusa arquivo vazio e acima do limite', () => {
    expect(() => validateUpload({ name: 'a.pdf', bytes: new Uint8Array(), maxBytes: max })).toThrow(
      /vazio/,
    )
    expect(() =>
      validateUpload({ name: 'a.pdf', bytes: pdf('x'.repeat(2000)), maxBytes: 1000 }),
    ).toThrow(/limite/)
  })

  it('remove diretórios e caracteres de controle do nome', () => {
    expect(sanitizeFileName('C:\\Users\\fulano\\briefing.pdf')).toBe('briefing.pdf')
    expect(sanitizeFileName('../../etc/passwd.txt')).toBe('passwd.txt')
    expect(sanitizeFileName('nome\u0000com\u0007controle.pdf')).toBe('nomecomcontrole.pdf')
    expect(sanitizeFileName('..')).toBe('arquivo')
  })
})

describe('upload e permissão pela entidade', () => {
  it('membro da equipe anexa no projeto; binário vai para o storage, metadados para o banco', async () => {
    const { projectId, designer } = await projectWithTeam()

    const uploaded = await uploadFile(designer, {
      target: { type: 'project', id: projectId },
      name: 'moodboard.png',
      bytes: png(),
    })

    const [row] = await db.select().from(files).where(eq(files.id, uploaded.id))
    expect(row?.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/)
    expect(row?.storageKey).not.toContain('moodboard')
    expect(row?.checksum).toHaveLength(64)
    expect(storage.objects.has(row?.storageKey ?? '')).toBe(true)

    const [activity] = await db
      .select({ verb: activities.verb, summary: activities.summary })
      .from(activities)
      .where(and(eq(activities.entityId, projectId), eq(activities.verb, 'uploaded')))
    expect(activity?.summary).toBe('anexou moodboard.png')

    const [audit] = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'file'), eq(auditLogs.entityId, uploaded.id)))
    expect(audit?.action).toBe('create')
  })

  it('quem não é da equipe não anexa; gestão ampla (projects.delete) anexa', async () => {
    const { projectId, outsider, gestor } = await projectWithTeam()
    const target = { type: 'project', id: projectId } as const

    await expect(
      uploadFile(outsider, { target, name: 'a.pdf', bytes: pdf() }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      uploadFile(gestor, { target, name: 'a.pdf', bytes: pdf() }),
    ).resolves.toMatchObject({ version: 1 })
  })

  it('documento de contrato exige contracts.documents.read — para ver e para baixar', async () => {
    const gestorUser = await createTestUser('gestor')
    const comercialUser = await createTestUser('comercial')
    const client = await createTestClient(gestorUser.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id, estimatedValue: '5000.00' },
      gestorUser,
    )
    await markOpportunityWon(opportunity.id, gestorUser)
    const { id: contractId } = await convertOpportunityToContract(opportunity.id, gestorUser)

    const gestor = await contextFor(gestorUser)
    const comercial = await contextFor(comercialUser)
    const target = { type: 'contract', id: contractId } as const

    const uploaded = await uploadFile(gestor, {
      target,
      name: 'contrato-assinado.pdf',
      bytes: pdf(),
    })

    expect(await listFilesForTarget(comercial, target)).toEqual([])
    expect(await getFilePanel(comercial, target)).toBeNull()
    // Mesmo erro de "não existe": não confirma a existência do arquivo.
    await expect(readFileForDownload(comercial, uploaded.id)).rejects.toBeInstanceOf(NotFoundError)

    const listed = await listFiles(comercial, { q: 'contrato-assinado' })
    expect(listed.items.some((item) => item.id === uploaded.id)).toBe(false)

    // O feed do contrato é visível para quem não vê documentos: não pode trazer o nome.
    const feed = await db
      .select({ summary: activities.summary })
      .from(activities)
      .where(and(eq(activities.entityId, contractId), eq(activities.verb, 'uploaded')))
    expect(feed.map((item) => item.summary)).toEqual(['anexou um documento'])

    const download = await readFileForDownload(gestor, uploaded.id)
    expect(new TextDecoder().decode(download.bytes)).toContain('%PDF')
  })

  it('negar files.read por usuário esconde arquivos mesmo com acesso à entidade', async () => {
    const { projectId, designer, gestor } = await projectWithTeam()
    const target = { type: 'project', id: projectId } as const
    await uploadFile(gestor, { target, name: 'escopo.pdf', bytes: pdf() })

    const denied = await contextFor(
      {
        id: designer.user.id,
        email: designer.user.email,
        name: designer.user.name,
        roleId: designer.user.roleId,
      },
      [{ key: 'files.read', effect: 'deny' }],
    )
    expect(await listFilesForTarget(denied, target)).toEqual([])
  })

  it('apaga o binário se a gravação no banco falhar', async () => {
    const { projectId, gestor } = await projectWithTeam()
    const before = storage.objects.size

    await expect(
      uploadFile(gestor, {
        target: { type: 'project', id: projectId },
        name: 'a.pdf',
        bytes: pdf(),
        // Passa do varchar(120): o insert do vínculo falha dentro da transação.
        label: 'x'.repeat(300),
      }),
    ).rejects.toThrow()

    expect(storage.objects.size).toBe(before)
  })
})

describe('versões', () => {
  it('versão nova preserva a anterior e vira a atual', async () => {
    const { projectId, gestor } = await projectWithTeam()
    const target = { type: 'project', id: projectId } as const

    const v1 = await uploadFile(gestor, { target, name: 'layout.pdf', bytes: pdf('v1') })
    const v2 = await uploadFile(gestor, {
      target,
      name: 'layout-revisado.pdf',
      bytes: pdf('v2'),
      previousFileId: v1.id,
    })

    expect(v2.version).toBe(2)

    const list = await listFilesForTarget(gestor, target)
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(v2.id)
    expect(list[0]?.history.map((item) => item.version)).toEqual([1])

    // A v1 continua baixável.
    const old = await readFileForDownload(gestor, v1.id)
    expect(new TextDecoder().decode(old.bytes)).toContain('v1')
  })

  it('não ramifica: só a versão mais recente ganha sucessora', async () => {
    const { projectId, gestor } = await projectWithTeam()
    const target = { type: 'project', id: projectId } as const
    const v1 = await uploadFile(gestor, { target, name: 'a.pdf', bytes: pdf() })
    await uploadFile(gestor, { target, name: 'a.pdf', bytes: pdf(), previousFileId: v1.id })

    await expect(
      uploadFile(gestor, { target, name: 'a.pdf', bytes: pdf(), previousFileId: v1.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('não aceita como versão anterior um arquivo de outro registro', async () => {
    const a = await projectWithTeam()
    const b = await projectWithTeam()
    const foreign = await uploadFile(a.gestor, {
      target: { type: 'project', id: a.projectId },
      name: 'a.pdf',
      bytes: pdf(),
    })

    await expect(
      uploadFile(b.gestor, {
        target: { type: 'project', id: b.projectId },
        name: 'a.pdf',
        bytes: pdf(),
        previousFileId: foreign.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })
})

describe('exclusão', () => {
  it('exige files.delete', async () => {
    const { projectId, designer } = await projectWithTeam()
    const uploaded = await uploadFile(designer, {
      target: { type: 'project', id: projectId },
      name: 'a.pdf',
      bytes: pdf(),
    })

    await expect(deleteFile(designer, uploaded.id)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('excluir a versão atual devolve a anterior, apaga o binário e audita', async () => {
    const { projectId, gestor } = await projectWithTeam()
    const target = { type: 'project', id: projectId } as const
    const v1 = await uploadFile(gestor, { target, name: 'a.pdf', bytes: pdf('v1') })
    const v2 = await uploadFile(gestor, {
      target,
      name: 'a.pdf',
      bytes: pdf('v2'),
      previousFileId: v1.id,
    })
    const [stored] = await db
      .select({ key: files.storageKey })
      .from(files)
      .where(eq(files.id, v2.id))

    await deleteFile(gestor, v2.id)

    const list = await listFilesForTarget(gestor, target)
    expect(list.map((item) => item.id)).toEqual([v1.id])
    expect(storage.objects.has(stored?.key ?? '')).toBe(false)

    const [audit] = await db
      .select({ action: auditLogs.action, changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'file'), eq(auditLogs.entityId, v2.id)))
      .orderBy(desc(auditLogs.createdAt))
    expect(audit?.action).toBe('delete')
    expect(audit?.changes).toMatchObject({ name: { from: 'a.pdf' } })
  })

  it('excluir uma versão do meio mantém a linha de versões contínua', async () => {
    const { projectId, gestor } = await projectWithTeam()
    const target = { type: 'project', id: projectId } as const
    const v1 = await uploadFile(gestor, { target, name: 'a.pdf', bytes: pdf() })
    const v2 = await uploadFile(gestor, {
      target,
      name: 'a.pdf',
      bytes: pdf(),
      previousFileId: v1.id,
    })
    const v3 = await uploadFile(gestor, {
      target,
      name: 'a.pdf',
      bytes: pdf(),
      previousFileId: v2.id,
    })

    await deleteFile(gestor, v2.id)

    const [current] = await listFilesForTarget(gestor, target)
    expect(current?.id).toBe(v3.id)
    expect(current?.history.map((item) => item.id)).toEqual([v1.id])
  })
})

describe('drivers de storage', () => {
  it('driver local recusa chave que sai do diretório base', async () => {
    const driver = createLocalDriver('.data/test-storage')
    await expect(driver.put('../fora.txt', pdf())).rejects.toThrow(/inválida/)
    await expect(driver.get('2026/../../fora.txt')).rejects.toThrow(/inválida/)
  })

  it('driver Supabase fala com a API REST do Storage com a service key', async () => {
    const calls: { url: string; method: string; auth: string | null; body?: unknown }[] = []
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        auth: headers.get('authorization'),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      })
      return new Response(init?.method === 'GET' || !init?.method ? pdf() : '{}', { status: 200 })
    }) as typeof fetch

    const driver = createSupabaseDriver({
      url: 'https://abc.supabase.co/',
      serviceRoleKey: 'service-key',
      bucket: 'kyvon-files',
      fetchImpl: fakeFetch,
    })

    await driver.put('2026/09/id.pdf', pdf())
    await driver.get('2026/09/id.pdf')
    await driver.delete('2026/09/id.pdf')

    expect(calls[0]).toMatchObject({
      url: 'https://abc.supabase.co/storage/v1/object/kyvon-files/2026/09/id.pdf',
      method: 'POST',
      auth: 'Bearer service-key',
    })
    expect(calls[1]).toMatchObject({ method: 'GET' })
    expect(calls[2]).toMatchObject({
      url: 'https://abc.supabase.co/storage/v1/object/kyvon-files',
      method: 'DELETE',
      body: { prefixes: ['2026/09/id.pdf'] },
    })

    await expect(driver.put('../x.pdf', pdf())).rejects.toThrow(/inválida/)
  })

  it('driver Supabase propaga falha da API em vez de fingir sucesso', async () => {
    const driver = createSupabaseDriver({
      url: 'https://abc.supabase.co',
      serviceRoleKey: 'k',
      bucket: 'b',
      fetchImpl: (async () => new Response('Bucket not found', { status: 404 })) as typeof fetch,
    })
    await expect(driver.put('2026/09/a.pdf', pdf())).rejects.toThrow(/404/)
  })
})
