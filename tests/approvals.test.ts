import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import { approvals, approvalVersions, contacts, notifications } from '@/server/db/schema'
import { BusinessRuleError, ConflictError, ValidationError } from '@/server/errors'
import {
  cancelApproval,
  createApproval,
  decideApproval,
  submitNewVersion,
  updateApproval,
} from '@/server/modules/approvals/service'
import { getApprovalDetail } from '@/server/modules/approvals/queries'
import { deleteFile, uploadFile } from '@/server/modules/files/service'
import {
  addProjectMember,
  changeProjectStatus,
  createProject,
} from '@/server/modules/projects/service'
import { createTask } from '@/server/modules/tasks/service'
import { __setStorageForTests, type StorageDriver } from '@/server/storage'
import { createApprovalSchema, decideApprovalSchema } from '@/shared/schemas/approvals'

import { contextFor, createTestClient, createTestUser, unique } from './helpers'

/**
 * Aprovações (regra 7): nada decidido é sobrescrito. "Ajustes" fecha a versão e
 * a próxima nasce do reenvio; a v1 continua legível, com o comentário e o
 * material de quando foi decidida.
 */

const objects = new Map<string, Uint8Array>()
const memory: StorageDriver = {
  name: 'local',
  put: async (key, data) => void objects.set(key, data),
  get: async (key) => objects.get(key) ?? new Uint8Array(),
  delete: async (key) => void objects.delete(key),
  exists: async (key) => objects.has(key),
}
beforeAll(() => __setStorageForTests(memory))
afterAll(() => __setStorageForTests(undefined))

const pdf = () => new TextEncoder().encode('%PDF-1.7\nmaterial\n%%EOF')

async function setup() {
  const gestor = await createTestUser('gestor')
  const designer = await createTestUser('design')
  const client = await createTestClient(gestor.id)
  const project = await createProject(
    { name: unique('Projeto'), clientId: client.id, ownerId: gestor.id },
    gestor,
  )
  await addProjectMember(project.id, designer.id, 'UI Designer', gestor)
  return { gestor, designer, client, projectId: project.id }
}

async function versionRow(approvalId: string, version: number) {
  const [row] = await db
    .select()
    .from(approvalVersions)
    .where(and(eq(approvalVersions.approvalId, approvalId), eq(approvalVersions.version, version)))
  return row
}

describe('solicitação', () => {
  it('cria a v1 pendente, herda o cliente do projeto e avisa o aprovador', async () => {
    const { gestor, designer, client, projectId } = await setup()

    const created = await createApproval(
      { projectId, title: 'Layout da home', approverUserId: gestor.id, notes: 'Desktop e mobile.' },
      designer,
    )

    expect(created.code).toMatch(/^APR-\d{4}$/)
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, created.id))
    expect(approval).toMatchObject({ status: 'pending', currentVersion: 1, clientId: client.id })
    expect(await versionRow(created.id, 1)).toMatchObject({
      status: 'pending',
      notes: 'Desktop e mobile.',
    })

    const [notification] = await db
      .select({ userId: notifications.userId, link: notifications.link })
      .from(notifications)
      .where(
        and(eq(notifications.entityId, created.id), eq(notifications.type, 'approval_requested')),
      )
    expect(notification).toEqual({ userId: gestor.id, link: `/aprovacoes?aprovacao=${created.id}` })
  })

  it('recusa aprovador sem permissão de decidir', async () => {
    const { designer, projectId } = await setup()
    const other = await createTestUser('design')

    await expect(
      createApproval({ projectId, title: 'Logo', approverUserId: other.id }, designer),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('contato aprovador precisa ser do cliente do projeto e estar autorizado', async () => {
    const { designer, client, projectId } = await setup()
    const otherClient = await createTestClient()

    await expect(
      createApproval(
        { projectId, title: 'Logo', approverContactId: otherClient.contactId },
        designer,
      ),
    ).rejects.toThrow(/cliente do projeto/)

    await db.update(contacts).set({ canApprove: false }).where(eq(contacts.id, client.contactId))
    await expect(
      createApproval({ projectId, title: 'Logo', approverContactId: client.contactId }, designer),
    ).rejects.toThrow(/autorizado/)
  })

  it('tarefa vinculada precisa ser do mesmo projeto', async () => {
    const a = await setup()
    const b = await setup()
    const foreignTask = await createTask(
      { projectId: b.projectId, title: 'Wireframe', priority: 'medium', type: 'design' },
      b.gestor,
    )

    await expect(
      createApproval(
        {
          projectId: a.projectId,
          title: 'Logo',
          approverUserId: a.gestor.id,
          taskId: foreignTask.id,
        },
        a.designer,
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('exige alguém para decidir', () => {
    const parsed = createApprovalSchema.safeParse({ projectId: crypto.randomUUID(), title: 'Logo' })
    expect(parsed.success).toBe(false)
  })

  it('solicitar ajustes exige descrever os ajustes', () => {
    const parsed = decideApprovalSchema.safeParse({
      approvalId: crypto.randomUUID(),
      version: 1,
      decision: 'changes_requested',
      comment: '',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('ciclo v1 → ajustes → v2 → aprovado', () => {
  it('preserva a v1 com decisão e comentário depois da aprovação da v2', async () => {
    const { gestor, designer, projectId } = await setup()
    const { id } = await createApproval(
      { projectId, title: 'Design da home', approverUserId: gestor.id },
      designer,
    )

    await decideApproval(
      {
        approvalId: id,
        version: 1,
        decision: 'changes_requested',
        comment: 'Aumentar o contraste do CTA.',
      },
      gestor,
    )

    const [afterChanges] = await db.select().from(approvals).where(eq(approvals.id, id))
    expect(afterChanges).toMatchObject({ status: 'changes_requested', currentVersion: 1 })

    // Decidir de novo antes do reenvio não faz sentido: não há material novo.
    await expect(
      decideApproval({ approvalId: id, version: 1, decision: 'approved' }, gestor),
    ).rejects.toBeInstanceOf(BusinessRuleError)

    const v2 = await submitNewVersion({ approvalId: id, notes: 'CTA com contraste AA.' }, designer)
    expect(v2.version).toBe(2)

    // Tela desatualizada tentando decidir a v1.
    await expect(
      decideApproval({ approvalId: id, version: 1, decision: 'approved' }, gestor),
    ).rejects.toBeInstanceOf(ConflictError)

    await decideApproval({ approvalId: id, version: 2, decision: 'approved' }, gestor)

    const [final] = await db.select().from(approvals).where(eq(approvals.id, id))
    expect(final?.status).toBe('approved')
    expect(final?.decidedAt).toBeInstanceOf(Date)

    expect(await versionRow(id, 1)).toMatchObject({
      status: 'changes_requested',
      decisionComment: 'Aumentar o contraste do CTA.',
      decidedBy: gestor.id,
    })
    expect(await versionRow(id, 2)).toMatchObject({
      status: 'approved',
      notes: 'CTA com contraste AA.',
    })

    const detail = await getApprovalDetail(await contextFor(designer), id)
    expect(detail?.versions.map((version) => [version.version, version.status])).toEqual([
      [2, 'approved'],
      [1, 'changes_requested'],
    ])
  })

  it('avisa quem pediu quando há decisão', async () => {
    const { gestor, designer, projectId } = await setup()
    const { id } = await createApproval(
      { projectId, title: 'Logo', approverUserId: gestor.id },
      designer,
    )

    await decideApproval(
      { approvalId: id, version: 1, decision: 'changes_requested', comment: 'Fonte.' },
      gestor,
    )

    const [notification] = await db
      .select({ userId: notifications.userId, body: notifications.body })
      .from(notifications)
      .where(and(eq(notifications.entityId, id), eq(notifications.type, 'approval_decided')))
    expect(notification?.userId).toBe(designer.id)
    expect(notification?.body).toContain('Fonte.')
  })

  it('nova versão só depois de ajustes solicitados', async () => {
    const { gestor, designer, projectId } = await setup()
    const { id } = await createApproval(
      { projectId, title: 'Logo', approverUserId: gestor.id },
      designer,
    )

    await expect(submitNewVersion({ approvalId: id, notes: 'v2' }, designer)).rejects.toThrow(
      /em análise/,
    )

    await decideApproval({ approvalId: id, version: 1, decision: 'approved' }, gestor)
    await expect(submitNewVersion({ approvalId: id, notes: 'v2' }, designer)).rejects.toThrow(
      /encerrada/,
    )
  })

  it('aprovação decidida não é mais editada', async () => {
    const { gestor, designer, projectId } = await setup()
    const { id } = await createApproval(
      { projectId, title: 'Logo', approverUserId: gestor.id },
      designer,
    )
    await decideApproval({ approvalId: id, version: 1, decision: 'approved' }, gestor)

    await expect(
      updateApproval(id, { title: 'Logo alterado', approverUserId: gestor.id }, designer),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })
})

describe('quem decide', () => {
  it('aprovação interna não é decidida por quem enviou o material', async () => {
    const { gestor, projectId } = await setup()
    const other = await createTestUser('gestor')
    const { id } = await createApproval(
      { projectId, title: 'Logo', approverUserId: other.id },
      gestor,
    )

    await expect(
      decideApproval({ approvalId: id, version: 1, decision: 'approved' }, gestor),
    ).rejects.toThrow(/outra pessoa/)
    await expect(
      decideApproval({ approvalId: id, version: 1, decision: 'approved' }, other),
    ).resolves.toBeUndefined()
  })

  it('quando o cliente aprova, a equipe registra a decisão — inclusive quem enviou', async () => {
    const { gestor, client, projectId } = await setup()
    const { id } = await createApproval(
      { projectId, title: 'Logo', approverContactId: client.contactId },
      gestor,
    )

    await decideApproval({ approvalId: id, version: 1, decision: 'approved' }, gestor)
    const [row] = await db
      .select({ status: approvals.status })
      .from(approvals)
      .where(eq(approvals.id, id))
    expect(row?.status).toBe('approved')
  })
})

describe('material e histórico', () => {
  it('material de versão decidida fica travado — não entra nem sai arquivo', async () => {
    const { gestor, designer, projectId } = await setup()
    const designerContext = await contextFor(designer)
    const gestorContext = await contextFor(gestor)

    const { id, versionId } = await createApproval(
      { projectId, title: 'Layout', approverUserId: gestor.id },
      designer,
    )
    const target = { type: 'approval_version', id: versionId } as const
    const file = await uploadFile(designerContext, { target, name: 'layout-v1.pdf', bytes: pdf() })

    await decideApproval(
      { approvalId: id, version: 1, decision: 'changes_requested', comment: 'Ajustar.' },
      gestor,
    )

    await expect(
      uploadFile(designerContext, { target, name: 'extra.pdf', bytes: pdf() }),
    ).rejects.toBeInstanceOf(BusinessRuleError)
    await expect(deleteFile(gestorContext, file.id)).rejects.toBeInstanceOf(BusinessRuleError)

    const detail = await getApprovalDetail(designerContext, id)
    const v1 = detail?.versions.find((version) => version.version === 1)
    expect(v1?.files?.files.map((item) => item.name)).toEqual(['layout-v1.pdf'])
    expect(v1?.files?.canUpload).toBe(false)
  })

  it('só a equipe do projeto anexa material', async () => {
    const { gestor, projectId } = await setup()
    const outsider = await createTestUser('design')
    const { versionId } = await createApproval(
      { projectId, title: 'Logo', approverUserId: gestor.id },
      gestor,
    )

    await expect(
      uploadFile(await contextFor(outsider), {
        target: { type: 'approval_version', id: versionId },
        name: 'a.pdf',
        bytes: pdf(),
      }),
    ).rejects.toThrow(/equipe do projeto/)
  })
})

describe('cancelamento e conclusão do projeto', () => {
  it('cancelar exige motivo e encerra a versão em análise', async () => {
    const { gestor, designer, projectId } = await setup()
    const { id } = await createApproval(
      { projectId, title: 'Logo', approverUserId: gestor.id },
      designer,
    )

    await expect(cancelApproval(id, ' ', designer)).rejects.toBeInstanceOf(ValidationError)
    await cancelApproval(id, 'Cliente desistiu da peça.', designer)

    expect(await versionRow(id, 1)).toMatchObject({
      status: 'cancelled',
      decisionComment: 'Cancelada: Cliente desistiu da peça.',
    })
    await expect(cancelApproval(id, 'de novo', designer)).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('projeto não conclui com aprovação aguardando ajustes; conclui depois de resolvida', async () => {
    const { gestor, designer, projectId } = await setup()
    const { id } = await createApproval(
      { projectId, title: 'Logo', approverUserId: gestor.id },
      designer,
    )
    await decideApproval(
      { approvalId: id, version: 1, decision: 'changes_requested', comment: 'Cor.' },
      gestor,
    )

    await changeProjectStatus({ projectId, status: 'in_progress' }, gestor)
    await expect(changeProjectStatus({ projectId, status: 'completed' }, gestor)).rejects.toThrow(
      /aprova/,
    )

    await submitNewVersion({ approvalId: id, notes: 'Cor ajustada.' }, designer)
    await decideApproval({ approvalId: id, version: 2, decision: 'approved' }, gestor)

    await expect(
      changeProjectStatus({ projectId, status: 'completed' }, gestor),
    ).resolves.toBeUndefined()
  })
})

describe('ids vindos da URL', () => {
  it('id malformado é "não encontrado", não erro de banco', async () => {
    const context = await contextFor(await createTestUser('gestor'))
    const { getProjectDetail } = await import('@/server/modules/projects/queries')
    const { getTaskDetail } = await import('@/server/modules/tasks/queries')
    const { getContractDetail } = await import('@/server/modules/contracts/queries')
    const { getClientDetail } = await import('@/server/modules/clients/queries')
    const { getOpportunityDetail } = await import('@/server/modules/crm/queries')

    for (const id of ['xyz', "1' or '1'='1", '']) {
      await expect(getApprovalDetail(context, id)).resolves.toBeNull()
      await expect(getProjectDetail(context, id)).resolves.toBeNull()
      await expect(getTaskDetail(context, id)).resolves.toBeNull()
      await expect(getContractDetail(context, id)).resolves.toBeNull()
      await expect(getClientDetail(id)).resolves.toBeNull()
      await expect(getOpportunityDetail(context, id)).resolves.toBeNull()
    }
  })
})
