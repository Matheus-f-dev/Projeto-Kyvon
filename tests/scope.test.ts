import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import {
  contractAddendums,
  contracts,
  notifications,
  projects,
  scopeChanges,
} from '@/server/db/schema'
import { BusinessRuleError } from '@/server/errors'
import { createProject } from '@/server/modules/projects/service'
import {
  getScopeChangeDetail,
  listProjectScopeChanges,
  summarizeApproved,
} from '@/server/modules/scope/queries'
import {
  createScopeChange,
  decideScopeChange,
  generateAddendumFromScope,
  markScopeImplemented,
  returnScopeToAnalysis,
  saveScopeAnalysis,
  submitScopeForApproval,
} from '@/server/modules/scope/service'
import { decideScopeChangeSchema, scopeAnalysisSchema } from '@/shared/schemas/scope'

import { contextFor, createTestClient, createTestUser, unique } from './helpers'

/**
 * Mudança de escopo (regra 8): o escopo do contrato nunca é editado. A mudança
 * é medida, decidida e, se aprovada, pode ajustar o prazo do projeto e gerar
 * um aditivo em rascunho — vinculado, e só um.
 */

const CONTRACT_SCOPE = 'Site institucional com 5 páginas.'

async function setup(options: { withContract?: boolean; endDate?: string } = {}) {
  const gestor = await createTestUser('gestor')
  const dev = await createTestUser('dev')
  const client = await createTestClient(gestor.id)

  let contractId: string | null = null
  if (options.withContract !== false) {
    const [contract] = await db
      .insert(contracts)
      .values({
        code: unique('CTR').slice(0, 20),
        title: 'Contrato de teste',
        clientId: client.id,
        status: 'active',
        scope: CONTRACT_SCOPE,
        totalValue: '30000.00',
        startDate: '2026-01-01',
        endDate: options.endDate ?? '2026-12-31',
      })
      .returning({ id: contracts.id })
    contractId = contract?.id ?? null
  }

  const project = await createProject(
    {
      name: unique('Projeto'),
      clientId: client.id,
      contractId,
      ownerId: gestor.id,
      dueDate: '2026-10-30',
    },
    gestor,
  )
  return { gestor, dev, contractId, projectId: project.id }
}

const analysis = (overrides: Partial<Record<string, string>> = {}) =>
  scopeAnalysisSchema.parse({
    impactDescription: 'Conector novo e rotina de sincronização.',
    estimatedHours: '64',
    deadlineImpactDays: '14',
    financialImpact: '19.200,00',
    ...overrides,
  })

async function approvedChange(options: Parameters<typeof setup>[0] = {}, analysisOverrides = {}) {
  const ctx = await setup(options)
  const { id } = await createScopeChange(
    {
      projectId: ctx.projectId,
      title: 'Integração com marketplace',
      description: 'Pedido do cliente.',
      origin: 'client',
    },
    ctx.dev,
  )
  await saveScopeAnalysis(id, analysis(analysisOverrides), ctx.dev, { preserveFinancials: false })
  await submitScopeForApproval(id, ctx.dev)
  await decideScopeChange(
    decideScopeChangeSchema.parse({ scopeChangeId: id, decision: 'approved' }),
    ctx.gestor,
  )
  return { ...ctx, id }
}

async function row(id: string) {
  const [found] = await db.select().from(scopeChanges).where(eq(scopeChanges.id, id))
  return found
}

describe('registro e análise', () => {
  it('herda o contrato do projeto e avisa o responsável', async () => {
    const { gestor, dev, contractId, projectId } = await setup()

    const { id, code } = await createScopeChange(
      { projectId, title: 'Blog', description: 'Cliente quer um blog.', origin: 'client' },
      dev,
    )

    expect(code).toMatch(/^ESC-/)
    expect(await row(id)).toMatchObject({ status: 'requested', contractId, requestedBy: dev.id })

    const [notification] = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(eq(notifications.entityId, id), eq(notifications.type, 'scope_change_requested')))
    expect(notification?.userId).toBe(gestor.id)
  })

  it('horas e prazo são obrigatórios na análise — zero vale, vazio não', () => {
    expect(
      scopeAnalysisSchema.safeParse({
        impactDescription: 'Nenhum impacto relevante',
        estimatedHours: '',
        deadlineImpactDays: '0',
      }).success,
    ).toBe(false)
    expect(
      scopeAnalysisSchema.safeParse({
        impactDescription: 'Nenhum impacto relevante',
        estimatedHours: '0',
        deadlineImpactDays: '0',
      }).success,
    ).toBe(true)
  })

  it('salvar a análise inicia a análise; enviar exige análise completa', async () => {
    const { dev, projectId } = await setup()
    const { id } = await createScopeChange(
      { projectId, title: 'Blog', description: 'Pedido.', origin: 'client' },
      dev,
    )

    await expect(submitScopeForApproval(id, dev)).rejects.toBeInstanceOf(BusinessRuleError)

    await saveScopeAnalysis(id, analysis(), dev, { preserveFinancials: false })
    expect(await row(id)).toMatchObject({
      status: 'under_analysis',
      analyzedBy: dev.id,
      estimatedHours: '64.00',
      deadlineImpactDays: 14,
      financialImpact: '19200.00',
    })

    await submitScopeForApproval(id, dev)
    expect((await row(id))?.status).toBe('awaiting_approval')

    // Aguardando aprovação, a análise não muda sem voltar para análise.
    await expect(
      saveScopeAnalysis(id, analysis(), dev, { preserveFinancials: false }),
    ).rejects.toThrow(/Volte-a/)
    await returnScopeToAnalysis(id, dev)
    expect((await row(id))?.status).toBe('under_analysis')
  })

  it('quem não vê valores não altera o impacto financeiro', async () => {
    const { dev, gestor, projectId } = await setup()
    const { id } = await createScopeChange(
      { projectId, title: 'Blog', description: 'Pedido.', origin: 'client' },
      dev,
    )
    await saveScopeAnalysis(id, analysis({ financialImpact: '5.000,00' }), gestor, {
      preserveFinancials: false,
    })

    await saveScopeAnalysis(id, analysis({ financialImpact: '', estimatedHours: '80' }), dev, {
      preserveFinancials: true,
    })
    expect(await row(id)).toMatchObject({ financialImpact: '5000.00', estimatedHours: '80.00' })

    // E não o vê na leitura.
    const devDetail = await getScopeChangeDetail(await contextFor(dev), id)
    expect(devDetail).toMatchObject({ financialImpact: null, financialRestricted: true })
    const gestorDetail = await getScopeChangeDetail(await contextFor(gestor), id)
    expect(gestorDetail?.financialImpact).toBe('5000.00')
  })
})

describe('decisão', () => {
  it('aprovar exige análise enviada; recusar exige motivo', async () => {
    const { dev, gestor, projectId } = await setup()
    const { id } = await createScopeChange(
      { projectId, title: 'Blog', description: 'Pedido.', origin: 'client' },
      dev,
    )

    await expect(
      decideScopeChange(
        decideScopeChangeSchema.parse({ scopeChangeId: id, decision: 'approved' }),
        gestor,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError)

    expect(
      decideScopeChangeSchema.safeParse({ scopeChangeId: id, decision: 'rejected' }).success,
    ).toBe(false)

    await decideScopeChange(
      decideScopeChangeSchema.parse({
        scopeChangeId: id,
        decision: 'rejected',
        comment: 'Fora da estratégia do cliente.',
      }),
      gestor,
    )
    expect(await row(id)).toMatchObject({
      status: 'rejected',
      decisionComment: 'Fora da estratégia do cliente.',
    })

    // Recusada é final.
    await expect(markScopeImplemented(id, gestor)).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('aprovada, o escopo do contrato continua intacto', async () => {
    const { contractId } = await approvedChange()
    const [contract] = await db
      .select({ scope: contracts.scope })
      .from(contracts)
      .where(eq(contracts.id, contractId!))
    expect(contract?.scope).toBe(CONTRACT_SCOPE)
  })

  it('ajusta o prazo do projeto só quando pedido', async () => {
    const ctx = await setup()
    const create = () =>
      createScopeChange(
        { projectId: ctx.projectId, title: 'X', description: 'Pedido.', origin: 'client' },
        ctx.dev,
      )

    const first = await create()
    await saveScopeAnalysis(first.id, analysis(), ctx.dev, { preserveFinancials: false })
    await submitScopeForApproval(first.id, ctx.dev)
    await decideScopeChange(
      decideScopeChangeSchema.parse({ scopeChangeId: first.id, decision: 'approved' }),
      ctx.gestor,
    )

    const [unchanged] = await db
      .select({ dueDate: projects.dueDate })
      .from(projects)
      .where(eq(projects.id, ctx.projectId))
    expect(unchanged?.dueDate).toBe('2026-10-30')

    const second = await create()
    await saveScopeAnalysis(second.id, analysis(), ctx.dev, { preserveFinancials: false })
    await submitScopeForApproval(second.id, ctx.dev)
    await decideScopeChange(
      decideScopeChangeSchema.parse({
        scopeChangeId: second.id,
        decision: 'approved',
        applyDeadline: 'on',
      }),
      ctx.gestor,
    )

    const [moved] = await db
      .select({ dueDate: projects.dueDate })
      .from(projects)
      .where(eq(projects.id, ctx.projectId))
    expect(moved?.dueDate).toBe('2026-11-13')
  })

  it('soma o impacto aprovado e esconde o valor de quem não vê valores', async () => {
    const { projectId, dev, gestor } = await approvedChange()
    const { id: rejected } = await createScopeChange(
      { projectId, title: 'Y', description: 'Pedido.', origin: 'internal' },
      dev,
    )
    await decideScopeChange(
      decideScopeChangeSchema.parse({
        scopeChangeId: rejected,
        decision: 'rejected',
        comment: 'Não.',
      }),
      gestor,
    )

    const forGestor = summarizeApproved(
      await listProjectScopeChanges(await contextFor(gestor), projectId),
    )
    expect(forGestor).toEqual({ approvedCount: 1, hours: 64, days: 14, value: 19200 })

    const forDev = summarizeApproved(
      await listProjectScopeChanges(await contextFor(dev), projectId),
    )
    expect(forDev.value).toBeNull()
  })
})

describe('aditivo', () => {
  it('gera um aditivo de valor em rascunho, com novo término, vinculado à mudança', async () => {
    const { id, gestor, contractId } = await approvedChange({ endDate: '2026-12-31' })

    const { addendumId, code } = await generateAddendumFromScope(id, gestor)

    const [addendum] = await db
      .select()
      .from(contractAddendums)
      .where(eq(contractAddendums.id, addendumId))
    expect(addendum).toMatchObject({
      contractId,
      type: 'value',
      status: 'draft',
      valueDelta: '19200.00',
      newEndDate: '2027-01-14',
    })
    expect(addendum?.title).toContain('Integração com marketplace')
    expect(code).toBe(addendum?.code)
    expect((await row(id))?.addendumId).toBe(addendumId)

    // Um aditivo por mudança.
    await expect(generateAddendumFromScope(id, gestor)).rejects.toThrow(/já tem aditivo/)
  })

  it('sem impacto financeiro nem de prazo, o aditivo é de escopo', async () => {
    const { id, gestor } = await approvedChange(
      {},
      { financialImpact: '', deadlineImpactDays: '0' },
    )
    const { addendumId } = await generateAddendumFromScope(id, gestor)
    const [addendum] = await db
      .select({ type: contractAddendums.type })
      .from(contractAddendums)
      .where(eq(contractAddendums.id, addendumId))
    expect(addendum?.type).toBe('scope')
  })

  it('exige mudança aprovada e projeto com contrato', async () => {
    const { dev, gestor, projectId } = await setup()
    const { id } = await createScopeChange(
      { projectId, title: 'Blog', description: 'Pedido.', origin: 'client' },
      dev,
    )
    await expect(generateAddendumFromScope(id, gestor)).rejects.toThrow(/aprovadas/)

    const noContract = await approvedChange({ withContract: false })
    await expect(generateAddendumFromScope(noContract.id, noContract.gestor)).rejects.toThrow(
      /contrato/,
    )
  })

  it('implementada ainda pode originar o aditivo', async () => {
    const { id, gestor } = await approvedChange()
    await markScopeImplemented(id, gestor)
    expect((await row(id))?.implementedAt).toBeInstanceOf(Date)
    await expect(generateAddendumFromScope(id, gestor)).resolves.toMatchObject({
      code: expect.any(String),
    })
  })
})
