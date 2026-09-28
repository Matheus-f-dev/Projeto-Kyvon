'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  formDataToObject,
  parseInput,
  runAction,
  successState,
  type ActionState,
} from '@/server/action-state'
import { requirePermission } from '@/server/auth/context'
import { ForbiddenError } from '@/server/errors'
import {
  addendumSchema,
  changeContractStatusSchema,
  contractSchema,
  createContractSchema,
} from '@/shared/schemas/contracts'

import {
  activateAddendum,
  changeContractStatus,
  createAddendum,
  createContract,
  convertOpportunityToContract,
  updateContract,
} from './service'

function actorFrom(context: { user: { id: string; email: string } }) {
  return { id: context.user.id, email: context.user.email }
}

/** Botão "Converter em contrato" do pipeline. Idempotente (regra 2 do produto). */
export async function convertOpportunityToContractAction(
  opportunityId: string,
): Promise<ActionState<{ id: string; alreadyExisted: boolean }>> {
  return runAction(async () => {
    const context = await requirePermission('crm.convert')
    const result = await convertOpportunityToContract(opportunityId, actorFrom(context))

    revalidatePath('/comercial')
    revalidatePath('/contratos')
    return successState(
      { id: result.id, alreadyExisted: result.alreadyExisted },
      result.alreadyExisted
        ? 'Este contrato já existia.'
        : 'Contrato criado a partir da oportunidade.',
    )
  })
}

export async function createContractAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('contracts.write')
    const { clientId, ...input } = parseInput(createContractSchema, formDataToObject(formData))

    const result = await createContract(clientId, input, actorFrom(context))

    revalidatePath('/contratos')
    // Leva direto para o contrato recém-criado — é onde a próxima ação acontece.
    redirect(`/contratos/${result.id}`)
  })
}

export async function updateContractAction(
  contractId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('contracts.write')
    const input = parseInput(contractSchema, formDataToObject(formData))

    await updateContract(contractId, input, actorFrom(context), {
      preserveFinancials: !context.can('contracts.values.read'),
    })

    revalidatePath('/contratos')
    revalidatePath(`/contratos/${contractId}`)
    return successState(undefined, 'Contrato atualizado.')
  })
}

export async function changeContractStatusAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('contracts.write')
    const input = parseInput(changeContractStatusSchema, formDataToObject(formData))

    await changeContractStatus(
      input.contractId,
      input.status,
      actorFrom(context),
      input.cancellationReason,
    )

    revalidatePath('/contratos')
    revalidatePath(`/contratos/${input.contractId}`)
    return successState(undefined, 'Status do contrato atualizado.')
  })
}

export async function createAddendumAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('contracts.write')
    const input = parseInput(addendumSchema, formDataToObject(formData))

    // Aditivo de valor mexe no financeiro do contrato: exige a mesma permissão
    // de quem pode ver esse financeiro.
    if (input.type === 'value' && !context.can('contracts.values.read')) {
      throw new ForbiddenError('Aditivos de valor exigem permissão para ver valores de contrato.')
    }

    const result = await createAddendum(input, actorFrom(context))

    revalidatePath(`/contratos/${input.contractId}`)
    return successState(result, 'Aditivo criado.')
  })
}

export async function activateAddendumAction(
  addendumId: string,
  contractId: string,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('contracts.write')
    await activateAddendum(addendumId, actorFrom(context))

    revalidatePath(`/contratos/${contractId}`)
    return successState(undefined, 'Aditivo ativado.')
  })
}
