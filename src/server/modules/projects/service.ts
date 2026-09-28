import { and, count, eq, inArray, sql } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode, nextCodes } from '@/server/db/codes'
import {
  approvals,
  contracts,
  projectMembers,
  projectStages,
  projectTemplateChecklistItems,
  projectTemplateStages,
  projectTemplateTaskDependencies,
  projectTemplateTasks,
  projectTemplates,
  projects,
  taskChecklistItems,
  taskDependencies,
  tasks,
  users,
} from '@/server/db/schema'
import { BusinessRuleError, NotFoundError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { notifyMany } from '@/server/modules/notifications/service'
import { addDaysISO, todayISO } from '@/shared/dates'
import { OPEN_APPROVAL_STATUSES, PROJECT_STATUS, PROJECT_TRANSITIONS } from '@/shared/domain'

/**
 * Regras de projeto.
 *
 * O ator é passado como `{ id, email }` em vez do `AuthContext` inteiro: assim
 * o mesmo service serve à Server Action (que já checou permissão), ao seed de
 * demonstração e aos testes de integração, sem cada um precisar forjar uma sessão.
 * A verificação de permissão é responsabilidade de quem chama — `actions.ts`.
 */

export interface Actor {
  id: string
  email: string
}

export interface CreateProjectInput {
  name: string
  clientId: string
  contractId?: string | null
  templateId?: string | null
  ownerId?: string | null
  description?: string | null
  startDate?: string | null
  dueDate?: string | null
  memberIds?: string[]
}

export interface CreateProjectResult {
  id: string
  code: string
  tasksCreated: number
}

export async function createProject(
  input: CreateProjectInput,
  actor: Actor,
): Promise<CreateProjectResult> {
  return db.transaction(async (tx) => {
    // Havendo contrato, o cliente vem dele — não da escolha do formulário
    // (regra 4 de product.md). É o que impede projeto e contrato divergirem.
    let clientId = input.clientId

    if (input.contractId) {
      const [contract] = await tx
        .select({ clientId: contracts.clientId, status: contracts.status })
        .from(contracts)
        .where(eq(contracts.id, input.contractId))
        .limit(1)

      if (!contract) throw new NotFoundError('Contrato')
      if (contract.status === 'cancelled') {
        throw new BusinessRuleError('Não é possível criar projeto a partir de contrato cancelado.')
      }

      clientId = contract.clientId
    }

    const code = await nextCode('project', tx)

    const [project] = await tx
      .insert(projects)
      .values({
        code,
        name: input.name,
        description: input.description ?? null,
        clientId,
        contractId: input.contractId ?? null,
        templateId: input.templateId ?? null,
        ownerId: input.ownerId ?? actor.id,
        createdBy: actor.id,
        startDate: input.startDate ?? todayISO(),
        dueDate: input.dueDate ?? null,
        status: 'planning',
      })
      .returning({ id: projects.id, name: projects.name })

    if (!project) throw new Error('Falha ao criar projeto.')

    const memberIds = new Set(input.memberIds ?? [])
    memberIds.add(input.ownerId ?? actor.id)

    await tx
      .insert(projectMembers)
      .values([...memberIds].map((userId) => ({ projectId: project.id, userId })))
      .onConflictDoNothing()

    let tasksCreated = 0
    if (input.templateId) {
      tasksCreated = await applyTemplate(project.id, input.templateId, actor, tx)
    }

    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'project',
        entityId: project.id,
        entityLabel: `${code} · ${project.name}`,
      },
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'project',
        entityId: project.id,
        entityLabel: project.name,
        projectId: project.id,
        clientId,
        summary: `criou o projeto ${project.name}`,
      },
      tx,
    )

    return { id: project.id, code, tasksCreated }
  })
}

/**
 * Instancia um template dentro do projeto.
 *
 * Tudo em uma transação: etapas, tarefas, checklists e dependências nascem
 * juntos ou nada nasce. Um template aplicado pela metade — com tarefas sem
 * etapa ou dependências apontando para o nada — seria pior que nenhum.
 *
 * Os ids são gerados na aplicação antes do INSERT, o que permite montar o mapa
 * "tarefa do template → tarefa real" sem ida e volta ao banco por linha.
 */
export async function applyTemplate(
  projectId: string,
  templateId: string,
  actor: Actor,
  tx: Database,
): Promise<number> {
  const [project] = await tx
    .select({ id: projects.id, startDate: projects.startDate, clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) throw new NotFoundError('Projeto')

  const [template] = await tx
    .select({ id: projectTemplates.id, name: projectTemplates.name })
    .from(projectTemplates)
    .where(eq(projectTemplates.id, templateId))
    .limit(1)

  if (!template) throw new NotFoundError('Template')

  const existingStages = await tx
    .select({ total: count() })
    .from(projectStages)
    .where(eq(projectStages.projectId, projectId))

  if ((existingStages[0]?.total ?? 0) > 0) {
    throw new BusinessRuleError('Este projeto já possui etapas. Aplique o template só uma vez.')
  }

  const templateStages = await tx
    .select()
    .from(projectTemplateStages)
    .where(eq(projectTemplateStages.templateId, templateId))
    .orderBy(projectTemplateStages.position)

  if (templateStages.length === 0) return 0

  const stageIds = templateStages.map((stage) => stage.id)

  const templateTasks = await tx
    .select()
    .from(projectTemplateTasks)
    .where(inArray(projectTemplateTasks.templateStageId, stageIds))
    .orderBy(projectTemplateTasks.position)

  const templateTaskIds = templateTasks.map((task) => task.id)

  const [templateChecklists, templateDependencies] = await Promise.all([
    templateTaskIds.length > 0
      ? tx
          .select()
          .from(projectTemplateChecklistItems)
          .where(inArray(projectTemplateChecklistItems.templateTaskId, templateTaskIds))
          .orderBy(projectTemplateChecklistItems.position)
      : Promise.resolve([]),
    templateTaskIds.length > 0
      ? tx
          .select()
          .from(projectTemplateTaskDependencies)
          .where(inArray(projectTemplateTaskDependencies.taskId, templateTaskIds))
      : Promise.resolve([]),
  ])

  // Perfil sugerido no template → uma pessoa concreta. Quando há mais de uma no
  // perfil, fica sem responsável: atribuir ao acaso geraria trabalho fantasma.
  const soleUserByRole = await resolveSoleUserByRole(tx)

  const stageIdMap = new Map<string, string>()
  const stageRows = templateStages.map((stage, index) => {
    const id = crypto.randomUUID()
    stageIdMap.set(stage.id, id)

    return {
      id,
      projectId,
      name: stage.name,
      description: stage.description,
      position: index,
      status: 'pending' as const,
    }
  })

  await tx.insert(projectStages).values(stageRows)

  const firstStageId = stageRows[0]?.id ?? null
  if (firstStageId) {
    await tx
      .update(projects)
      .set({ currentStageId: firstStageId })
      .where(eq(projects.id, projectId))
  }

  if (templateTasks.length === 0) {
    await tx.update(projects).set({ templateId }).where(eq(projects.id, projectId))
    return 0
  }

  const codes = await nextCodes('task', templateTasks.length, tx)
  const taskIdMap = new Map<string, string>()
  const baseDate = project.startDate ?? todayISO()

  /**
   * `position` no template é relativo à etapa — existe uma tarefa na posição 0
   * em cada uma. Ordenar por ela sem considerar a etapa embaralharia o projeto.
   * Aqui reordenamos por (etapa, posição) e gravamos uma posição global, que é
   * o que dá sentido à ordem inicial do quadro.
   */
  const stageOrder = new Map(templateStages.map((stage, index) => [stage.id, index]))
  const orderedTemplateTasks = [...templateTasks].sort((left, right) => {
    const leftStage = stageOrder.get(left.templateStageId) ?? 0
    const rightStage = stageOrder.get(right.templateStageId) ?? 0
    return leftStage === rightStage ? left.position - right.position : leftStage - rightStage
  })

  const taskRows = orderedTemplateTasks.map((task, index) => {
    const id = crypto.randomUUID()
    taskIdMap.set(task.id, id)

    return {
      id,
      code: codes[index] ?? `TSK-${index}`,
      title: task.title,
      description: task.description,
      projectId,
      stageId: stageIdMap.get(task.templateStageId) ?? null,
      status: 'todo' as const,
      priority: task.priority,
      type: task.type,
      assigneeId: task.defaultRoleId ? (soleUserByRole.get(task.defaultRoleId) ?? null) : null,
      createdBy: actor.id,
      dueDate: task.dueOffsetDays === null ? null : addDaysISO(baseDate, task.dueOffsetDays),
      estimateHours: task.estimateHours,
      position: index,
    }
  })

  await tx.insert(tasks).values(taskRows)

  if (templateChecklists.length > 0) {
    const checklistRows = templateChecklists
      .map((item) => {
        const taskId = taskIdMap.get(item.templateTaskId)
        return taskId ? { taskId, title: item.title, position: item.position } : null
      })
      .filter((row): row is { taskId: string; title: string; position: number } => row !== null)

    if (checklistRows.length > 0) {
      await tx.insert(taskChecklistItems).values(checklistRows)
    }
  }

  if (templateDependencies.length > 0) {
    const dependencyRows = templateDependencies
      .map((dependency) => {
        const taskId = taskIdMap.get(dependency.taskId)
        const dependsOnTaskId = taskIdMap.get(dependency.dependsOnTaskId)
        return taskId && dependsOnTaskId ? { taskId, dependsOnTaskId } : null
      })
      .filter((row): row is { taskId: string; dependsOnTaskId: string } => row !== null)

    if (dependencyRows.length > 0) {
      await tx.insert(taskDependencies).values(dependencyRows).onConflictDoNothing()
    }
  }

  await tx.update(projects).set({ templateId }).where(eq(projects.id, projectId))

  // Avisa quem recebeu tarefa — em um INSERT só, não um por tarefa.
  const assigned = taskRows.filter((task) => task.assigneeId)
  if (assigned.length > 0) {
    await notifyMany(
      assigned.map((task) => ({
        userId: task.assigneeId as string,
        type: 'task_assigned' as const,
        title: task.title,
        body: `Atribuída na criação do projeto a partir do template ${template.name}.`,
        actorId: actor.id,
        entityType: 'task' as const,
        entityId: task.id,
        link: `/tarefas?tarefa=${task.id}`,
      })),
      tx,
    )
  }

  await recordActivity(
    {
      actorId: actor.id,
      verb: 'created',
      entityType: 'project',
      entityId: projectId,
      entityLabel: template.name,
      projectId,
      clientId: project.clientId,
      summary: `aplicou o template ${template.name} (${taskRows.length} tarefas)`,
      metadata: { templateId, taskCount: taskRows.length, stageCount: stageRows.length },
    },
    tx,
  )

  await recalculateProgress(projectId, tx)

  return taskRows.length
}

/**
 * Perfil → usuário, quando o perfil tem exatamente uma pessoa.
 *
 * Com duas ou mais, o template deixa a tarefa sem responsável de propósito:
 * escolher sozinho criaria trabalho atribuído a quem não foi consultado.
 */
async function resolveSoleUserByRole(tx: Database): Promise<Map<string, string>> {
  const rows = await tx
    .select({ roleId: users.roleId, userId: users.id })
    .from(users)
    .where(and(eq(users.status, 'active'), sql`${users.deletedAt} is null`))

  const byRole = new Map<string, string[]>()
  for (const row of rows) {
    const list = byRole.get(row.roleId)
    if (list) list.push(row.userId)
    else byRole.set(row.roleId, [row.userId])
  }

  const result = new Map<string, string>()
  for (const [roleId, userIds] of byRole) {
    const only = userIds[0]
    if (userIds.length === 1 && only) result.set(roleId, only)
  }

  return result
}

/**
 * Recalcula o progresso a partir das tarefas.
 *
 * Tarefas canceladas saem do cálculo — contá-las como pendentes puniria o
 * projeto por ter descartado trabalho que não era necessário.
 */
export async function recalculateProgress(projectId: string, tx: Database = db): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<number>`count(*) filter (where ${tasks.status} <> 'cancelled')::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))

  const total = row?.total ?? 0
  const done = row?.done ?? 0
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)

  await tx.update(projects).set({ progress }).where(eq(projects.id, projectId))

  return progress
}

// ── Mudança de status ────────────────────────────────────────────────────────

export interface ChangeStatusInput {
  projectId: string
  status: (typeof projects.$inferSelect)['status']
  /** Obrigatório quando o status for `blocked`. */
  blockedReason?: string | null
  blockedOwnerId?: string | null
  cancellationReason?: string | null
}

export async function changeProjectStatus(input: ChangeStatusInput, actor: Actor): Promise<void> {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      status: projects.status,
      clientId: projects.clientId,
      ownerId: projects.ownerId,
    })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1)

  if (!project) throw new NotFoundError('Projeto')
  if (project.status === input.status) return

  if (!PROJECT_TRANSITIONS[project.status].includes(input.status)) {
    throw new BusinessRuleError(
      `Um projeto ${PROJECT_STATUS[project.status].label.toLowerCase()} não pode passar para ${PROJECT_STATUS[input.status].label.toLowerCase()}.`,
    )
  }

  // Bloqueio exige justificativa e dono da resolução (regra 5) — um bloqueio
  // sem responsável é só uma reclamação registrada.
  if (input.status === 'blocked' && (!input.blockedReason?.trim() || !input.blockedOwnerId)) {
    throw new BusinessRuleError('Informe o motivo do bloqueio e quem vai resolvê-lo.')
  }

  if (input.status === 'cancelled' && !input.cancellationReason?.trim()) {
    throw new BusinessRuleError('Informe o motivo do cancelamento.')
  }

  if (input.status === 'completed') {
    await assertReadyToComplete(input.projectId)
  }

  const now = new Date()
  const patch: Partial<typeof projects.$inferInsert> = {
    status: input.status,
    blockedReason: input.status === 'blocked' ? (input.blockedReason ?? null) : null,
    blockedSince: input.status === 'blocked' ? now : null,
    blockedOwnerId: input.status === 'blocked' ? (input.blockedOwnerId ?? null) : null,
    completedAt: input.status === 'completed' ? now : null,
    cancelledAt: input.status === 'cancelled' ? now : null,
    cancellationReason: input.status === 'cancelled' ? (input.cancellationReason ?? null) : null,
  }

  await db.transaction(async (tx) => {
    await tx.update(projects).set(patch).where(eq(projects.id, input.projectId))

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'project',
        entityId: project.id,
        entityLabel: `${project.code} · ${project.name}`,
        changes: diffChanges({ status: project.status }, { status: input.status }, ['status']),
      },
      tx,
    )

    const label = PROJECT_STATUS[input.status].label.toLowerCase()
    await recordActivity(
      {
        actorId: actor.id,
        verb:
          input.status === 'blocked'
            ? 'blocked'
            : input.status === 'completed'
              ? 'completed'
              : 'status_changed',
        entityType: 'project',
        entityId: project.id,
        entityLabel: project.name,
        projectId: project.id,
        clientId: project.clientId,
        summary:
          input.status === 'blocked'
            ? `bloqueou ${project.name}: ${input.blockedReason}`
            : `mudou ${project.name} para ${label}`,
        metadata: {
          from: project.status,
          to: input.status,
          reason: input.blockedReason ?? input.cancellationReason ?? null,
        },
      },
      tx,
    )

    const recipients = new Set(
      [project.ownerId, input.status === 'blocked' ? input.blockedOwnerId : null].filter(
        (userId): userId is string => Boolean(userId),
      ),
    )
    await notifyMany(
      [...recipients].map((userId) => ({
        userId,
        type:
          input.status === 'blocked'
            ? ('project_blocked' as const)
            : ('project_status_changed' as const),
        title:
          input.status === 'blocked'
            ? `Projeto bloqueado: ${project.name}`
            : `${project.name}: ${label}`,
        body: input.blockedReason ?? input.cancellationReason ?? null,
        actorId: actor.id,
        entityType: 'project' as const,
        entityId: project.id,
        link: `/projetos/${project.id}`,
      })),
      tx,
    )
  })
}

/**
 * Projeto só conclui com as aprovações resolvidas (regra 9 de product.md).
 *
 * É a trava que impede dar um projeto por entregue com material ainda
 * esperando o "ok" do cliente.
 */
async function assertReadyToComplete(projectId: string): Promise<void> {
  const [pending] = await db
    .select({ total: count() })
    .from(approvals)
    .where(
      and(eq(approvals.projectId, projectId), inArray(approvals.status, OPEN_APPROVAL_STATUSES)),
    )

  if ((pending?.total ?? 0) > 0) {
    throw new BusinessRuleError(
      `Existem ${pending?.total} aprovações pendentes. Resolva-as antes de concluir o projeto.`,
    )
  }
}

/** Marca o lançamento e calcula o fim do período de suporte contratado. */
export async function registerLaunch(projectId: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: projects.id,
        name: projects.name,
        clientId: projects.clientId,
        contractId: projects.contractId,
        launchedAt: projects.launchedAt,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) throw new NotFoundError('Projeto')
    if (project.launchedAt) throw new BusinessRuleError('Este projeto já foi lançado.')

    const launchedAt = new Date()
    await tx.update(projects).set({ launchedAt }).where(eq(projects.id, projectId))

    // O suporte contratado começa a contar do lançamento, não da assinatura.
    if (project.contractId) {
      const [contract] = await tx
        .select({ supportDays: contracts.supportDays })
        .from(contracts)
        .where(eq(contracts.id, project.contractId))
        .limit(1)

      if (contract?.supportDays) {
        await tx
          .update(contracts)
          .set({ supportEndsAt: addDaysISO(todayISO(launchedAt), contract.supportDays) })
          .where(eq(contracts.id, project.contractId))
      }
    }

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'project',
        entityId: project.id,
        entityLabel: project.name,
        changes: { launchedAt: { from: null, to: launchedAt.toISOString() } },
      },
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'completed',
        entityType: 'project',
        entityId: project.id,
        entityLabel: project.name,
        projectId: project.id,
        clientId: project.clientId,
        summary: `registrou o lançamento de ${project.name}`,
      },
      tx,
    )
  })
}

// ── Edição e equipe ──────────────────────────────────────────────────────────

export interface UpdateProjectInput {
  name: string
  ownerId?: string | null
  startDate?: string | null
  dueDate?: string | null
  description?: string | null
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await tx.query.projects.findFirst({ where: eq(projects.id, projectId) })
    if (!before) throw new NotFoundError('Projeto')

    const patch = {
      name: input.name,
      ownerId: input.ownerId ?? before.ownerId,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      description: input.description ?? null,
    }

    await tx.update(projects).set(patch).where(eq(projects.id, projectId))

    // O responsável sempre faz parte da equipe.
    if (patch.ownerId) {
      await tx
        .insert(projectMembers)
        .values({ projectId, userId: patch.ownerId })
        .onConflictDoNothing()
    }

    const changes = diffChanges(before, patch, ['name', 'ownerId', 'startDate', 'dueDate'])
    if (!changes) return

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'project',
        entityId: projectId,
        entityLabel: `${before.code} · ${input.name}`,
        changes,
      },
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'updated',
        entityType: 'project',
        entityId: projectId,
        entityLabel: input.name,
        projectId,
        clientId: before.clientId,
        summary:
          'dueDate' in changes
            ? `mudou o prazo de ${input.name} para ${patch.dueDate ?? 'sem data'}`
            : `atualizou o projeto ${input.name}`,
        metadata: { fields: Object.keys(changes) },
      },
      tx,
    )

    if ('ownerId' in changes && patch.ownerId) {
      await notifyMany(
        [
          {
            userId: patch.ownerId,
            type: 'project_assigned',
            title: input.name,
            body: 'Você agora é o responsável por este projeto.',
            actorId: actor.id,
            entityType: 'project',
            entityId: projectId,
            link: `/projetos/${projectId}`,
          },
        ],
        tx,
      )
    }
  })
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  roleInProject: string | null,
  actor: Actor,
): Promise<void> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
  if (!project) throw new NotFoundError('Projeto')

  await db
    .insert(projectMembers)
    .values({ projectId, userId, roleInProject })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { roleInProject },
    })

  await notifyMany([
    {
      userId,
      type: 'project_assigned',
      title: project.name,
      body: 'Você foi adicionado à equipe deste projeto.',
      actorId: actor.id,
      entityType: 'project',
      entityId: projectId,
      link: `/projetos/${projectId}`,
    },
  ])
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
  if (!project) throw new NotFoundError('Projeto')
  if (project.ownerId === userId) {
    throw new BusinessRuleError(
      'O responsável pelo projeto não pode sair da equipe. Troque o responsável antes.',
    )
  }

  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
}
