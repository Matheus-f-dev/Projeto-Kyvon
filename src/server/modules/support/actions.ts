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
  changeTicketStatusSchema,
  createTicketSchema,
  ticketCommentSchema,
  updateTicketSchema,
} from '@/shared/schemas/support'

import {
  addTicketComment,
  assignTicket,
  changeTicketStatus,
  createTicket,
  getTicketOwnership,
  sendTicketToCommercial,
  updateTicket,
} from './service'

/**
 * Server Actions de suporte.
 *
 * Atender exige `support.write`. Atribuir a outra pessoa exige
 * `support.assign`; assumir para si, não — mesmo padrão de tarefas.
 */

function actorFrom(context: AuthContext) {
  return { id: context.user.id, email: context.user.email }
}

function assertCanAssign(
  context: AuthContext,
  assigneeId: string | null | undefined,
  previous?: string | null,
) {
  if (!assigneeId || assigneeId === previous || assigneeId === context.user.id) return
  if (!context.can('support.assign')) {
    throw new ForbiddenError('Atribuir chamado a outra pessoa requer a permissão "support.assign".')
  }
}

function revalidateTicket(ownership: { clientId: string; projectId: string | null }) {
  revalidatePath('/suporte')
  revalidatePath('/meu-trabalho')
  revalidatePath('/dashboard')
  revalidatePath(`/clientes/${ownership.clientId}`)
  if (ownership.projectId) revalidatePath(`/projetos/${ownership.projectId}`)
}

export async function createTicketAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('support.write')
    const input = parseInput(createTicketSchema, formDataToObject(formData))
    assertCanAssign(context, input.assigneeId)

    const result = await createTicket(input, actorFrom(context))

    revalidateTicket({ clientId: input.clientId, projectId: input.projectId ?? null })
    return successState({ id: result.id }, `Chamado ${result.code} aberto.`)
  })
}

export async function updateTicketAction(
  ticketId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('support.write')
    const current = await getTicketOwnership(z.uuid().parse(ticketId))
    const input = parseInput(updateTicketSchema, formDataToObject(formData))
    assertCanAssign(context, input.assigneeId, current.assigneeId)

    await updateTicket(ticketId, input, actorFrom(context))

    revalidateTicket(current)
    return successState(undefined, 'Chamado atualizado.')
  })
}

export async function assignTicketAction(
  ticketId: string,
  assigneeId: string | null,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('support.write')
    const current = await getTicketOwnership(z.uuid().parse(ticketId))
    const target = assigneeId ? z.uuid().parse(assigneeId) : null
    assertCanAssign(context, target, current.assigneeId)
    // Tirar o chamado de outra pessoa também é redistribuir trabalho.
    if (
      !target &&
      current.assigneeId &&
      current.assigneeId !== context.user.id &&
      !context.can('support.assign')
    ) {
      throw new ForbiddenError('Remover o responsável de outra pessoa requer "support.assign".')
    }

    await assignTicket(ticketId, target, actorFrom(context))

    revalidateTicket(current)
    return successState(
      undefined,
      target === context.user.id ? 'Chamado assumido.' : 'Responsável atualizado.',
    )
  })
}

export async function changeTicketStatusAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('support.write')
    const input = parseInput(changeTicketStatusSchema, formDataToObject(formData))
    const current = await getTicketOwnership(input.ticketId)

    await changeTicketStatus(input, actorFrom(context))

    revalidateTicket(current)
    return successState(undefined, 'Status atualizado.')
  })
}

export async function addTicketCommentAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('support.write')
    const input = parseInput(ticketCommentSchema, formDataToObject(formData))
    const current = await getTicketOwnership(input.ticketId)

    await addTicketComment(input, actorFrom(context))

    revalidateTicket(current)
    return successState(undefined, input.toClient ? 'Resposta registrada.' : 'Nota adicionada.')
  })
}

export async function sendTicketToCommercialAction(
  ticketId: string,
): Promise<ActionState<{ opportunityId: string }>> {
  return runAction(async () => {
    const context = await requirePermission('support.write')
    const current = await getTicketOwnership(z.uuid().parse(ticketId))

    const result = await sendTicketToCommercial(ticketId, actorFrom(context))

    revalidateTicket(current)
    revalidatePath('/comercial')
    return successState(
      { opportunityId: result.opportunityId },
      `Enviado ao Comercial como ${result.code}. O chamado foi resolvido.`,
    )
  })
}
