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
import { requireAnyPermission, requirePermission, type AuthContext } from '@/server/auth/context'
import { ForbiddenError } from '@/server/errors'
import { isInvolvedInProject } from '@/server/modules/tasks/service'
import {
  createScopeChangeSchema,
  decideScopeChangeSchema,
  scopeAnalysisSchema,
} from '@/shared/schemas/scope'

import {
  createScopeChange,
  decideScopeChange,
  generateAddendumFromScope,
  getScopeChangeMeta,
  markScopeImplemented,
  returnScopeToAnalysis,
  saveScopeAnalysis,
  submitScopeForApproval,
} from './service'

/**
 * Server Actions de mudança de escopo.
 *
 * Registrar e analisar exigem só `scope.write`, sem exigir ser da equipe: o
 * pedido de mudança costuma chegar por quem fala com o cliente (comercial,
 * suporte), e perder o registro é pior do que recebê-lo de fora do projeto.
 * Decidir exige `scope.decide`. Ver `docs/permissions.md`, seção 9.
 */

function actorFrom(context: AuthContext) {
  return { id: context.user.id, email: context.user.email }
}

function revalidateScope(projectId: string) {
  revalidatePath(`/projetos/${projectId}`)
  revalidatePath('/contratos', 'layout')
  revalidatePath('/dashboard')
}

async function metaOf(id: string) {
  return getScopeChangeMeta(z.uuid().parse(id))
}

export async function createScopeChangeAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('scope.write')
    const input = parseInput(createScopeChangeSchema, formDataToObject(formData))

    const result = await createScopeChange(input, actorFrom(context))

    revalidateScope(input.projectId)
    return successState(
      { id: result.id },
      `${result.code} registrada. Próximo passo: analisar o impacto.`,
    )
  })
}

export async function saveScopeAnalysisAction(
  id: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('scope.write')
    const { projectId } = await metaOf(id)
    const input = parseInput(scopeAnalysisSchema, formDataToObject(formData))

    await saveScopeAnalysis(id, input, actorFrom(context), {
      preserveFinancials: !context.can('contracts.values.read'),
    })

    revalidateScope(projectId)
    return successState(undefined, 'Análise salva.')
  })
}

export async function submitScopeForApprovalAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('scope.write')
    const { projectId } = await metaOf(id)

    await submitScopeForApproval(id, actorFrom(context))

    revalidateScope(projectId)
    return successState(undefined, 'Enviada para aprovação.')
  })
}

export async function returnScopeToAnalysisAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireAnyPermission('scope.write', 'scope.decide')
    const { projectId } = await metaOf(id)

    await returnScopeToAnalysis(id, actorFrom(context))

    revalidateScope(projectId)
    return successState(undefined, 'Devolvida para análise.')
  })
}

export async function decideScopeChangeAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('scope.decide')
    const input = parseInput(decideScopeChangeSchema, formDataToObject(formData))

    const { projectId } = await metaOf(input.scopeChangeId)

    // Mexer no prazo do projeto é editar o projeto: mesma regra de
    // `docs/permissions.md`, seção 5 (permissão + equipe, ou gestão ampla).
    if (input.applyDeadline) {
      const canEdit =
        context.can('projects.write') &&
        (context.can('projects.delete') || (await isInvolvedInProject(projectId, context.user.id)))
      if (!canEdit) {
        throw new ForbiddenError('Só quem pode editar o projeto ajusta o prazo dele.')
      }
    }

    await decideScopeChange(input, actorFrom(context))

    revalidateScope(projectId)
    return successState(
      undefined,
      input.decision === 'approved' ? 'Mudança aprovada.' : 'Mudança recusada.',
    )
  })
}

export async function markScopeImplementedAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('scope.write')
    const { projectId } = await metaOf(id)

    await markScopeImplemented(id, actorFrom(context))

    revalidateScope(projectId)
    return successState(undefined, 'Marcada como implementada.')
  })
}

export async function generateAddendumFromScopeAction(
  id: string,
): Promise<ActionState<{ addendumId: string }>> {
  return runAction(async () => {
    const context = await requirePermission('contracts.write')
    if (!context.can('scope.read')) throw new ForbiddenError()

    const { projectId, financialImpact } = await metaOf(id)
    // Mesma regra do aditivo criado à mão: aditivo de valor exige ver valores.
    if (
      financialImpact !== null &&
      Number(financialImpact) !== 0 &&
      !context.can('contracts.values.read')
    ) {
      throw new ForbiddenError(
        'Esta mudança tem impacto financeiro — gerar o aditivo requer ver valores.',
      )
    }

    const result = await generateAddendumFromScope(id, actorFrom(context))

    revalidateScope(projectId)
    return successState(
      { addendumId: result.addendumId },
      `Aditivo ${result.code} criado em rascunho. Revise e ative no contrato.`,
    )
  })
}
