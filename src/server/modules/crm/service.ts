import { and, eq, sql } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import { clients, contacts, leads, opportunities, proposals } from '@/server/db/schema'
import { BusinessRuleError, NotFoundError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { notify } from '@/server/modules/notifications/service'
import type { Actor } from '@/server/modules/projects/service'
import { touchLastContact } from '@/server/modules/clients/service'
import type {
  ConvertLeadInput,
  LeadInput,
  OpportunityInput,
  ProposalInput,
} from '@/shared/schemas/crm'

/**
 * Regras do comercial.
 *
 * A cadeia central do produto nasce aqui: Lead → Cliente + Contato +
 * Oportunidade → Proposta → Contrato. Cada seta é uma função deste arquivo, e
 * cada uma reaproveita o que a anterior já criou (regra "reduzir ao máximo o
 * retrabalho manual", seção 2 do produto).
 */

// ── Leads ────────────────────────────────────────────────────────────────────

export async function createLead(input: LeadInput, actor: Actor): Promise<{ id: string }> {
  const code = await nextCode('lead')

  const [lead] = await db
    .insert(leads)
    .values({
      code,
      name: input.name,
      companyName: input.companyName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      sourceId: input.sourceId ?? null,
      serviceTypeId: input.serviceTypeId ?? null,
      message: input.message ?? null,
      notes: input.notes ?? null,
      ownerId: input.ownerId ?? actor.id,
      status: 'new',
    })
    .returning({ id: leads.id })

  if (!lead) throw new Error('Falha ao criar lead.')

  await recordAudit({
    actor,
    action: 'create',
    entityType: 'lead',
    entityId: lead.id,
    entityLabel: `${code} · ${input.name}`,
  })

  return { id: lead.id }
}

export async function discardLead(leadId: string, reason: string, actor: Actor): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead) throw new NotFoundError('Lead')
  if (lead.status === 'converted') {
    throw new BusinessRuleError('Este lead já foi convertido e não pode ser descartado.')
  }

  await db
    .update(leads)
    .set({ status: 'discarded', discardReason: reason })
    .where(eq(leads.id, leadId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'lead',
    entityId: leadId,
    entityLabel: lead.name,
    changes: { status: { from: lead.status, to: 'discarded' } },
  })
}

/**
 * Converte lead em cliente + contato + oportunidade — regras 1 e 2 do produto.
 *
 * Idempotente: reconverter um lead já convertido devolve a oportunidade
 * existente em vez de duplicar cliente e oportunidade (mesmo padrão da
 * conversão oportunidade → contrato).
 */
export async function convertLead(
  input: ConvertLeadInput,
  actor: Actor,
): Promise<{ clientId: string; contactId: string; opportunityId: string }> {
  return db.transaction(async (tx) => {
    const lead = await tx.query.leads.findFirst({ where: eq(leads.id, input.leadId) })
    if (!lead) throw new NotFoundError('Lead')

    if (lead.status === 'converted' && lead.convertedOpportunityId) {
      return {
        clientId: lead.convertedClientId as string,
        contactId: lead.convertedContactId as string,
        opportunityId: lead.convertedOpportunityId,
      }
    }

    if (lead.status === 'discarded') {
      throw new BusinessRuleError('Este lead foi descartado e não pode ser convertido.')
    }

    const clientCode = await nextCode('client', tx)
    const [client] = await tx
      .insert(clients)
      .values({
        code: clientCode,
        name: lead.companyName || lead.name,
        email: lead.email,
        phone: lead.phone,
        sourceId: lead.sourceId,
        status: 'prospect',
        ownerId: input.ownerId ?? lead.ownerId ?? actor.id,
        lastContactAt: new Date(),
      })
      .returning({ id: clients.id })

    if (!client) throw new Error('Falha ao criar cliente na conversão.')

    const [contact] = await tx
      .insert(contacts)
      .values({
        clientId: client.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        isPrimary: true,
        canApprove: true,
      })
      .returning({ id: contacts.id })

    if (!contact) throw new Error('Falha ao criar contato na conversão.')

    const opportunityCode = await nextCode('opportunity', tx)
    const [opportunity] = await tx
      .insert(opportunities)
      .values({
        code: opportunityCode,
        title: input.opportunityTitle,
        clientId: client.id,
        contactId: contact.id,
        serviceTypeId: input.serviceTypeId ?? lead.serviceTypeId,
        sourceId: lead.sourceId,
        leadId: lead.id,
        stage: 'new_contact',
        estimatedValue: input.estimatedValue ?? null,
        ownerId: input.ownerId ?? lead.ownerId ?? actor.id,
      })
      .returning({ id: opportunities.id })

    if (!opportunity) throw new Error('Falha ao criar oportunidade na conversão.')

    await tx
      .update(leads)
      .set({
        status: 'converted',
        convertedClientId: client.id,
        convertedContactId: contact.id,
        convertedOpportunityId: opportunity.id,
        convertedAt: new Date(),
      })
      .where(eq(leads.id, lead.id))

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'lead',
        entityId: lead.id,
        entityLabel: lead.name,
        changes: { status: { from: lead.status, to: 'converted' } },
      },
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'converted',
        entityType: 'lead',
        entityId: lead.id,
        entityLabel: lead.name,
        clientId: client.id,
        summary: `converteu o lead ${lead.name} em cliente e oportunidade`,
      },
      tx,
    )

    return { clientId: client.id, contactId: contact.id, opportunityId: opportunity.id }
  })
}

// ── Oportunidades ────────────────────────────────────────────────────────────

export async function createOpportunity(
  input: OpportunityInput,
  actor: Actor,
): Promise<{ id: string }> {
  const client = await db.query.clients.findFirst({ where: eq(clients.id, input.clientId) })
  if (!client) throw new NotFoundError('Cliente')

  const [maxPosition] = await db
    .select({ max: sql<number>`coalesce(max(${opportunities.position}), -1)` })
    .from(opportunities)
    .where(eq(opportunities.stage, 'new_contact'))

  const code = await nextCode('opportunity')

  const [opportunity] = await db
    .insert(opportunities)
    .values({
      code,
      title: input.title,
      clientId: input.clientId,
      contactId: input.contactId ?? null,
      serviceTypeId: input.serviceTypeId ?? null,
      sourceId: input.sourceId ?? null,
      ownerId: input.ownerId ?? actor.id,
      stage: 'new_contact',
      estimatedValue: input.estimatedValue ?? null,
      probability: input.probability ?? null,
      nextAction: input.nextAction ?? null,
      nextActionAt: input.nextActionAt ?? null,
      expectedCloseAt: input.expectedCloseAt ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      position: (maxPosition?.max ?? -1) + 1,
    })
    .returning({ id: opportunities.id })

  if (!opportunity) throw new Error('Falha ao criar oportunidade.')

  await touchLastContact(input.clientId)

  await recordAudit({
    actor,
    action: 'create',
    entityType: 'opportunity',
    entityId: opportunity.id,
    entityLabel: `${code} · ${input.title}`,
  })

  await recordActivity({
    actorId: actor.id,
    verb: 'created',
    entityType: 'opportunity',
    entityId: opportunity.id,
    entityLabel: input.title,
    clientId: input.clientId,
    summary: `abriu a oportunidade ${input.title}`,
  })

  return { id: opportunity.id }
}

export async function updateOpportunity(
  opportunityId: string,
  input: OpportunityInput,
  actor: Actor,
): Promise<void> {
  const before = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  })
  if (!before) throw new NotFoundError('Oportunidade')

  const patch = {
    title: input.title,
    contactId: input.contactId ?? null,
    serviceTypeId: input.serviceTypeId ?? null,
    sourceId: input.sourceId ?? null,
    ownerId: input.ownerId ?? before.ownerId,
    estimatedValue: input.estimatedValue ?? null,
    probability: input.probability ?? null,
    nextAction: input.nextAction ?? null,
    nextActionAt: input.nextActionAt ?? null,
    expectedCloseAt: input.expectedCloseAt ?? null,
    description: input.description ?? null,
    notes: input.notes ?? null,
  }

  await db.update(opportunities).set(patch).where(eq(opportunities.id, opportunityId))

  const changes = diffChanges(before, patch, [
    'title',
    'estimatedValue',
    'ownerId',
    'nextAction',
    'nextActionAt',
  ])
  if (changes) {
    await recordAudit({
      actor,
      action: 'update',
      entityType: 'opportunity',
      entityId: opportunityId,
      entityLabel: `${before.code} · ${input.title}`,
      changes,
    })
  }
}

type OpenStage = Exclude<(typeof opportunities.$inferSelect)['stage'], 'won' | 'lost'>

/** Move a oportunidade de coluna no kanban (arraste). Não move para won/lost. */
export async function moveOpportunityStage(
  opportunityId: string,
  stage: OpenStage,
  position: number | undefined,
  actor: Actor,
): Promise<void> {
  const before = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  })
  if (!before) throw new NotFoundError('Oportunidade')
  if (before.stage === 'won' || before.stage === 'lost') {
    throw new BusinessRuleError('Reabra a oportunidade antes de movê-la de etapa.')
  }

  const [maxPosition] = await db
    .select({ max: sql<number>`coalesce(max(${opportunities.position}), -1)` })
    .from(opportunities)
    .where(eq(opportunities.stage, stage))

  await db
    .update(opportunities)
    .set({ stage, position: position ?? (maxPosition?.max ?? -1) + 1 })
    .where(eq(opportunities.id, opportunityId))

  if (before.stage !== stage) {
    await recordActivity({
      actorId: actor.id,
      verb: 'stage_changed',
      entityType: 'opportunity',
      entityId: opportunityId,
      entityLabel: before.title,
      clientId: before.clientId,
      summary: `moveu ${before.title} para ${stage}`,
      metadata: { from: before.stage, to: stage },
    })
  }
}

/** Oportunidade ganha exige cliente — regra 1. O schema já torna isso obrigatório. */
export async function markOpportunityWon(opportunityId: string, actor: Actor): Promise<void> {
  const opportunity = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  })
  if (!opportunity) throw new NotFoundError('Oportunidade')
  if (opportunity.stage === 'won') return
  if (opportunity.stage === 'lost') {
    throw new BusinessRuleError('Reabra a oportunidade perdida antes de marcá-la como ganha.')
  }

  await db
    .update(opportunities)
    .set({ stage: 'won', wonAt: new Date(), lostAt: null, lostReason: null })
    .where(eq(opportunities.id, opportunityId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityLabel: opportunity.title,
    changes: { stage: { from: opportunity.stage, to: 'won' } },
  })

  await recordActivity({
    actorId: actor.id,
    verb: 'status_changed',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityLabel: opportunity.title,
    clientId: opportunity.clientId,
    summary: `marcou ${opportunity.title} como ganha`,
  })

  if (opportunity.ownerId) {
    await notify({
      userId: opportunity.ownerId,
      type: 'opportunity_assigned',
      title: 'Oportunidade ganha',
      body: `${opportunity.title} foi marcada como ganha. Já pode converter em contrato.`,
      actorId: actor.id,
      entityType: 'opportunity',
      entityId: opportunityId,
      link: `/comercial?oportunidade=${opportunityId}`,
    })
  }
}

export async function markOpportunityLost(
  opportunityId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const opportunity = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  })
  if (!opportunity) throw new NotFoundError('Oportunidade')
  if (opportunity.stage === 'won') {
    throw new BusinessRuleError('Uma oportunidade já ganha não pode ser marcada como perdida.')
  }

  await db
    .update(opportunities)
    .set({ stage: 'lost', lostAt: new Date(), lostReason: reason })
    .where(eq(opportunities.id, opportunityId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityLabel: opportunity.title,
    changes: { stage: { from: opportunity.stage, to: 'lost' } },
  })

  await recordActivity({
    actorId: actor.id,
    verb: 'status_changed',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityLabel: opportunity.title,
    clientId: opportunity.clientId,
    summary: `marcou ${opportunity.title} como perdida: ${reason}`,
  })
}

/** Reabre uma oportunidade ganha/perdida por engano, devolvendo-a à negociação. */
export async function reopenOpportunity(opportunityId: string, actor: Actor): Promise<void> {
  const opportunity = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  })
  if (!opportunity) throw new NotFoundError('Oportunidade')

  await db
    .update(opportunities)
    .set({ stage: 'negotiation', wonAt: null, lostAt: null, lostReason: null })
    .where(eq(opportunities.id, opportunityId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityLabel: opportunity.title,
    changes: { stage: { from: opportunity.stage, to: 'negotiation' } },
  })
}

// ── Propostas ────────────────────────────────────────────────────────────────

/** Cada proposta nova é uma versão — nunca sobrescreve a anterior. */
export async function createProposal(input: ProposalInput, actor: Actor): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const opportunity = await tx.query.opportunities.findFirst({
      where: eq(opportunities.id, input.opportunityId),
    })
    if (!opportunity) throw new NotFoundError('Oportunidade')

    const [maxVersionRow] = await tx
      .select({ maxVersion: sql<number>`coalesce(max(${proposals.version}), 0)` })
      .from(proposals)
      .where(eq(proposals.opportunityId, input.opportunityId))
    const maxVersion = maxVersionRow?.maxVersion ?? 0

    const code = await nextCode('proposal', tx)

    const [proposal] = await tx
      .insert(proposals)
      .values({
        code,
        opportunityId: input.opportunityId,
        version: maxVersion + 1,
        title: input.title,
        scope: input.scope ?? null,
        deliverables: input.deliverables ?? null,
        totalValue: input.totalValue ?? null,
        paymentTerms: input.paymentTerms ?? null,
        estimatedDurationDays: input.estimatedDurationDays ?? null,
        validUntil: input.validUntil ?? null,
        status: 'draft',
        createdBy: actor.id,
        notes: input.notes ?? null,
      })
      .returning({ id: proposals.id })

    if (!proposal) throw new Error('Falha ao criar proposta.')

    // A oportunidade avança para "proposta em elaboração" se ainda não passou disso.
    if (['new_contact', 'qualification', 'discovery'].includes(opportunity.stage)) {
      await tx
        .update(opportunities)
        .set({ stage: 'proposal_draft' })
        .where(eq(opportunities.id, input.opportunityId))
    }

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'proposal',
        entityId: proposal.id,
        entityLabel: `${input.title} v${maxVersion + 1}`,
        clientId: opportunity.clientId,
        summary: `criou a proposta ${input.title} (v${maxVersion + 1})`,
      },
      tx,
    )

    return { id: proposal.id }
  })
}

export async function sendProposal(proposalId: string, actor: Actor): Promise<void> {
  const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId) })
  if (!proposal) throw new NotFoundError('Proposta')
  if (proposal.status !== 'draft') {
    throw new BusinessRuleError('Só é possível enviar uma proposta em rascunho.')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(proposals)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(proposals.id, proposalId))

    await tx
      .update(opportunities)
      .set({ stage: 'proposal_sent' })
      .where(
        and(
          eq(opportunities.id, proposal.opportunityId),
          eq(opportunities.stage, 'proposal_draft'),
        ),
      )

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'proposal',
        entityId: proposalId,
        entityLabel: proposal.title,
        changes: { status: { from: proposal.status, to: 'sent' } },
      },
      tx,
    )
  })
}

export async function acceptProposal(proposalId: string, actor: Actor): Promise<void> {
  const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId) })
  if (!proposal) throw new NotFoundError('Proposta')

  await db
    .update(proposals)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(eq(proposals.id, proposalId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'proposal',
    entityId: proposalId,
    entityLabel: proposal.title,
    changes: { status: { from: proposal.status, to: 'accepted' } },
  })
}

export async function rejectProposal(
  proposalId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId) })
  if (!proposal) throw new NotFoundError('Proposta')

  await db
    .update(proposals)
    .set({ status: 'rejected', respondedAt: new Date(), rejectionReason: reason })
    .where(eq(proposals.id, proposalId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'proposal',
    entityId: proposalId,
    entityLabel: proposal.title,
    changes: { status: { from: proposal.status, to: 'rejected' } },
  })
}

/** Última proposta aceita da oportunidade — usada na conversão para contrato. */
export async function getAcceptedProposal(opportunityId: string, tx: Database = db) {
  return tx.query.proposals.findFirst({
    where: and(eq(proposals.opportunityId, opportunityId), eq(proposals.status, 'accepted')),
    orderBy: (table, { desc }) => [desc(table.version)],
  })
}
