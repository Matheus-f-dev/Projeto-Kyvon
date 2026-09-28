import { and, eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import { clients, contacts } from '@/server/db/schema'
import { BusinessRuleError, NotFoundError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import type { Actor } from '@/server/modules/projects/service'
import type { ClientInput, ContactInput } from '@/shared/schemas/clients'

/**
 * Regras de cliente e contato.
 *
 * Cliente não tem exclusão física — só arquivamento (`clients.delete` na
 * verdade concede "arquivar", conforme o catálogo de permissões). O histórico
 * de relacionamento não pode desaparecer porque alguém encerrou parceria.
 */

const AUDITED_CLIENT_FIELDS = [
  'name',
  'tradeName',
  'document',
  'email',
  'phone',
  'status',
  'ownerId',
] as const

export async function createClient(input: ClientInput, actor: Actor): Promise<{ id: string }> {
  const code = await nextCode('client')

  const [client] = await db
    .insert(clients)
    .values({
      code,
      name: input.name,
      tradeName: input.tradeName ?? null,
      document: input.document ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      segment: input.segment ?? null,
      status: input.status,
      sourceId: input.sourceId ?? null,
      ownerId: input.ownerId ?? actor.id,
      addressCity: input.addressCity ?? null,
      addressState: input.addressState ?? null,
      notes: input.notes ?? null,
      lastContactAt: new Date(),
    })
    .returning({ id: clients.id, name: clients.name })

  if (!client) throw new Error('Falha ao criar cliente.')

  await recordAudit({
    actor,
    action: 'create',
    entityType: 'client',
    entityId: client.id,
    entityLabel: `${code} · ${client.name}`,
  })

  await recordActivity({
    actorId: actor.id,
    verb: 'created',
    entityType: 'client',
    entityId: client.id,
    entityLabel: client.name,
    clientId: client.id,
    summary: `cadastrou o cliente ${client.name}`,
  })

  return { id: client.id }
}

export async function updateClient(
  clientId: string,
  input: ClientInput,
  actor: Actor,
): Promise<void> {
  const before = await db.query.clients.findFirst({ where: eq(clients.id, clientId) })
  if (!before) throw new NotFoundError('Cliente')

  const patch = {
    name: input.name,
    tradeName: input.tradeName ?? null,
    document: input.document ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    segment: input.segment ?? null,
    status: input.status,
    sourceId: input.sourceId ?? null,
    ownerId: input.ownerId ?? before.ownerId,
    addressCity: input.addressCity ?? null,
    addressState: input.addressState ?? null,
    notes: input.notes ?? null,
  }

  await db.update(clients).set(patch).where(eq(clients.id, clientId))

  const changes = diffChanges(before, patch, AUDITED_CLIENT_FIELDS)
  if (changes) {
    await recordAudit({
      actor,
      action: 'update',
      entityType: 'client',
      entityId: clientId,
      entityLabel: `${before.code} · ${input.name}`,
      changes,
    })
  }
}

/** "Excluir" cliente é arquivar — o registro nunca desaparece (regra 9 do produto). */
export async function archiveClient(clientId: string, actor: Actor): Promise<void> {
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) })
  if (!client) throw new NotFoundError('Cliente')
  if (client.status === 'archived') return

  await db.update(clients).set({ status: 'archived' }).where(eq(clients.id, clientId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'client',
    entityId: clientId,
    entityLabel: `${client.code} · ${client.name}`,
    changes: { status: { from: client.status, to: 'archived' } },
  })

  await recordActivity({
    actorId: actor.id,
    verb: 'archived',
    entityType: 'client',
    entityId: clientId,
    entityLabel: client.name,
    clientId,
    summary: `arquivou o cliente ${client.name}`,
  })
}

export async function touchLastContact(clientId: string): Promise<void> {
  await db.update(clients).set({ lastContactAt: new Date() }).where(eq(clients.id, clientId))
}

// ── Contatos ─────────────────────────────────────────────────────────────────

export async function createContact(input: ContactInput, actor: Actor): Promise<{ id: string }> {
  const client = await db.query.clients.findFirst({ where: eq(clients.id, input.clientId) })
  if (!client) throw new NotFoundError('Cliente')

  return db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(and(eq(contacts.clientId, input.clientId), eq(contacts.isPrimary, true)))
    }

    const [contact] = await tx
      .insert(contacts)
      .values({
        clientId: input.clientId,
        name: input.name,
        jobTitle: input.jobTitle ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        isPrimary: input.isPrimary,
        canApprove: input.canApprove,
        notes: input.notes ?? null,
      })
      .returning({ id: contacts.id })

    if (!contact) throw new Error('Falha ao criar contato.')

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'contact',
        entityId: contact.id,
        entityLabel: input.name,
        clientId: input.clientId,
        summary: `adicionou ${input.name} como contato de ${client.name}`,
      },
      tx,
    )

    return { id: contact.id }
  })
}

export async function updateContact(
  contactId: string,
  input: ContactInput,
  actor: Actor,
): Promise<void> {
  const before = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) })
  if (!before) throw new NotFoundError('Contato')

  const patch = {
    name: input.name,
    jobTitle: input.jobTitle ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    isPrimary: input.isPrimary,
    canApprove: input.canApprove,
    notes: input.notes ?? null,
  }

  await db.transaction(async (tx) => {
    if (input.isPrimary && !before.isPrimary) {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(and(eq(contacts.clientId, input.clientId), eq(contacts.isPrimary, true)))
    }

    await tx.update(contacts).set(patch).where(eq(contacts.id, contactId))

    const changes = diffChanges(before, patch, [
      'name',
      'jobTitle',
      'email',
      'phone',
      'isPrimary',
      'canApprove',
    ])

    if (changes) {
      await recordAudit(
        {
          actor,
          action: 'update',
          entityType: 'contact',
          entityId: contactId,
          entityLabel: input.name,
          changes,
        },
        tx,
      )
    }
  })
}

export async function deleteContact(contactId: string): Promise<void> {
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) })
  if (!contact) throw new NotFoundError('Contato')

  if (contact.isPrimary) {
    throw new BusinessRuleError(
      'Não é possível remover o contato principal. Defina outro como principal antes.',
    )
  }

  await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, contactId))
}
