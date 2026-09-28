'use server'

import { revalidatePath } from 'next/cache'

import {
  formDataToObject,
  parseInput,
  runAction,
  successState,
  type ActionState,
} from '@/server/action-state'
import { requirePermission } from '@/server/auth/context'
import { clientSchema, contactSchema } from '@/shared/schemas/clients'

import {
  archiveClient,
  createClient,
  createContact,
  deleteContact,
  updateClient,
  updateContact,
} from './service'

/** Server Actions de clientes e contatos — casca fina sobre `service.ts`. */

export async function createClientAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('clients.write')
    const input = parseInput(clientSchema, formDataToObject(formData))

    const result = await createClient(input, { id: context.user.id, email: context.user.email })

    revalidatePath('/clientes')
    return successState(result, 'Cliente cadastrado.')
  })
}

export async function updateClientAction(
  clientId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('clients.write')
    const input = parseInput(clientSchema, formDataToObject(formData))

    await updateClient(clientId, input, { id: context.user.id, email: context.user.email })

    revalidatePath('/clientes')
    revalidatePath(`/clientes/${clientId}`)
    return successState(undefined, 'Cliente atualizado.')
  })
}

export async function archiveClientAction(clientId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('clients.delete')

    await archiveClient(clientId, { id: context.user.id, email: context.user.email })

    revalidatePath('/clientes')
    revalidatePath(`/clientes/${clientId}`)
    return successState(undefined, 'Cliente arquivado.')
  })
}

export async function createContactAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('clients.write')
    const input = parseInput(contactSchema, formDataToObject(formData))

    const result = await createContact(input, { id: context.user.id, email: context.user.email })

    revalidatePath(`/clientes/${input.clientId}`)
    return successState(result, 'Contato adicionado.')
  })
}

export async function updateContactAction(
  contactId: string,
  _previous: unknown,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('clients.write')
    const input = parseInput(contactSchema, formDataToObject(formData))

    await updateContact(contactId, input, { id: context.user.id, email: context.user.email })

    revalidatePath(`/clientes/${input.clientId}`)
    return successState(undefined, 'Contato atualizado.')
  })
}

export async function deleteContactAction(
  contactId: string,
  clientId: string,
): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission('clients.write')
    await deleteContact(contactId)

    revalidatePath(`/clientes/${clientId}`)
    return successState(undefined, 'Contato removido.')
  })
}
