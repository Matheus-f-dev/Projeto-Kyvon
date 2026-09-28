import { and, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import {
  approvals,
  contracts,
  projectMembers,
  projectStages,
  taskChecklistItems,
  taskDependencies,
  tasks,
} from '@/server/db/schema'
import { BusinessRuleError } from '@/server/errors'
import {
  changeProjectStatus,
  createProject,
  recalculateProgress,
  registerLaunch,
} from '@/server/modules/projects/service'
import { addDaysISO, todayISO } from '@/shared/dates'

import { createTestClient, createTestUser, getTemplateId, unique } from './helpers'

/**
 * Criação de projeto por template e as invariantes de status.
 *
 * É o trecho mais delicado do domínio: uma transação que cria etapas, tarefas,
 * checklists e dependências de uma vez, e três regras de negócio que impedem
 * estados incoerentes.
 */

describe('criação de projeto a partir de template', () => {
  it('gera etapas, tarefas, checklists e dependências em uma transação', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const templateId = await getTemplateId('website-institucional')

    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, templateId, ownerId: actor.id },
      actor,
    )

    expect(project.code).toMatch(/^PRJ-\d{4}$/)
    expect(project.tasksCreated).toBeGreaterThan(0)

    const stages = await db
      .select()
      .from(projectStages)
      .where(eq(projectStages.projectId, project.id))
      .orderBy(projectStages.position)

    expect(stages.map((stage) => stage.name)).toEqual([
      'Descoberta',
      'Estratégia',
      'Design',
      'Desenvolvimento',
      'Lançamento',
    ])

    const created = await db.select().from(tasks).where(eq(tasks.projectId, project.id))
    expect(created).toHaveLength(project.tasksCreated)

    // Toda tarefa pertence a uma etapa deste projeto — nenhuma ficou órfã.
    const stageIds = new Set(stages.map((stage) => stage.id))
    expect(created.every((task) => task.stageId && stageIds.has(task.stageId))).toBe(true)

    const taskIds = created.map((task) => task.id)

    const checklists = await db
      .select()
      .from(taskChecklistItems)
      .where(inArray(taskChecklistItems.taskId, taskIds))
    expect(checklists.length).toBeGreaterThan(0)

    const dependencies = await db
      .select()
      .from(taskDependencies)
      .where(inArray(taskDependencies.taskId, taskIds))
    expect(dependencies.length).toBeGreaterThan(0)

    // Dependências apontam para tarefas do próprio projeto, não do template.
    const taskIdSet = new Set(taskIds)
    expect(
      dependencies.every(
        (dependency) =>
          taskIdSet.has(dependency.taskId) && taskIdSet.has(dependency.dependsOnTaskId),
      ),
    ).toBe(true)
  })

  it('ordena as tarefas por etapa e não pela posição interna do template', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const templateId = await getTemplateId('website-institucional')

    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, templateId, ownerId: actor.id },
      actor,
    )

    const rows = await db
      .select({ position: tasks.position, stageId: tasks.stageId })
      .from(tasks)
      .where(eq(tasks.projectId, project.id))
      .orderBy(tasks.position)

    const stages = await db
      .select({ id: projectStages.id, position: projectStages.position })
      .from(projectStages)
      .where(eq(projectStages.projectId, project.id))

    const stagePosition = new Map(stages.map((stage) => [stage.id, stage.position]))

    // A posição das etapas nunca regride ao percorrer as tarefas em ordem.
    let previous = -1
    for (const row of rows) {
      const current = stagePosition.get(row.stageId ?? '') ?? 0
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }

    // E as posições formam uma sequência global, sem repetição.
    expect(new Set(rows.map((row) => row.position)).size).toBe(rows.length)
  })

  it('define a primeira etapa como etapa corrente', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const templateId = await getTemplateId('landing-page')

    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, templateId, ownerId: actor.id },
      actor,
    )

    const stored = await db.query.projects.findFirst({
      where: (table, { eq: equals }) => equals(table.id, project.id),
      columns: { currentStageId: true },
    })

    const [first] = await db
      .select({ id: projectStages.id })
      .from(projectStages)
      .where(eq(projectStages.projectId, project.id))
      .orderBy(projectStages.position)
      .limit(1)

    expect(stored?.currentStageId).toBe(first?.id)
  })

  it('calcula o prazo das tarefas a partir da data de início do projeto', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const templateId = await getTemplateId('landing-page')
    const startDate = addDaysISO(todayISO(), 10)

    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, templateId, ownerId: actor.id, startDate },
      actor,
    )

    const rows = await db
      .select({ dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.projectId, project.id))
      .orderBy(tasks.position)

    // A primeira tarefa da landing vence 2 dias após o início.
    expect(rows[0]?.dueDate).toBe(addDaysISO(startDate, 2))
  })

  it('inclui o responsável na equipe do projeto', async () => {
    const owner = await createTestUser('design')
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)

    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: owner.id },
      actor,
    )

    const members = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, project.id))

    expect(members.map((member) => member.userId)).toContain(owner.id)
  })

  it('deriva o cliente do contrato, ignorando o informado no formulário', async () => {
    const actor = await createTestUser('gestor')
    const contractClient = await createTestClient(actor.id)
    const outroCliente = await createTestClient(actor.id)

    const [contract] = await db
      .insert(contracts)
      .values({
        code: unique('CTR').slice(0, 20),
        title: 'Contrato de teste',
        clientId: contractClient.id,
        status: 'active',
      })
      .returning({ id: contracts.id })

    const project = await createProject(
      {
        name: unique('Projeto'),
        // Cliente propositalmente errado: o contrato precisa prevalecer.
        clientId: outroCliente.id,
        contractId: contract?.id ?? null,
        ownerId: actor.id,
      },
      actor,
    )

    const stored = await db.query.projects.findFirst({
      where: (table, { eq: equals }) => equals(table.id, project.id),
      columns: { clientId: true },
    })

    expect(stored?.clientId).toBe(contractClient.id)
  })

  it('recusa criar projeto a partir de contrato cancelado', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)

    const [contract] = await db
      .insert(contracts)
      .values({
        code: unique('CTR').slice(0, 20),
        title: 'Contrato cancelado',
        clientId: client.id,
        status: 'cancelled',
      })
      .returning({ id: contracts.id })

    await expect(
      createProject(
        {
          name: unique('Projeto'),
          clientId: client.id,
          contractId: contract?.id ?? null,
          ownerId: actor.id,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })
})

describe('progresso do projeto', () => {
  it('reflete a proporção de tarefas concluídas', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const templateId = await getTemplateId('landing-page')

    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, templateId, ownerId: actor.id },
      actor,
    )

    const created = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, project.id))
      .orderBy(tasks.position)

    const half = Math.floor(created.length / 2)
    await db
      .update(tasks)
      .set({ status: 'done', completedAt: new Date() })
      .where(
        inArray(
          tasks.id,
          created.slice(0, half).map((task) => task.id),
        ),
      )

    const progress = await recalculateProgress(project.id)

    expect(progress).toBe(Math.round((half / created.length) * 100))
  })

  it('ignora tarefas canceladas no cálculo', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const templateId = await getTemplateId('landing-page')

    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, templateId, ownerId: actor.id },
      actor,
    )

    const created = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, project.id))
      .orderBy(tasks.position)

    const first = created[0]
    const rest = created.slice(1)
    expect(first).toBeDefined()

    // Uma cancelada, o resto concluído → 100%, não "quase".
    await db
      .update(tasks)
      .set({ status: 'cancelled' })
      .where(eq(tasks.id, first?.id ?? ''))
    await db
      .update(tasks)
      .set({ status: 'done', completedAt: new Date() })
      .where(
        inArray(
          tasks.id,
          rest.map((task) => task.id),
        ),
      )

    expect(await recalculateProgress(project.id)).toBe(100)
  })
})

describe('mudança de status do projeto', () => {
  it('exige motivo para bloquear', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
      actor,
    )

    await expect(
      changeProjectStatus({ projectId: project.id, status: 'blocked' }, actor),
    ).rejects.toBeInstanceOf(BusinessRuleError)

    await expect(
      changeProjectStatus(
        {
          projectId: project.id,
          status: 'blocked',
          blockedReason: 'Cliente não liberou o acesso ao servidor.',
          blockedOwnerId: actor.id,
        },
        actor,
      ),
    ).resolves.toBeUndefined()
  })

  it('limpa os dados de bloqueio ao sair do status bloqueado', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
      actor,
    )

    await changeProjectStatus(
      {
        projectId: project.id,
        status: 'blocked',
        blockedReason: 'Aguardando acesso',
        blockedOwnerId: actor.id,
      },
      actor,
    )
    await changeProjectStatus({ projectId: project.id, status: 'in_progress' }, actor)

    const stored = await db.query.projects.findFirst({
      where: (table, { eq: equals }) => equals(table.id, project.id),
      columns: { status: true, blockedReason: true, blockedSince: true },
    })

    expect(stored?.status).toBe('in_progress')
    expect(stored?.blockedReason).toBeNull()
    expect(stored?.blockedSince).toBeNull()
  })

  it('recusa concluir direto do planejamento', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
      actor,
    )

    await expect(
      changeProjectStatus({ projectId: project.id, status: 'completed' }, actor),
    ).rejects.toThrow(/não pode passar/)
  })

  it('exige motivo para cancelar e trata cancelado como terminal', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
      actor,
    )

    await expect(
      changeProjectStatus({ projectId: project.id, status: 'cancelled' }, actor),
    ).rejects.toThrow(/motivo do cancelamento/)

    await changeProjectStatus(
      {
        projectId: project.id,
        status: 'cancelled',
        cancellationReason: 'Cliente encerrou a empresa.',
      },
      actor,
    )

    await expect(
      changeProjectStatus({ projectId: project.id, status: 'in_progress' }, actor),
    ).rejects.toThrow(/não pode passar/)
  })

  it('exige quem vai resolver o bloqueio', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
      actor,
    )

    await expect(
      changeProjectStatus(
        { projectId: project.id, status: 'blocked', blockedReason: 'Sem acesso ao servidor' },
        actor,
      ),
    ).rejects.toThrow(/quem vai resolvê-lo/)
  })

  it('impede concluir projeto com aprovação pendente', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
      actor,
    )

    await db.insert(approvals).values({
      code: unique('APR').slice(0, 20),
      title: 'Material aguardando cliente',
      projectId: project.id,
      clientId: client.id,
      status: 'pending',
      requestedBy: actor.id,
    })

    // Concluir só faz sentido a partir da execução — não direto do planejamento.
    await changeProjectStatus({ projectId: project.id, status: 'in_progress' }, actor)

    await expect(
      changeProjectStatus({ projectId: project.id, status: 'completed' }, actor),
    ).rejects.toThrow(/aprovações pendentes/)

    // Resolvida a aprovação, a conclusão passa.
    await db
      .update(approvals)
      .set({ status: 'approved', decidedAt: new Date() })
      .where(and(eq(approvals.projectId, project.id), eq(approvals.status, 'pending')))

    await expect(
      changeProjectStatus({ projectId: project.id, status: 'completed' }, actor),
    ).resolves.toBeUndefined()
  })
})

describe('lançamento', () => {
  it('registra a data e calcula o fim do suporte a partir dela', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)

    const [contract] = await db
      .insert(contracts)
      .values({
        code: unique('CTR').slice(0, 20),
        title: 'Contrato com suporte',
        clientId: client.id,
        status: 'active',
        supportDays: 90,
      })
      .returning({ id: contracts.id })

    const project = await createProject(
      {
        name: unique('Projeto'),
        clientId: client.id,
        contractId: contract?.id ?? null,
        ownerId: actor.id,
      },
      actor,
    )

    await registerLaunch(project.id, actor)

    const stored = await db.query.contracts.findFirst({
      where: (table, { eq: equals }) => equals(table.id, contract?.id ?? ''),
      columns: { supportEndsAt: true },
    })

    expect(stored?.supportEndsAt).toBe(addDaysISO(todayISO(), 90))
  })

  it('recusa lançar duas vezes', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
      actor,
    )

    await registerLaunch(project.id, actor)

    await expect(registerLaunch(project.id, actor)).rejects.toBeInstanceOf(BusinessRuleError)
  })
})
