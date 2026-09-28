'use server'

import { revalidatePath } from 'next/cache'

import {
  errorState,
  formDataToObject,
  parseInput,
  runAction,
  successState,
  type ActionState,
} from '@/server/action-state'
import { requirePermission } from '@/server/auth/context'
import {
  convertLeadSchema,
  discardLeadSchema,
  leadSchema,
  markLostSchema,
  moveOpportunitySchema,
  opportunitySchema,
  proposalSchema,
  rejectProposalSchema,
} from '@/shared/schemas/crm'

import {
  acceptProposal,
  convertLead,
  createLead,
  createOpportunity,
  createProposal,
  discardLead,
  markOpportunityLost,
  markOpportunityWon,
  moveOpportunityStage,
  rejectProposal,
  reopenOpportunity,
  sendProposal,
  updateOpportunity,
} from './service'

/** Server Actions do comercial — casca fina sobre `service.ts`. */

function actorFrom(context: { user: { id: string; email: string } }) {
  return { id: context.user.id, email: context.user.email }
}

// ── Leads ────────────────────────────────────────────────────────────────────

export async function createLeadAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(leadSchema, formDataToObject(formData))
    const result = await createLead(input, actorFrom(context))

    revalidatePath('/comercial')
    return successState(result, 'Lead cadastrado.')
  })
}

export async function discardLeadAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(discardLeadSchema, formDataToObject(formData))

    await discardLead(input.leadId, input.reason, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Lead descartado.')
  })
}

export async function convertLeadAction(
  formData: FormData,
): Promise<ActionState<{ opportunityId: string }>> {
  return runAction(async () => {
    const context = await requirePermission('crm.convert')
    const input = parseInput(convertLeadSchema, formDataToObject(formData))

    const result = await convertLead(input, actorFrom(context))

    revalidatePath('/comercial')
    revalidatePath('/clientes')
    return successState({ opportunityId: result.opportunityId }, 'Lead convertido em oportunidade.')
  })
}

// ── Oportunidades ────────────────────────────────────────────────────────────

export async function createOpportunityAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(opportunitySchema, formDataToObject(formData))
    const result = await createOpportunity(input, actorFrom(context))

    revalidatePath('/comercial')
    return successState(result, 'Oportunidade criada.')
  })
}

export async function updateOpportunityAction(
  opportunityId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(opportunitySchema, formDataToObject(formData))

    await updateOpportunity(opportunityId, input, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Oportunidade atualizada.')
  })
}

export async function moveOpportunityAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(moveOpportunitySchema, formDataToObject(formData))

    if (input.stage === 'won' || input.stage === 'lost') {
      return errorState('Use as ações "Marcar como ganha" ou "Marcar como perdida".')
    }

    await moveOpportunityStage(input.opportunityId, input.stage, input.position, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined)
  })
}

export async function markOpportunityWonAction(opportunityId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    await markOpportunityWon(opportunityId, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Oportunidade marcada como ganha.')
  })
}

export async function markOpportunityLostAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(markLostSchema, formDataToObject(formData))

    await markOpportunityLost(input.opportunityId, input.reason, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Oportunidade marcada como perdida.')
  })
}

export async function reopenOpportunityAction(opportunityId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    await reopenOpportunity(opportunityId, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Oportunidade reaberta.')
  })
}

// ── Propostas ────────────────────────────────────────────────────────────────

export async function createProposalAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(proposalSchema, formDataToObject(formData))
    const result = await createProposal(input, actorFrom(context))

    revalidatePath('/comercial')
    return successState(result, 'Proposta criada.')
  })
}

export async function sendProposalAction(proposalId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    await sendProposal(proposalId, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Proposta enviada.')
  })
}

export async function acceptProposalAction(proposalId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    await acceptProposal(proposalId, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Proposta aceita.')
  })
}

export async function rejectProposalAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('crm.write')
    const input = parseInput(rejectProposalSchema, formDataToObject(formData))

    await rejectProposal(input.proposalId, input.reason, actorFrom(context))

    revalidatePath('/comercial')
    return successState(undefined, 'Proposta recusada.')
  })
}
