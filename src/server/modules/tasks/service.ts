import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import {
  comments,
  projectMembers,
  projectStages,
  projects,
  taskChecklistItems,
  taskDependencies,
  taskDevDetails,
  taskWatchers,
  tasks,
} from '@/server/db/schema'
import { BusinessRuleError, NotFoundError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { notify, notifyMany } from '@/server/modules/notifications/service'
import { recalculateProgress, type Actor } from '@/server/modules/projects/service'
import { TASK_STATUS } from '@/shared/domain'
import type {
  ChangeTaskStatusInput,
  CreateTaskInput,
  DevDetailsInput,
  UpdateTaskInput,
} from '@/shared/schemas/tasks'

/**
 * Regras de tarefa.
 *
 * Tarefa é a unidade de trabalho do sistema inteiro — a área DEV, o "Meu
 * trabalho" e o progresso do projeto são todos leituras destas linhas. Por
 * isso toda escrita que muda status recalcula o progresso do projeto e
 * sincroniza a etapa, na mesma transação.
 */

type TaskStatus = (typeof tasks.$inferSelect)['status']

const AUDITED_TASK_FIELDS = [
  'title',
  'assigneeId',
  'dueDate',
  'startDate',
  'priority',
  'type',
  'stageId',
  'estimateHours',
] as const

/** Status que contam como "trabalho começou" para o projeto sair do planejamento. */
const WORK_STARTED: TaskStatus[] = ['in_progress', 'in_review', 'in_testing', 'done']

async function loadTask(taskId: string, tx: Database = db) {
  const task = await tx.query.tasks.findFirst({ where: eq(tasks.id, taskId) })
  if (!task) throw new NotFoundError('Tarefa')
  return task
}

async function assertStageBelongsToProject(
  stageId: string | undefined | null,
  projectId: string,
  tx: Database,
) {
  if (!stageId) return
  const [stage] = await tx
    .select({ id: projectStages.id })
    .from(projectStages)
    .where(and(eq(projectStages.id, stageId), eq(projectStages.projectId, projectId)))
    .limit(1)
  if (!stage) throw new BusinessRuleError('A etapa escolhida não pertence a este projeto.')
}

// ── Criação e edição ─────────────────────────────────────────────────────────

export async function createTask(
  input: CreateTaskInput,
  actor: Actor,
): Promise<{ id: string; code: string }> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        clientId: projects.clientId,
      })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1)

    if (!project) throw new NotFoundError('Projeto')
    if (project.status === 'completed' || project.status === 'cancelled') {
      throw new BusinessRuleError(
        'Não é possível criar tarefa em um projeto concluído ou cancelado.',
      )
    }

    await assertStageBelongsToProject(input.stageId, project.id, tx)

    const [lastPosition] = await tx
      .select({ max: sql<number>`coalesce(max(${tasks.position}), -1)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, project.id))

    const code = await nextCode('task', tx)

    const [task] = await tx
      .insert(tasks)
      .values({
        code,
        projectId: project.id,
        stageId: input.stageId ?? null,
        title: input.title,
        description: input.description ?? null,
        assigneeId: input.assigneeId ?? null,
        createdBy: actor.id,
        priority: input.priority,
        type: input.type,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        estimateHours: input.estimateHours ?? null,
        position: (lastPosition?.max ?? -1) + 1,
      })
      .returning({ id: tasks.id })

    if (!task) throw new Error('Falha ao criar tarefa.')

    if (input.assigneeId) {
      await notify(
        {
          userId: input.assigneeId,
          type: 'task_assigned',
          title: input.title,
          body: `Nova tarefa em ${project.name}.`,
          actorId: actor.id,
          entityType: 'task',
          entityId: task.id,
          link: `/tarefas?tarefa=${task.id}`,
        },
        tx,
      )
    }

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'task',
        entityId: task.id,
        entityLabel: input.title,
        projectId: project.id,
        clientId: project.clientId,
        summary: `criou a tarefa ${input.title}`,
      },
      tx,
    )

    await recalculateProgress(project.id, tx)

    return { id: task.id, code }
  })
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await loadTask(taskId, tx)
    await assertStageBelongsToProject(input.stageId, before.projectId, tx)

    const patch = {
      title: input.title,
      description: input.description ?? null,
      stageId: input.stageId ?? null,
      assigneeId: input.assigneeId ?? null,
      priority: input.priority,
      type: input.type,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      estimateHours: input.estimateHours ?? null,
      spentHours: input.spentHours ?? null,
    }

    await tx.update(tasks).set(patch).where(eq(tasks.id, taskId))

    const changes = diffChanges(before, patch, AUDITED_TASK_FIELDS)
    if (!changes) return

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'task',
        entityId: taskId,
        entityLabel: `${before.code} · ${input.title}`,
        changes,
      },
      tx,
    )

    const assigneeChanged = 'assigneeId' in changes && patch.assigneeId
    if (assigneeChanged) {
      await notify(
        {
          userId: patch.assigneeId as string,
          type: 'task_assigned',
          title: input.title,
          body: 'Esta tarefa foi atribuída a você.',
          actorId: actor.id,
          entityType: 'task',
          entityId: taskId,
          link: `/tarefas?tarefa=${taskId}`,
        },
        tx,
      )
    }

    if (
      'dueDate' in changes &&
      before.assigneeId &&
      before.assigneeId !== actor.id &&
      !assigneeChanged
    ) {
      await notify(
        {
          userId: before.assigneeId,
          type: 'task_due_soon',
          title: input.title,
          body: `O prazo mudou para ${patch.dueDate ?? 'sem data'}.`,
          actorId: actor.id,
          entityType: 'task',
          entityId: taskId,
          link: `/tarefas?tarefa=${taskId}`,
        },
        tx,
      )
    }

    await recordActivity(
      {
        actorId: actor.id,
        verb: assigneeChanged ? 'assigned' : 'updated',
        entityType: 'task',
        entityId: taskId,
        entityLabel: input.title,
        projectId: before.projectId,
        summary: assigneeChanged
          ? `reatribuiu a tarefa ${input.title}`
          : `atualizou a tarefa ${input.title}`,
        metadata: { fields: Object.keys(changes) },
      },
      tx,
    )
  })
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * Muda o status da tarefa.
 *
 * - Bloquear exige motivo e responsável pela resolução (regra 5). O banco
 *   também impõe isso via CHECK — aqui a mensagem é legível.
 * - Concluir exige que as dependências do tipo "bloqueia" estejam concluídas
 *   (regra 6): não se entrega o QA antes do desenvolvimento.
 * - O primeiro trabalho iniciado tira o projeto de "Planejamento".
 */
export async function changeTaskStatus(input: ChangeTaskStatusInput, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await loadTask(input.taskId, tx)
    if (task.status === input.status) return

    const [project] = await tx
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        ownerId: projects.ownerId,
        clientId: projects.clientId,
      })
      .from(projects)
      .where(eq(projects.id, task.projectId))
      .limit(1)
    if (!project) throw new NotFoundError('Projeto')

    if (project.status === 'completed' || project.status === 'cancelled') {
      throw new BusinessRuleError('O projeto está encerrado — reabra-o antes de mexer nas tarefas.')
    }

    if (input.status === 'blocked' && (!input.blockedReason || !input.blockedOwnerId)) {
      throw new BusinessRuleError('Bloquear exige o motivo e quem vai resolver.')
    }

    if (input.status === 'done') {
      const pending = await tx
        .select({ code: tasks.code, title: tasks.title })
        .from(taskDependencies)
        .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
        .where(
          and(
            eq(taskDependencies.taskId, task.id),
            eq(taskDependencies.type, 'blocks'),
            ne(tasks.status, 'done'),
            ne(tasks.status, 'cancelled'),
          ),
        )

      if (pending.length > 0) {
        const list = pending.map((row) => `${row.code} ${row.title}`).join(', ')
        throw new BusinessRuleError(`Conclua antes as tarefas das quais esta depende: ${list}.`)
      }
    }

    const blocked = input.status === 'blocked'
    const now = new Date()

    await tx
      .update(tasks)
      .set({
        status: input.status,
        blockedReason: blocked ? (input.blockedReason ?? null) : null,
        blockedSince: blocked ? now : null,
        blockedOwnerId: blocked ? (input.blockedOwnerId ?? null) : null,
        completedAt: input.status === 'done' ? now : null,
      })
      .where(eq(tasks.id, task.id))

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'task',
        entityId: task.id,
        entityLabel: `${task.code} · ${task.title}`,
        changes: { status: { from: task.status, to: input.status } },
      },
      tx,
    )

    const verb =
      input.status === 'done'
        ? 'completed'
        : input.status === 'blocked'
          ? 'blocked'
          : task.status === 'blocked'
            ? 'unblocked'
            : task.status === 'done'
              ? 'reopened'
              : 'status_changed'

    await recordActivity(
      {
        actorId: actor.id,
        verb,
        entityType: 'task',
        entityId: task.id,
        entityLabel: task.title,
        projectId: project.id,
        clientId: project.clientId,
        summary:
          input.status === 'blocked'
            ? `bloqueou ${task.title}: ${input.blockedReason}`
            : `moveu ${task.title} para ${TASK_STATUS[input.status].label.toLowerCase()}`,
        metadata: { from: task.status, to: input.status },
      },
      tx,
    )

    if (blocked) {
      const recipients = new Set(
        [input.blockedOwnerId, project.ownerId].filter(Boolean) as string[],
      )
      await notifyMany(
        [...recipients].map((userId) => ({
          userId,
          type: 'task_blocked' as const,
          title: `Bloqueada: ${task.title}`,
          body: input.blockedReason ?? null,
          actorId: actor.id,
          entityType: 'task' as const,
          entityId: task.id,
          link: `/tarefas?tarefa=${task.id}`,
        })),
        tx,
      )
    }

    if (project.status === 'planning' && WORK_STARTED.includes(input.status)) {
      await tx.update(projects).set({ status: 'in_progress' }).where(eq(projects.id, project.id))
      await recordActivity(
        {
          actorId: actor.id,
          verb: 'status_changed',
          entityType: 'project',
          entityId: project.id,
          entityLabel: project.name,
          projectId: project.id,
          clientId: project.clientId,
          summary: `iniciou a execução de ${project.name}`,
          metadata: { from: 'planning', to: 'in_progress', automatic: true },
        },
        tx,
      )
    }

    if (task.stageId) await syncStage(task.stageId, project.id, tx)
    await recalculateProgress(project.id, tx)
  })
}

/**
 * Mantém a etapa coerente com as tarefas dela.
 *
 * Todas concluídas/canceladas → a etapa é concluída e a etapa corrente do
 * projeto avança para a próxima pendente. Uma tarefa reaberta devolve a etapa
 * para "em andamento". Ninguém precisa lembrar de "fechar a etapa".
 */
async function syncStage(stageId: string, projectId: string, tx: Database): Promise<void> {
  const [counts] = await tx
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} not in ('done', 'cancelled'))::int`,
      started: sql<number>`count(*) filter (where ${tasks.status} <> 'todo')::int`,
    })
    .from(tasks)
    .where(eq(tasks.stageId, stageId))

  if (!counts || counts.total === 0) return

  const [stage] = await tx
    .select()
    .from(projectStages)
    .where(eq(projectStages.id, stageId))
    .limit(1)
  if (!stage || stage.status === 'skipped') return

  const now = new Date()

  if (counts.open === 0 && stage.status !== 'done') {
    await tx
      .update(projectStages)
      .set({ status: 'done', completedAt: now, startedAt: stage.startedAt ?? now })
      .where(eq(projectStages.id, stageId))

    const [project] = await tx
      .select({ currentStageId: projects.currentStageId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (project?.currentStageId === stageId) {
      const [next] = await tx
        .select({ id: projectStages.id })
        .from(projectStages)
        .where(
          and(
            eq(projectStages.projectId, projectId),
            inArray(projectStages.status, ['pending', 'in_progress']),
            sql`${projectStages.position} > ${stage.position}`,
          ),
        )
        .orderBy(asc(projectStages.position))
        .limit(1)

      if (next) {
        await tx.update(projects).set({ currentStageId: next.id }).where(eq(projects.id, projectId))
        await tx
          .update(projectStages)
          .set({ status: 'in_progress', startedAt: now })
          .where(and(eq(projectStages.id, next.id), eq(projectStages.status, 'pending')))
      }
    }
    return
  }

  if (counts.open > 0 && stage.status === 'done') {
    await tx
      .update(projectStages)
      .set({ status: 'in_progress', completedAt: null })
      .where(eq(projectStages.id, stageId))
    return
  }

  if (counts.started > 0 && stage.status === 'pending') {
    await tx
      .update(projectStages)
      .set({ status: 'in_progress', startedAt: now })
      .where(eq(projectStages.id, stageId))
  }
}

export async function deleteTask(taskId: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await loadTask(taskId, tx)

    await tx.delete(tasks).where(eq(tasks.id, taskId))

    await recordAudit(
      {
        actor,
        action: 'delete',
        entityType: 'task',
        entityId: taskId,
        entityLabel: `${task.code} · ${task.title}`,
      },
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'deleted',
        entityType: 'task',
        entityId: taskId,
        entityLabel: task.title,
        projectId: task.projectId,
        summary: `excluiu a tarefa ${task.title}`,
      },
      tx,
    )

    if (task.stageId) await syncStage(task.stageId, task.projectId, tx)
    await recalculateProgress(task.projectId, tx)
  })
}

// ── Checklist ────────────────────────────────────────────────────────────────

export async function addChecklistItem(taskId: string, title: string): Promise<void> {
  await loadTask(taskId)

  const [last] = await db
    .select({ max: sql<number>`coalesce(max(${taskChecklistItems.position}), -1)::int` })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))

  await db.insert(taskChecklistItems).values({ taskId, title, position: (last?.max ?? -1) + 1 })
}

export async function toggleChecklistItem(
  itemId: string,
  isDone: boolean,
  actor: Actor,
): Promise<string> {
  const [item] = await db
    .update(taskChecklistItems)
    .set({ isDone, doneBy: isDone ? actor.id : null, doneAt: isDone ? new Date() : null })
    .where(eq(taskChecklistItems.id, itemId))
    .returning({ taskId: taskChecklistItems.taskId })

  if (!item) throw new NotFoundError('Item do checklist')
  return item.taskId
}

export async function deleteChecklistItem(itemId: string): Promise<string> {
  const [item] = await db
    .delete(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .returning({ taskId: taskChecklistItems.taskId })

  if (!item) throw new NotFoundError('Item do checklist')
  return item.taskId
}

// ── Comentários ──────────────────────────────────────────────────────────────

/**
 * Comenta na tarefa e avisa quem está envolvido: responsável, criador e
 * quem acompanha — nunca o próprio autor.
 */
export async function addComment(taskId: string, body: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await loadTask(taskId, tx)

    await tx.insert(comments).values({ taskId, body, authorId: actor.id })

    // Comentar faz a pessoa passar a acompanhar a tarefa.
    await tx.insert(taskWatchers).values({ taskId, userId: actor.id }).onConflictDoNothing()

    const watchers = await tx
      .select({ userId: taskWatchers.userId })
      .from(taskWatchers)
      .where(eq(taskWatchers.taskId, taskId))

    const recipients = new Set(
      [task.assigneeId, task.createdBy, ...watchers.map((row) => row.userId)].filter(
        (userId): userId is string => Boolean(userId) && userId !== actor.id,
      ),
    )

    await notifyMany(
      [...recipients].map((userId) => ({
        userId,
        type: 'task_commented' as const,
        title: `Comentário em ${task.title}`,
        body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
        actorId: actor.id,
        entityType: 'task' as const,
        entityId: taskId,
        link: `/tarefas?tarefa=${taskId}`,
      })),
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'commented',
        entityType: 'task',
        entityId: taskId,
        entityLabel: task.title,
        projectId: task.projectId,
        summary: `comentou em ${task.title}`,
      },
      tx,
    )
  })
}

/** Remove o próprio comentário (exclusão lógica — o histórico da discussão fica). */
export async function deleteComment(
  commentId: string,
  actor: Actor,
  canModerate: boolean,
): Promise<void> {
  const comment = await db.query.comments.findFirst({ where: eq(comments.id, commentId) })
  if (!comment || comment.deletedAt) throw new NotFoundError('Comentário')
  if (comment.authorId !== actor.id && !canModerate) {
    throw new BusinessRuleError('Só o autor pode remover este comentário.')
  }

  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId))
}

// ── Dependências ─────────────────────────────────────────────────────────────

/**
 * Registra que `taskId` só pode ser concluída depois de `dependsOnTaskId`.
 * Recusa dependência entre projetos e ciclos (A → B → A), que travariam as
 * duas tarefas para sempre.
 */
export async function addDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
  if (taskId === dependsOnTaskId)
    throw new BusinessRuleError('Uma tarefa não pode depender de si mesma.')

  const [task, other] = await Promise.all([loadTask(taskId), loadTask(dependsOnTaskId)])
  if (task.projectId !== other.projectId) {
    throw new BusinessRuleError('Dependências só podem ligar tarefas do mesmo projeto.')
  }

  // Busca em largura a partir da predecessora: se ela (transitivamente) já
  // depende de `taskId`, a nova aresta fecharia um ciclo.
  const projectEdges = await db
    .select({ from: taskDependencies.taskId, to: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .where(eq(tasks.projectId, task.projectId))

  const edges = new Map<string, string[]>()
  for (const edge of projectEdges) {
    const list = edges.get(edge.from)
    if (list) list.push(edge.to)
    else edges.set(edge.from, [edge.to])
  }

  const queue = [dependsOnTaskId]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift() as string
    if (current === taskId) {
      throw new BusinessRuleError('Essa dependência criaria um ciclo entre as tarefas.')
    }
    if (seen.has(current)) continue
    seen.add(current)
    queue.push(...(edges.get(current) ?? []))
  }

  await db.insert(taskDependencies).values({ taskId, dependsOnTaskId }).onConflictDoNothing()
}

export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
  await db
    .delete(taskDependencies)
    .where(
      and(
        eq(taskDependencies.taskId, taskId),
        eq(taskDependencies.dependsOnTaskId, dependsOnTaskId),
      ),
    )
}

// ── Detalhes técnicos (área DEV) ─────────────────────────────────────────────

export async function saveDevDetails(input: DevDetailsInput): Promise<void> {
  await loadTask(input.taskId)

  const values = {
    repository: input.repository ?? null,
    branch: input.branch ?? null,
    pullRequestUrl: input.pullRequestUrl ?? null,
    environment: input.environment ?? null,
    version: input.version ?? null,
    release: input.release ?? null,
  }

  await db
    .insert(taskDevDetails)
    .values({ taskId: input.taskId, ...values })
    .onConflictDoUpdate({ target: taskDevDetails.taskId, set: values })
}

// ── Acesso ───────────────────────────────────────────────────────────────────

/** Projeto e responsável atuais — o mínimo para as checagens de permissão. */
export async function getTaskOwnership(
  taskId: string,
): Promise<{ projectId: string; assigneeId: string | null }> {
  const [row] = await db
    .select({ projectId: tasks.projectId, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)
  if (!row) throw new NotFoundError('Tarefa')
  return row
}

/**
 * Quem pode editar a tarefa, além da permissão `tasks.write`
 * (`docs/permissions.md`, seção 5): responsável, criador, responsável ou
 * membro do projeto. `tasks.delete` libera qualquer tarefa.
 */
export async function isInvolvedInTask(taskId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({
      assigneeId: tasks.assigneeId,
      createdBy: tasks.createdBy,
      ownerId: projects.ownerId,
      isMember: sql<boolean>`exists (
        select 1 from ${projectMembers}
        where ${projectMembers.projectId} = ${tasks.projectId} and ${projectMembers.userId} = ${userId}
      )`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, taskId))
    .limit(1)

  if (!row) return false
  return (
    row.assigneeId === userId || row.createdBy === userId || row.ownerId === userId || row.isMember
  )
}

export async function isInvolvedInProject(projectId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({
      ownerId: projects.ownerId,
      isMember: sql<boolean>`exists (
        select 1 from ${projectMembers}
        where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.userId} = ${userId}
      )`,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!row) return false
  return row.ownerId === userId || row.isMember
}
