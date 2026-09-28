'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  formDataToObject,
  parseInput,
  runAction,
  successState,
  type ActionState,
} from '@/server/action-state'
import { requirePermission, type AuthContext } from '@/server/auth/context'
import { ForbiddenError, NotFoundError } from '@/server/errors'
import {
  changeTaskStatusSchema,
  checklistItemSchema,
  commentSchema,
  createTaskSchema,
  dependencySchema,
  devDetailsSchema,
  updateTaskSchema,
} from '@/shared/schemas/tasks'

import {
  addChecklistItem,
  addComment,
  addDependency,
  changeTaskStatus,
  createTask,
  deleteChecklistItem,
  deleteComment,
  deleteTask,
  getTaskOwnership,
  isInvolvedInProject,
  isInvolvedInTask,
  removeDependency,
  saveDevDetails,
  toggleChecklistItem,
  updateTask,
} from './service'

/**
 * Server Actions de tarefas.
 *
 * Cada uma aplica as duas camadas de `docs/permissions.md`, seção 5:
 * a permissão (`tasks.write`) e o envolvimento (responsável, criador, dono ou
 * membro do projeto). `tasks.delete` é o poder de gerir qualquer tarefa.
 */

function actorFrom(context: AuthContext) {
  return { id: context.user.id, email: context.user.email }
}

async function requireTaskEdit(taskId: string): Promise<AuthContext> {
  const context = await requirePermission('tasks.write')
  if (context.can('tasks.delete')) return context

  if (!(await isInvolvedInTask(taskId, context.user.id))) {
    throw new ForbiddenError('Só quem participa do projeto ou da tarefa pode alterá-la.')
  }
  return context
}

/** Atribuir trabalho a outra pessoa exige `tasks.assign`; pegar para si, não. */
function assertCanAssign(
  context: AuthContext,
  assigneeId: string | undefined,
  previous?: string | null,
) {
  if (!assigneeId || assigneeId === previous || assigneeId === context.user.id) return
  if (!context.can('tasks.assign')) {
    throw new ForbiddenError('Atribuir tarefa a outra pessoa requer a permissão "tasks.assign".')
  }
}

async function projectIdOf(taskId: string): Promise<string> {
  return (await getTaskOwnership(taskId)).projectId
}

function revalidateTask(projectId: string) {
  revalidatePath('/tarefas')
  revalidatePath('/meu-trabalho')
  revalidatePath(`/projetos/${projectId}`)
  revalidatePath('/dashboard')
}

// ── Criação e edição ─────────────────────────────────────────────────────────

export async function createTaskAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('tasks.write')
    const input = parseInput(createTaskSchema, formDataToObject(formData))

    if (
      !context.can('tasks.delete') &&
      !(await isInvolvedInProject(input.projectId, context.user.id))
    ) {
      throw new ForbiddenError('Só quem participa do projeto pode criar tarefas nele.')
    }
    assertCanAssign(context, input.assigneeId)

    const result = await createTask(input, actorFrom(context))

    revalidateTask(input.projectId)
    return successState({ id: result.id }, `Tarefa ${result.code} criada.`)
  })
}

export async function updateTaskAction(
  taskId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireTaskEdit(taskId)
    const input = parseInput(updateTaskSchema, formDataToObject(formData))

    const current = await getTaskOwnership(taskId)
    assertCanAssign(context, input.assigneeId, current.assigneeId)

    await updateTask(taskId, input, actorFrom(context))

    revalidateTask(current.projectId)
    return successState(undefined, 'Tarefa atualizada.')
  })
}

export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('tasks.delete')
    const projectId = await projectIdOf(taskId)

    await deleteTask(taskId, actorFrom(context))

    revalidateTask(projectId)
    return successState(undefined, 'Tarefa excluída.')
  })
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function changeTaskStatusAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(changeTaskStatusSchema, formDataToObject(formData))
    const context = await requireTaskEdit(input.taskId)
    const projectId = await projectIdOf(input.taskId)

    await changeTaskStatus(input, actorFrom(context))

    revalidateTask(projectId)
    return successState(undefined)
  })
}

// ── Checklist ────────────────────────────────────────────────────────────────

export async function addChecklistItemAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(checklistItemSchema, formDataToObject(formData))
    await requireTaskEdit(input.taskId)

    await addChecklistItem(input.taskId, input.title)

    revalidateTask(await projectIdOf(input.taskId))
    return successState(undefined)
  })
}

const checklistToggleSchema = z.object({ taskId: z.uuid(), itemId: z.uuid(), isDone: z.boolean() })

export async function toggleChecklistItemAction(
  taskId: string,
  itemId: string,
  isDone: boolean,
): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(checklistToggleSchema, { taskId, itemId, isDone })
    const context = await requireTaskEdit(input.taskId)

    const owner = await toggleChecklistItem(input.itemId, input.isDone, actorFrom(context))
    if (owner !== input.taskId) throw new NotFoundError('Item do checklist')

    revalidateTask(await projectIdOf(input.taskId))
    return successState(undefined)
  })
}

export async function deleteChecklistItemAction(
  taskId: string,
  itemId: string,
): Promise<ActionState> {
  return runAction(async () => {
    await requireTaskEdit(taskId)
    const owner = await deleteChecklistItem(itemId)
    if (owner !== taskId) throw new NotFoundError('Item do checklist')

    revalidateTask(await projectIdOf(taskId))
    return successState(undefined)
  })
}

// ── Comentários ──────────────────────────────────────────────────────────────

/** Comentar só exige `tasks.write` — discutir uma tarefa não é alterá-la. */
export async function addCommentAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('tasks.write')
    const input = parseInput(commentSchema, formDataToObject(formData))

    await addComment(input.taskId, input.body, actorFrom(context))

    revalidateTask(await projectIdOf(input.taskId))
    return successState(undefined, 'Comentário publicado.')
  })
}

export async function deleteCommentAction(taskId: string, commentId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('tasks.write')
    await deleteComment(commentId, actorFrom(context), context.can('tasks.delete'))

    revalidateTask(await projectIdOf(taskId))
    return successState(undefined, 'Comentário removido.')
  })
}

// ── Dependências ─────────────────────────────────────────────────────────────

export async function addDependencyAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(dependencySchema, formDataToObject(formData))
    await requireTaskEdit(input.taskId)

    await addDependency(input.taskId, input.dependsOnTaskId)

    revalidateTask(await projectIdOf(input.taskId))
    return successState(undefined, 'Dependência adicionada.')
  })
}

export async function removeDependencyAction(
  taskId: string,
  dependsOnTaskId: string,
): Promise<ActionState> {
  return runAction(async () => {
    await requireTaskEdit(taskId)
    await removeDependency(taskId, dependsOnTaskId)

    revalidateTask(await projectIdOf(taskId))
    return successState(undefined, 'Dependência removida.')
  })
}

// ── Área DEV ─────────────────────────────────────────────────────────────────

export async function saveDevDetailsAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(devDetailsSchema, formDataToObject(formData))
    await requireTaskEdit(input.taskId)

    await saveDevDetails(input)

    revalidateTask(await projectIdOf(input.taskId))
    return successState(undefined, 'Dados técnicos salvos.')
  })
}
