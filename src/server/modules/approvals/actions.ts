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
import { ForbiddenError } from '@/server/errors'
import { isInvolvedInProject } from '@/server/modules/tasks/service'
import {
  createApprovalSchema,
  decideApprovalSchema,
  newVersionSchema,
  updateApprovalSchema,
} from '@/shared/schemas/approvals'

import {
  cancelApproval,
  createApproval,
  decideApproval,
  getApprovalProjectId,
  submitNewVersion,
  updateApproval,
} from './service'

/**
 * Server Actions de aprovações.
 *
 * Pedir, editar, reenviar e cancelar exigem `approvals.write` **e** fazer parte
 * do projeto (ou `projects.delete`, a gestão ampla) — mesma regra de
 * `docs/permissions.md`, seção 5. Decidir exige só `approvals.decide`: quem
 * aprova normalmente não é da equipe que produziu o material.
 */

function actorFrom(context: AuthContext) {
  return { id: context.user.id, email: context.user.email }
}

async function requireApprovalWrite(projectId: string): Promise<AuthContext> {
  const context = await requirePermission('approvals.write')
  if (context.can('projects.delete')) return context
  if (!(await isInvolvedInProject(projectId, context.user.id))) {
    throw new ForbiddenError('Só quem participa do projeto pode pedir ou alterar aprovações nele.')
  }
  return context
}

function revalidateApproval(projectId: string) {
  revalidatePath('/aprovacoes')
  revalidatePath('/meu-trabalho')
  revalidatePath('/dashboard')
  revalidatePath(`/projetos/${projectId}`)
}

export async function createApprovalAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const input = parseInput(createApprovalSchema, formDataToObject(formData))
    const context = await requireApprovalWrite(input.projectId)

    const result = await createApproval(input, actorFrom(context))

    revalidateApproval(input.projectId)
    return successState({ id: result.id }, `${result.code} criada. Anexe o material da v1.`)
  })
}

export async function updateApprovalAction(
  approvalId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const projectId = await getApprovalProjectId(z.uuid().parse(approvalId))
    const context = await requireApprovalWrite(projectId)
    const input = parseInput(updateApprovalSchema, formDataToObject(formData))

    await updateApproval(approvalId, input, actorFrom(context))

    revalidateApproval(projectId)
    return successState(undefined, 'Aprovação atualizada.')
  })
}

export async function decideApprovalAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('approvals.decide')
    const input = parseInput(decideApprovalSchema, formDataToObject(formData))
    const projectId = await getApprovalProjectId(input.approvalId)

    await decideApproval(input, actorFrom(context))

    revalidateApproval(projectId)
    return successState(
      undefined,
      input.decision === 'approved' ? `v${input.version} aprovada.` : 'Ajustes solicitados.',
    )
  })
}

export async function submitNewVersionAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ versionId: string }>> {
  return runAction(async () => {
    const input = parseInput(newVersionSchema, formDataToObject(formData))
    const projectId = await getApprovalProjectId(input.approvalId)
    const context = await requireApprovalWrite(projectId)

    const result = await submitNewVersion(input, actorFrom(context))

    revalidateApproval(projectId)
    return successState(
      { versionId: result.versionId },
      `v${result.version} enviada. Anexe o material revisado.`,
    )
  })
}

export async function cancelApprovalAction(
  approvalId: string,
  reason: string,
): Promise<ActionState> {
  return runAction(async () => {
    const projectId = await getApprovalProjectId(z.uuid().parse(approvalId))
    const context = await requireApprovalWrite(projectId)

    await cancelApproval(approvalId, reason, actorFrom(context))

    revalidateApproval(projectId)
    return successState(undefined, 'Aprovação cancelada.')
  })
}
