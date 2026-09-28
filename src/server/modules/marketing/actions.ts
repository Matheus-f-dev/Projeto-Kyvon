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
import {
  campaignSchema,
  caseAuthorizationSchema,
  caseContentSchema,
  contentSchema,
  createCaseSchema,
  moveContentSchema,
  publishCaseSchema,
} from '@/shared/schemas/marketing'

import {
  createCampaign,
  createCase,
  createContent,
  deleteContent,
  moveCase,
  moveContent,
  publishCase,
  recordCaseAuthorization,
  requestCaseAuthorizationAgain,
  updateCampaign,
  updateCaseContent,
  updateContent,
} from './service'

/**
 * Server Actions de marketing.
 *
 * `marketing.write` cria e move; publicar (conteúdo ou case) exige
 * `marketing.publish` — é o passo que coloca algo em nome da Kyvon no ar.
 * Cases exigem `cases.write`. Ver `docs/permissions.md`, seção 11.
 */

function actorFrom(context: AuthContext) {
  return { id: context.user.id, email: context.user.email }
}

function revalidateMarketing() {
  revalidatePath('/marketing')
  revalidatePath('/dashboard')
}

const idSchema = z.uuid()

// ── Campanhas ────────────────────────────────────────────────────────────────

export async function createCampaignAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('marketing.write')
    const input = parseInput(campaignSchema, formDataToObject(formData))
    await createCampaign(input, actorFrom(context))
    revalidateMarketing()
    return successState(undefined, 'Campanha criada.')
  })
}

export async function updateCampaignAction(
  campaignId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('marketing.write')
    const input = parseInput(campaignSchema, formDataToObject(formData))
    await updateCampaign(idSchema.parse(campaignId), input, actorFrom(context))
    revalidateMarketing()
    return successState(undefined, 'Campanha atualizada.')
  })
}

// ── Conteúdos ────────────────────────────────────────────────────────────────

export async function createContentAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('marketing.write')
    const input = parseInput(contentSchema, formDataToObject(formData))
    const result = await createContent(input, actorFrom(context))
    revalidateMarketing()
    return successState({ id: result.id }, `Conteúdo ${result.code} criado.`)
  })
}

export async function updateContentAction(
  contentId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('marketing.write')
    const input = parseInput(contentSchema, formDataToObject(formData))
    await updateContent(idSchema.parse(contentId), input, actorFrom(context))
    revalidateMarketing()
    return successState(undefined, 'Conteúdo atualizado.')
  })
}

export async function moveContentAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('marketing.write')
    const input = parseInput(moveContentSchema, formDataToObject(formData))
    if (input.status === 'published' && !context.can('marketing.publish')) {
      throw new ForbiddenError('Publicar requer a permissão "marketing.publish".')
    }
    await moveContent(input, actorFrom(context))
    revalidateMarketing()
    return successState(undefined, input.status === 'published' ? 'Publicado.' : 'Conteúdo movido.')
  })
}

export async function deleteContentAction(contentId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('marketing.write')
    await deleteContent(idSchema.parse(contentId), actorFrom(context))
    revalidateMarketing()
    return successState(undefined, 'Ideia descartada.')
  })
}

// ── Cases ────────────────────────────────────────────────────────────────────

function revalidateCases() {
  revalidatePath('/marketing')
  revalidatePath('/clientes', 'layout')
}

export async function createCaseAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('cases.write')
    const input = parseInput(createCaseSchema, formDataToObject(formData))
    const result = await createCase(input, actorFrom(context))
    revalidateCases()
    return successState(
      { id: result.id },
      `Case ${result.code} aberto. Registre a resposta do cliente.`,
    )
  })
}

export async function recordCaseAuthorizationAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('cases.write')
    const input = parseInput(caseAuthorizationSchema, formDataToObject(formData))
    await recordCaseAuthorization(input, actorFrom(context))
    revalidateCases()
    return successState(
      undefined,
      input.decision === 'authorized' ? 'Autorização registrada.' : 'Recusa registrada.',
    )
  })
}

export async function requestCaseAuthorizationAgainAction(caseId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('cases.write')
    await requestCaseAuthorizationAgain(idSchema.parse(caseId), actorFrom(context))
    revalidateCases()
    return successState(undefined, 'Autorização pedida novamente.')
  })
}

export async function updateCaseContentAction(
  caseId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('cases.write')
    const input = parseInput(caseContentSchema, formDataToObject(formData))
    await updateCaseContent(idSchema.parse(caseId), input, actorFrom(context))
    revalidateCases()
    return successState(undefined, 'Case salvo.')
  })
}

export async function moveCaseAction(
  caseId: string,
  status: 'in_production' | 'review',
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('cases.write')
    const target = z.enum(['in_production', 'review']).parse(status)
    await moveCase(idSchema.parse(caseId), target, actorFrom(context))
    revalidateCases()
    return successState(undefined, target === 'review' ? 'Enviado para revisão.' : 'Em produção.')
  })
}

export async function publishCaseAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('cases.write')
    if (!context.can('marketing.publish')) {
      throw new ForbiddenError('Publicar requer a permissão "marketing.publish".')
    }
    const input = parseInput(publishCaseSchema, formDataToObject(formData))
    await publishCase(input.caseId, input.publishedUrl, actorFrom(context))
    revalidateCases()
    return successState(undefined, 'Case publicado.')
  })
}
