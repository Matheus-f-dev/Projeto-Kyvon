'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  formDataToObject,
  parseInput,
  runAction,
  successState,
  type ActionState,
} from '@/server/action-state'
import { requirePermission, type AuthContext } from '@/server/auth/context'
import { ForbiddenError } from '@/server/errors'
import { isInvolvedInProject } from '@/server/modules/tasks/service'
import {
  changeProjectStatusSchema,
  createProjectSchema,
  updateProjectSchema,
} from '@/shared/schemas/projects'

import {
  addProjectMember,
  changeProjectStatus,
  createProject,
  registerLaunch,
  removeProjectMember,
  updateProject,
} from './service'

/**
 * Server Actions de projetos.
 *
 * Editar exige `projects.write` **e** participar do projeto (responsável ou
 * membro) — `projects.delete` é o poder de gerir qualquer projeto
 * (`docs/permissions.md`, seção 5).
 */

function actorFrom(context: AuthContext) {
  return { id: context.user.id, email: context.user.email }
}

async function requireProjectEdit(projectId: string): Promise<AuthContext> {
  const context = await requirePermission('projects.write')
  if (context.can('projects.delete')) return context

  if (!(await isInvolvedInProject(projectId, context.user.id))) {
    throw new ForbiddenError('Só o responsável e a equipe do projeto podem alterá-lo.')
  }
  return context
}

function revalidateProject(projectId: string) {
  revalidatePath('/projetos')
  revalidatePath(`/projetos/${projectId}`)
  revalidatePath('/dashboard')
}

export async function createProjectAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('projects.write')
    const input = parseInput(createProjectSchema, formDataToObject(formData))

    const result = await createProject(
      {
        name: input.name,
        clientId: input.clientId,
        contractId: input.contractId ?? null,
        templateId: input.templateId ?? null,
        ownerId: input.ownerId ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        description: input.description ?? null,
      },
      actorFrom(context),
    )

    revalidatePath('/projetos')
    if (input.contractId) revalidatePath(`/contratos/${input.contractId}`)

    // Leva direto ao projeto: com template, as etapas e tarefas já estão lá.
    redirect(`/projetos/${result.id}`)
  })
}

export async function updateProjectAction(
  projectId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireProjectEdit(projectId)
    const input = parseInput(updateProjectSchema, formDataToObject(formData))

    await updateProject(projectId, input, actorFrom(context))

    revalidateProject(projectId)
    return successState(undefined, 'Projeto atualizado.')
  })
}

export async function changeProjectStatusAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(changeProjectStatusSchema, formDataToObject(formData))
    const context = await requireProjectEdit(input.projectId)

    if (input.status === 'cancelled' && !context.can('projects.delete')) {
      throw new ForbiddenError('Cancelar projeto requer a permissão "projects.delete".')
    }

    await changeProjectStatus(
      {
        projectId: input.projectId,
        status: input.status,
        blockedReason: input.blockedReason ?? null,
        blockedOwnerId: input.blockedOwnerId ?? null,
        cancellationReason: input.cancellationReason ?? null,
      },
      actorFrom(context),
    )

    revalidateProject(input.projectId)
    return successState(undefined, 'Status do projeto atualizado.')
  })
}

export async function registerLaunchAction(projectId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireProjectEdit(projectId)
    await registerLaunch(projectId, actorFrom(context))

    revalidateProject(projectId)
    return successState(undefined, 'Lançamento registrado. O período de suporte começou a contar.')
  })
}

const memberSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid('Selecione a pessoa.'),
  roleInProject: z
    .string()
    .trim()
    .max(60)
    .transform((value) => (value ? value : undefined))
    .optional(),
})

export async function addProjectMemberAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(memberSchema, formDataToObject(formData))
    const context = await requireProjectEdit(input.projectId)

    await addProjectMember(
      input.projectId,
      input.userId,
      input.roleInProject ?? null,
      actorFrom(context),
    )

    revalidateProject(input.projectId)
    return successState(undefined, 'Pessoa adicionada à equipe.')
  })
}

export async function removeProjectMemberAction(
  projectId: string,
  userId: string,
): Promise<ActionState> {
  return runAction(async () => {
    await requireProjectEdit(projectId)
    await removeProjectMember(projectId, userId)

    revalidateProject(projectId)
    return successState(undefined, 'Pessoa removida da equipe.')
  })
}
