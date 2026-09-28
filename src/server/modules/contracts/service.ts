import { and, eq } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import { contractAddendums, contracts, opportunities } from '@/server/db/schema'
import { BusinessRuleError, NotFoundError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { getAcceptedProposal } from '@/server/modules/crm/service'
import type { Actor } from '@/server/modules/projects/service'
import { addDaysISO, todayISO } from '@/shared/dates'
import { CONTRACT_STATUS, CONTRACT_TRANSITIONS } from '@/shared/domain'
import type { AddendumInput, ContractInput } from '@/shared/schemas/contracts'

/**
 * Regras de contrato.
 *
 * Escopo é imutável após ativação (regra 8 do produto) — mudanças viram
 * aditivo ou mudança de escopo. Contrato não tem exclusão: encerrar e cancelar
 * são status, o registro nunca desaparece (regra 10).
 */

const SCOPE_FIELDS = ['scope', 'deliverables', 'totalValue'] as const

/**
 * Converte oportunidade ganha em contrato — regra 2 do produto.
 *
 * Idempotente: se já existe contrato para esta oportunidade, devolve o
 * existente em vez de criar outro. Puxa escopo e valor da proposta aceita
 * quando houver, para não redigitar o que já foi negociado.
 */
export async function convertOpportunityToContract(
  opportunityId: string,
  actor: Actor,
): Promise<{ id: string; code: string; alreadyExisted: boolean }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: contracts.id, code: contracts.code })
      .from(contracts)
      .where(eq(contracts.opportunityId, opportunityId))
      .limit(1)

    if (existing) {
      return { id: existing.id, code: existing.code, alreadyExisted: true }
    }

    const opportunity = await tx.query.opportunities.findFirst({
      where: eq(opportunities.id, opportunityId),
    })
    if (!opportunity) throw new NotFoundError('Oportunidade')
    if (opportunity.stage !== 'won') {
      throw new BusinessRuleError('Só é possível converter uma oportunidade ganha em contrato.')
    }

    const proposal = await getAcceptedProposal(opportunityId, tx)
    const code = await nextCode('contract', tx)

    const [contract] = await tx
      .insert(contracts)
      .values({
        code,
        title: proposal?.title ?? opportunity.title,
        clientId: opportunity.clientId,
        opportunityId,
        proposalId: proposal?.id ?? null,
        serviceTypeId: opportunity.serviceTypeId,
        status: 'draft',
        scope: proposal?.scope ?? null,
        deliverables: proposal?.deliverables ?? null,
        totalValue: proposal?.totalValue ?? opportunity.estimatedValue ?? null,
        paymentTerms: proposal?.paymentTerms ?? null,
        ownerId: opportunity.ownerId,
      })
      .returning({ id: contracts.id, code: contracts.code })

    if (!contract) throw new Error('Falha ao criar contrato.')

    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'contract',
        entityId: contract.id,
        entityLabel: `${code} · ${opportunity.title}`,
        changes: { origin: { from: null, to: `opportunity:${opportunityId}` } },
      },
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'converted',
        entityType: 'contract',
        entityId: contract.id,
        entityLabel: contract.code,
        clientId: opportunity.clientId,
        summary: `converteu a oportunidade ${opportunity.title} em contrato`,
      },
      tx,
    )

    return { id: contract.id, code: contract.code, alreadyExisted: false }
  })
}

export async function createContract(
  clientId: string,
  input: ContractInput,
  actor: Actor,
): Promise<{ id: string }> {
  const code = await nextCode('contract')

  const [contract] = await db
    .insert(contracts)
    .values({
      code,
      title: input.title,
      clientId,
      status: 'draft',
      scope: input.scope ?? null,
      deliverables: input.deliverables ?? null,
      responsibilities: input.responsibilities ?? null,
      exclusions: input.exclusions ?? null,
      totalValue: input.totalValue ?? null,
      paymentMethod: input.paymentMethod ?? null,
      paymentTerms: input.paymentTerms ?? null,
      installments: input.installments ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      revisionsIncluded: input.revisionsIncluded ?? null,
      supportDays: input.supportDays ?? null,
      ownerId: input.ownerId ?? actor.id,
      notes: input.notes ?? null,
    })
    .returning({ id: contracts.id })

  if (!contract) throw new Error('Falha ao criar contrato.')

  await recordAudit({
    actor,
    action: 'create',
    entityType: 'contract',
    entityId: contract.id,
    entityLabel: `${code} · ${input.title}`,
  })

  return { id: contract.id }
}

export interface UpdateContractOptions {
  /**
   * Quem não tem `contracts.values.read` nunca recebeu os valores (a query os
   * omite), então o formulário dele não os traz de volta. Sem esta opção, a
   * ausência seria lida como "apagar o valor do contrato".
   */
  preserveFinancials?: boolean
}

export async function updateContract(
  contractId: string,
  rawInput: ContractInput,
  actor: Actor,
  options: UpdateContractOptions = {},
): Promise<void> {
  const before = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
  if (!before) throw new NotFoundError('Contrato')

  const input: ContractInput = options.preserveFinancials
    ? {
        ...rawInput,
        totalValue: before.totalValue ?? undefined,
        paymentMethod: before.paymentMethod ?? undefined,
        paymentTerms: before.paymentTerms ?? undefined,
        installments: before.installments ?? undefined,
      }
    : rawInput

  const isActive = before.status !== 'draft' && before.status !== 'awaiting_signature'
  // Compara normalizado: o banco devolve `null`, o formulário `undefined`, e
  // `numeric` volta como "48000.00" enquanto a pessoa digitou "48000".
  const sameText = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? '').trim() === (b ?? '').trim()
  const sameMoney = (a: string | null | undefined, b: string | null | undefined) =>
    (a ? Number(a) : null) === (b ? Number(b) : null)
  const touchesScope =
    !sameText(input.scope, before.scope) ||
    !sameText(input.deliverables, before.deliverables) ||
    !sameMoney(input.totalValue, before.totalValue)

  if (isActive && touchesScope) {
    throw new BusinessRuleError(
      'O escopo e o valor de um contrato ativo são imutáveis. Registre a alteração como aditivo ou mudança de escopo.',
    )
  }

  const patch = {
    title: input.title,
    scope: input.scope ?? null,
    deliverables: input.deliverables ?? null,
    responsibilities: input.responsibilities ?? null,
    exclusions: input.exclusions ?? null,
    totalValue: input.totalValue ?? null,
    paymentMethod: input.paymentMethod ?? null,
    paymentTerms: input.paymentTerms ?? null,
    installments: input.installments ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    revisionsIncluded: input.revisionsIncluded ?? null,
    supportDays: input.supportDays ?? null,
    ownerId: input.ownerId ?? before.ownerId,
    notes: input.notes ?? null,
  }

  await db.update(contracts).set(patch).where(eq(contracts.id, contractId))

  const changes = diffChanges(before, patch, [...SCOPE_FIELDS, 'startDate', 'endDate', 'ownerId'])
  if (changes) {
    await recordAudit({
      actor,
      action: 'update',
      entityType: 'contract',
      entityId: contractId,
      entityLabel: `${before.code} · ${input.title}`,
      changes,
    })
  }
}

type ContractStatus = (typeof contracts.$inferSelect)['status']

export async function changeContractStatus(
  contractId: string,
  status: ContractStatus,
  actor: Actor,
  cancellationReason?: string,
): Promise<void> {
  const contract = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
  if (!contract) throw new NotFoundError('Contrato')
  if (contract.status === status) return

  if (!CONTRACT_TRANSITIONS[contract.status].includes(status)) {
    throw new BusinessRuleError(
      `Um contrato ${CONTRACT_STATUS[contract.status].label.toLowerCase()} não pode passar para ${CONTRACT_STATUS[status].label.toLowerCase()}.`,
    )
  }

  // Regra 3 do produto: contrato ativo exige início, e término >= início.
  if (status === 'active') {
    const startDate = contract.startDate ?? todayISO()
    if (contract.endDate && contract.endDate < startDate) {
      throw new BusinessRuleError('O término do contrato não pode ser anterior ao início.')
    }
    if (!contract.startDate) {
      await db.update(contracts).set({ startDate }).where(eq(contracts.id, contractId))
    }
  }

  if (status === 'cancelled' && !cancellationReason?.trim()) {
    throw new BusinessRuleError('Informe o motivo do cancelamento.')
  }

  await db
    .update(contracts)
    .set({
      status,
      signedAt: status === 'active' && !contract.signedAt ? new Date() : contract.signedAt,
      closedAt: status === 'closed' ? new Date() : null,
      cancelledAt: status === 'cancelled' ? new Date() : null,
      cancellationReason: status === 'cancelled' ? (cancellationReason ?? null) : null,
    })
    .where(eq(contracts.id, contractId))

  await recordAudit({
    actor,
    action: 'update',
    entityType: 'contract',
    entityId: contractId,
    entityLabel: `${contract.code} · ${contract.title}`,
    changes: { status: { from: contract.status, to: status } },
  })

  await recordActivity({
    actorId: actor.id,
    verb: 'status_changed',
    entityType: 'contract',
    entityId: contractId,
    entityLabel: contract.title,
    clientId: contract.clientId,
    summary: `mudou o status do contrato ${contract.code} para ${status}`,
  })
}

// ── Aditivos ─────────────────────────────────────────────────────────────────

/**
 * Cria um aditivo em rascunho. Com `database`, roda dentro da transação de quem
 * chama — a mudança de escopo usa isso para criar o aditivo e registrar o
 * vínculo de forma atômica.
 */
export async function createAddendum(
  input: AddendumInput,
  actor: Actor,
  database?: Database,
): Promise<{ id: string; code: string }> {
  const reader = database ?? db
  const [contract] = await reader
    .select()
    .from(contracts)
    .where(eq(contracts.id, input.contractId))
    .limit(1)
  if (!contract) throw new NotFoundError('Contrato')

  const run = <T>(fn: (tx: Database) => Promise<T>) => (database ? fn(database) : db.transaction(fn))

  return run(async (tx) => {
    const existing = await tx
      .select({ sequence: contractAddendums.sequence })
      .from(contractAddendums)
      .where(eq(contractAddendums.contractId, input.contractId))
      .orderBy((table) => table.sequence)

    const nextSequence = (existing.at(-1)?.sequence ?? 0) + 1
    const code = await nextCode('contract_addendum', tx)

    const [addendum] = await tx
      .insert(contractAddendums)
      .values({
        code,
        contractId: input.contractId,
        sequence: nextSequence,
        type: input.type,
        status: 'draft',
        title: input.title,
        description: input.description ?? null,
        valueDelta: input.valueDelta ?? null,
        newEndDate: input.newEndDate ?? null,
        additionalSupportDays: input.additionalSupportDays ?? null,
        createdBy: actor.id,
      })
      .returning({ id: contractAddendums.id })

    if (!addendum) throw new Error('Falha ao criar aditivo.')

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'contract_addendum',
        entityId: addendum.id,
        entityLabel: `${code} · ${input.title}`,
        clientId: contract.clientId,
        summary: `criou o aditivo ${input.title} do contrato ${contract.code}`,
      },
      tx,
    )

    return { id: addendum.id, code }
  })
}

/** Ativa o aditivo e aplica o efeito (novo prazo, dias de suporte) ao contrato. */
export async function activateAddendum(addendumId: string, actor: Actor): Promise<void> {
  const addendum = await db.query.contractAddendums.findFirst({
    where: eq(contractAddendums.id, addendumId),
  })
  if (!addendum) throw new NotFoundError('Aditivo')
  if (addendum.status === 'active') return
  if (addendum.status === 'cancelled') {
    throw new BusinessRuleError('Um aditivo cancelado não pode ser ativado.')
  }

  const parent = await db.query.contracts.findFirst({
    where: eq(contracts.id, addendum.contractId),
    columns: { status: true },
  })
  if (!parent || (parent.status !== 'active' && parent.status !== 'suspended')) {
    throw new BusinessRuleError('Só é possível ativar aditivo de um contrato ativo ou suspenso.')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(contractAddendums)
      .set({ status: 'active', signedAt: new Date() })
      .where(eq(contractAddendums.id, addendumId))

    const contractPatch: Partial<typeof contracts.$inferInsert> = {}
    if (addendum.type === 'deadline' && addendum.newEndDate) {
      contractPatch.endDate = addendum.newEndDate
    }
    if (addendum.additionalSupportDays) {
      const contract = await tx.query.contracts.findFirst({
        where: eq(contracts.id, addendum.contractId),
      })
      if (contract) {
        contractPatch.supportDays = (contract.supportDays ?? 0) + addendum.additionalSupportDays
        if (contract.supportEndsAt) {
          contractPatch.supportEndsAt = addDaysISO(
            contract.supportEndsAt,
            addendum.additionalSupportDays,
          )
        }
      }
    }

    if (Object.keys(contractPatch).length > 0) {
      await tx.update(contracts).set(contractPatch).where(eq(contracts.id, addendum.contractId))
    }

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'contract_addendum',
        entityId: addendumId,
        entityLabel: addendum.title,
        changes: { status: { from: addendum.status, to: 'active' } },
      },
      tx,
    )
  })
}

/** Total do contrato: valor base + soma dos aditivos de valor já ativos. */
export async function getEffectiveContractValue(
  contractId: string,
  tx: Database = db,
): Promise<string | null> {
  const contract = await tx.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
  if (!contract) return null

  const addendums = await tx
    .select({ valueDelta: contractAddendums.valueDelta })
    .from(contractAddendums)
    // Rascunho e cancelado não mudam o que foi contratado — só aditivo ativo conta.
    .where(
      and(eq(contractAddendums.contractId, contractId), eq(contractAddendums.status, 'active')),
    )

  const base = contract.totalValue ? Number(contract.totalValue) : 0
  const delta = addendums.reduce(
    (sum, row) => sum + (row.valueDelta ? Number(row.valueDelta) : 0),
    0,
  )

  return (base + delta).toFixed(2)
}
