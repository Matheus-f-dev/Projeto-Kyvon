import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import { notifications, projectStages, projects, taskWatchers, tasks } from '@/server/db/schema'
import { BusinessRuleError } from '@/server/errors'
import { createProject } from '@/server/modules/projects/service'
import {
  addComment,
  addDependency,
  changeTaskStatus,
  createTask,
  isInvolvedInTask,
} from '@/server/modules/tasks/service'

import { createTestClient, createTestUser, getTemplateId, unique } from './helpers'

/**
 * Regras de tarefa: bloqueio justificado (regra 5), dependência antes da
 * conclusão (regra 6), e as automações que poupam trabalho manual — projeto
 * sai do planejamento sozinho, etapa fecha e avança sozinha.
 */

async function emptyProject() {
  const actor = await createTestUser('gestor')
  const client = await createTestClient(actor.id)
  const project = await createProject(
    { name: unique('Projeto'), clientId: client.id, ownerId: actor.id },
    actor,
  )
  return { actor, projectId: project.id }
}

async function templatedProject() {
  const actor = await createTestUser('gestor')
  const client = await createTestClient(actor.id)
  const templateId = await getTemplateId('landing-page')
  const project = await createProject(
    { name: unique('Projeto'), clientId: client.id, ownerId: actor.id, templateId },
    actor,
  )
  const rows = await db
    .select({ id: tasks.id, stageId: tasks.stageId, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.projectId, project.id))
    .orderBy(tasks.position)
  return { actor, projectId: project.id, tasks: rows }
}

describe('criação de tarefa', () => {
  it('gera código e avisa o responsável', async () => {
    const { actor, projectId } = await emptyProject()
    const designer = await createTestUser('design')

    const created = await createTask(
      {
        projectId,
        title: 'Wireframe da home',
        assigneeId: designer.id,
        priority: 'high',
        type: 'design',
      },
      actor,
    )

    expect(created.code).toMatch(/^TSK-\d{5}$/)

    const [notification] = await db
      .select({ type: notifications.type, link: notifications.link })
      .from(notifications)
      .where(and(eq(notifications.userId, designer.id), eq(notifications.entityId, created.id)))

    expect(notification?.type).toBe('task_assigned')
    expect(notification?.link).toBe(`/tarefas?tarefa=${created.id}`)
  })

  it('recusa criar tarefa em projeto concluído', async () => {
    const { actor, projectId } = await emptyProject()
    await db.update(projects).set({ status: 'completed' }).where(eq(projects.id, projectId))

    await expect(
      createTask({ projectId, title: 'Tarde demais', priority: 'medium', type: 'generic' }, actor),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })
})

describe('bloqueio', () => {
  it('exige motivo e responsável pela resolução', async () => {
    const { actor, projectId } = await emptyProject()
    const task = await createTask(
      { projectId, title: 'Deploy', priority: 'medium', type: 'deploy' },
      actor,
    )

    await expect(
      changeTaskStatus({ taskId: task.id, status: 'blocked' }, actor),
    ).rejects.toBeInstanceOf(BusinessRuleError)

    await changeTaskStatus(
      {
        taskId: task.id,
        status: 'blocked',
        blockedReason: 'Sem acesso ao servidor',
        blockedOwnerId: actor.id,
      },
      actor,
    )

    const stored = await db.query.tasks.findFirst({ where: eq(tasks.id, task.id) })
    expect(stored?.status).toBe('blocked')
    expect(stored?.blockedSince).toBeInstanceOf(Date)
  })

  it('limpa o motivo ao desbloquear', async () => {
    const { actor, projectId } = await emptyProject()
    const task = await createTask(
      { projectId, title: 'Deploy', priority: 'medium', type: 'deploy' },
      actor,
    )

    await changeTaskStatus(
      {
        taskId: task.id,
        status: 'blocked',
        blockedReason: 'Aguardando DNS',
        blockedOwnerId: actor.id,
      },
      actor,
    )
    await changeTaskStatus({ taskId: task.id, status: 'in_progress' }, actor)

    const stored = await db.query.tasks.findFirst({ where: eq(tasks.id, task.id) })
    expect(stored?.blockedReason).toBeNull()
    expect(stored?.blockedOwnerId).toBeNull()
  })
})

describe('dependências', () => {
  it('impede concluir antes da predecessora', async () => {
    const { actor, projectId } = await emptyProject()
    const dev = await createTask(
      { projectId, title: 'Desenvolvimento', priority: 'medium', type: 'development' },
      actor,
    )
    const qa = await createTask({ projectId, title: 'QA', priority: 'medium', type: 'qa' }, actor)
    await addDependency(qa.id, dev.id)

    await expect(changeTaskStatus({ taskId: qa.id, status: 'done' }, actor)).rejects.toThrow(
      /Desenvolvimento/,
    )

    await changeTaskStatus({ taskId: dev.id, status: 'done' }, actor)
    await expect(
      changeTaskStatus({ taskId: qa.id, status: 'done' }, actor),
    ).resolves.toBeUndefined()
  })

  it('recusa ciclo entre tarefas', async () => {
    const { actor, projectId } = await emptyProject()
    const a = await createTask(
      { projectId, title: 'A', priority: 'medium', type: 'generic' },
      actor,
    )
    const b = await createTask(
      { projectId, title: 'B', priority: 'medium', type: 'generic' },
      actor,
    )
    const c = await createTask(
      { projectId, title: 'C', priority: 'medium', type: 'generic' },
      actor,
    )

    await addDependency(b.id, a.id)
    await addDependency(c.id, b.id)

    // A → C fecharia A → C → B → A.
    await expect(addDependency(a.id, c.id)).rejects.toThrow(/ciclo/)
  })

  it('recusa dependência entre projetos diferentes', async () => {
    const first = await emptyProject()
    const second = await emptyProject()
    const a = await createTask(
      { projectId: first.projectId, title: 'A', priority: 'medium', type: 'generic' },
      first.actor,
    )
    const b = await createTask(
      { projectId: second.projectId, title: 'B', priority: 'medium', type: 'generic' },
      second.actor,
    )

    await expect(addDependency(a.id, b.id)).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('recusa depender de si mesma', async () => {
    const { actor, projectId } = await emptyProject()
    const a = await createTask(
      { projectId, title: 'A', priority: 'medium', type: 'generic' },
      actor,
    )

    await expect(addDependency(a.id, a.id)).rejects.toBeInstanceOf(BusinessRuleError)
  })
})

describe('automações de projeto e etapa', () => {
  it('tira o projeto de planejamento quando o trabalho começa', async () => {
    const { actor, projectId } = await emptyProject()
    const task = await createTask(
      { projectId, title: 'Briefing', priority: 'medium', type: 'discovery' },
      actor,
    )

    await changeTaskStatus({ taskId: task.id, status: 'in_progress' }, actor)

    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
    expect(project?.status).toBe('in_progress')
  })

  it('fecha a etapa e avança a etapa corrente quando todas as tarefas terminam', async () => {
    const { actor, projectId, tasks: created } = await templatedProject()
    const firstStageId = created[0]?.stageId
    expect(firstStageId).toBeTruthy()

    const firstStageTasks = created.filter((task) => task.stageId === firstStageId)
    for (const task of firstStageTasks) {
      await changeTaskStatus({ taskId: task.id, status: 'done' }, actor)
    }

    const stage = await db.query.projectStages.findFirst({
      where: eq(projectStages.id, firstStageId as string),
    })
    expect(stage?.status).toBe('done')

    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
    const nextStageId = created.find((task) => task.stageId !== firstStageId)?.stageId
    expect(project?.currentStageId).toBe(nextStageId)
  })

  it('reabre a etapa quando uma tarefa concluída volta', async () => {
    const { actor, tasks: created } = await templatedProject()
    const firstStageId = created[0]?.stageId as string
    const firstStageTasks = created.filter((task) => task.stageId === firstStageId)

    for (const task of firstStageTasks) {
      await changeTaskStatus({ taskId: task.id, status: 'done' }, actor)
    }
    await changeTaskStatus({ taskId: firstStageTasks[0]!.id, status: 'in_progress' }, actor)

    const stage = await db.query.projectStages.findFirst({
      where: eq(projectStages.id, firstStageId),
    })
    expect(stage?.status).toBe('in_progress')
    expect(stage?.completedAt).toBeNull()
  })

  it('recalcula o progresso a cada conclusão', async () => {
    const { actor, projectId, tasks: created } = await templatedProject()

    await changeTaskStatus({ taskId: created[0]!.id, status: 'done' }, actor)

    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
    expect(project?.progress).toBe(Math.round((1 / created.length) * 100))
  })
})

describe('comentários e envolvimento', () => {
  it('avisa o responsável, não o autor, e torna o autor observador', async () => {
    const { actor, projectId } = await emptyProject()
    const dev = await createTestUser('dev')
    const task = await createTask(
      {
        projectId,
        title: 'Integração',
        assigneeId: dev.id,
        priority: 'medium',
        type: 'development',
      },
      actor,
    )

    const commenter = await createTestUser('design')
    await addComment(task.id, 'O layout mudou, confere a versão nova?', commenter)

    const toAssignee = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, dev.id), eq(notifications.type, 'task_commented')))
    const toAuthor = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, commenter.id), eq(notifications.type, 'task_commented')))

    expect(toAssignee).toHaveLength(1)
    expect(toAuthor).toHaveLength(0)

    const watcher = await db
      .select()
      .from(taskWatchers)
      .where(and(eq(taskWatchers.taskId, task.id), eq(taskWatchers.userId, commenter.id)))
    expect(watcher).toHaveLength(1)
  })

  it('distingue quem participa de quem está de fora', async () => {
    const { actor, projectId } = await emptyProject()
    const task = await createTask(
      { projectId, title: 'Tarefa', priority: 'medium', type: 'generic' },
      actor,
    )
    const outsider = await createTestUser('dev')

    expect(await isInvolvedInTask(task.id, actor.id)).toBe(true)
    expect(await isInvolvedInTask(task.id, outsider.id)).toBe(false)
  })
})
