import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import { contractAddendums, contracts, leads, opportunities, proposals } from '@/server/db/schema'
import { BusinessRuleError } from '@/server/errors'
import {
  acceptProposal,
  convertLead,
  createLead,
  createOpportunity,
  createProposal,
  discardLead,
  markOpportunityLost,
  markOpportunityWon,
  reopenOpportunity,
  sendProposal,
} from '@/server/modules/crm/service'
import {
  activateAddendum,
  changeContractStatus,
  convertOpportunityToContract,
  createAddendum,
} from '@/server/modules/contracts/service'
import { addDaysISO, todayISO } from '@/shared/dates'

import { createTestClient, createTestUser, unique } from './helpers'

/**
 * Comercial e contratos: a cadeia Lead → Cliente/Contato/Oportunidade →
 * Proposta → Contrato. Os testes cobrem as regras que, se quebradas, corrompem
 * a cadeia inteira: idempotência das duas conversões e as travas de estado.
 */

describe('conversão de lead', () => {
  it('cria cliente, contato e oportunidade a partir do lead', async () => {
    const actor = await createTestUser('comercial')

    const lead = await createLead(
      { name: unique('Lead'), companyName: unique('Empresa'), email: 'contato@empresa.com.br' },
      actor,
    )

    const result = await convertLead(
      { leadId: lead.id, opportunityTitle: 'Site institucional' },
      actor,
    )

    expect(result.clientId).toBeTruthy()
    expect(result.contactId).toBeTruthy()
    expect(result.opportunityId).toBeTruthy()

    const storedLead = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) })
    expect(storedLead?.status).toBe('converted')
    expect(storedLead?.convertedClientId).toBe(result.clientId)

    const opportunity = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, result.opportunityId),
    })
    expect(opportunity?.stage).toBe('new_contact')
    expect(opportunity?.clientId).toBe(result.clientId)
  })

  it('reconverter o mesmo lead devolve a oportunidade existente, sem duplicar', async () => {
    const actor = await createTestUser('comercial')
    const lead = await createLead({ name: unique('Lead') }, actor)

    const first = await convertLead({ leadId: lead.id, opportunityTitle: 'Projeto X' }, actor)
    const second = await convertLead(
      { leadId: lead.id, opportunityTitle: 'Título diferente ignorado' },
      actor,
    )

    expect(second).toEqual(first)

    const opportunityCount = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.leadId, lead.id))

    expect(opportunityCount).toHaveLength(1)
  })

  it('recusa converter lead descartado', async () => {
    const actor = await createTestUser('comercial')
    const lead = await createLead({ name: unique('Lead') }, actor)

    await discardLead(lead.id, 'Não tinha orçamento.', actor)

    await expect(
      convertLead({ leadId: lead.id, opportunityTitle: 'Tentativa' }, actor),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('recusa descartar lead já convertido', async () => {
    const actor = await createTestUser('comercial')
    const lead = await createLead({ name: unique('Lead') }, actor)
    await convertLead({ leadId: lead.id, opportunityTitle: 'Projeto Y' }, actor)

    await expect(discardLead(lead.id, 'motivo qualquer', actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
  })
})

describe('ciclo de vida da oportunidade', () => {
  it('oportunidade ganha exige cliente — o schema já obriga isso na criação', async () => {
    const actor = await createTestUser('comercial')
    const client = await createTestClient(actor.id)

    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )

    await markOpportunityWon(opportunity.id, actor)

    const stored = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, opportunity.id),
    })
    expect(stored?.stage).toBe('won')
    expect(stored?.wonAt).toBeInstanceOf(Date)
  })

  it('não permite marcar como ganha uma oportunidade perdida sem reabrir', async () => {
    const actor = await createTestUser('comercial')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )

    await markOpportunityLost(opportunity.id, 'Escolheram concorrente', actor)

    await expect(markOpportunityWon(opportunity.id, actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )

    await reopenOpportunity(opportunity.id, actor)
    await expect(markOpportunityWon(opportunity.id, actor)).resolves.toBeUndefined()
  })

  it('não permite marcar como perdida uma oportunidade já ganha', async () => {
    const actor = await createTestUser('comercial')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )

    await markOpportunityWon(opportunity.id, actor)

    await expect(markOpportunityLost(opportunity.id, 'motivo', actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
  })
})

describe('propostas', () => {
  it('cada proposta nova é uma versão — nunca sobrescreve a anterior', async () => {
    const actor = await createTestUser('comercial')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )

    const v1 = await createProposal(
      { opportunityId: opportunity.id, title: 'Proposta v1', totalValue: '10000.00' },
      actor,
    )
    const v2 = await createProposal(
      { opportunityId: opportunity.id, title: 'Proposta v2', totalValue: '12000.00' },
      actor,
    )

    const stored = await db
      .select({ id: proposals.id, version: proposals.version })
      .from(proposals)
      .where(eq(proposals.opportunityId, opportunity.id))
      .orderBy(proposals.version)

    expect(stored.map((row) => row.version)).toEqual([1, 2])
    expect(stored.map((row) => row.id)).toEqual([v1.id, v2.id])

    // A oportunidade avança para "proposta em elaboração" ao criar a primeira.
    const storedOpportunity = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, opportunity.id),
    })
    expect(storedOpportunity?.stage).toBe('proposal_draft')
  })

  it('só envia proposta em rascunho', async () => {
    const actor = await createTestUser('comercial')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )
    const proposal = await createProposal(
      { opportunityId: opportunity.id, title: 'Proposta' },
      actor,
    )

    await sendProposal(proposal.id, actor)
    await expect(sendProposal(proposal.id, actor)).rejects.toBeInstanceOf(BusinessRuleError)

    const storedOpportunity = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, opportunity.id),
    })
    expect(storedOpportunity?.stage).toBe('proposal_sent')
  })
})

describe('conversão de oportunidade em contrato', () => {
  it('só converte oportunidade ganha', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )

    await expect(convertOpportunityToContract(opportunity.id, actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
  })

  it('é idempotente: reconverter devolve o mesmo contrato', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )
    await markOpportunityWon(opportunity.id, actor)

    const first = await convertOpportunityToContract(opportunity.id, actor)
    const second = await convertOpportunityToContract(opportunity.id, actor)

    expect(first.alreadyExisted).toBe(false)
    expect(second.alreadyExisted).toBe(true)
    expect(second.id).toBe(first.id)

    const count = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.opportunityId, opportunity.id))
    expect(count).toHaveLength(1)
  })

  it('herda escopo e valor da proposta aceita', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id, estimatedValue: '5000.00' },
      actor,
    )

    const proposal = await createProposal(
      {
        opportunityId: opportunity.id,
        title: 'Proposta detalhada',
        scope: 'Escopo negociado com o cliente.',
        totalValue: '48000.00',
      },
      actor,
    )
    await acceptProposal(proposal.id, actor)
    await markOpportunityWon(opportunity.id, actor)

    const result = await convertOpportunityToContract(opportunity.id, actor)

    const contract = await db.query.contracts.findFirst({ where: eq(contracts.id, result.id) })
    expect(contract?.totalValue).toBe('48000.00')
    expect(contract?.scope).toBe('Escopo negociado com o cliente.')
    expect(contract?.proposalId).toBe(proposal.id)
  })
})

describe('status do contrato', () => {
  async function wonOpportunityContract() {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )
    await markOpportunityWon(opportunity.id, actor)
    const { id } = await convertOpportunityToContract(opportunity.id, actor)
    return { actor, contractId: id }
  }

  it('ativar sem data de início define hoje automaticamente', async () => {
    const { actor, contractId } = await wonOpportunityContract()

    await changeContractStatus(contractId, 'active', actor)

    const contract = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(contract?.status).toBe('active')
    expect(contract?.startDate).toBe(todayISO())
    expect(contract?.signedAt).toBeInstanceOf(Date)
  })

  it('recusa ativar quando o término é anterior ao início', async () => {
    const { actor, contractId } = await wonOpportunityContract()
    const today = todayISO()

    await db
      .update(contracts)
      .set({ startDate: today, endDate: addDaysISO(today, -5) })
      .where(eq(contracts.id, contractId))

    await expect(changeContractStatus(contractId, 'active', actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
  })

  it('exige motivo para cancelar', async () => {
    const { actor, contractId } = await wonOpportunityContract()

    await expect(changeContractStatus(contractId, 'cancelled', actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
    await expect(
      changeContractStatus(contractId, 'cancelled', actor, 'Cliente desistiu do projeto.'),
    ).resolves.toBeUndefined()

    const contract = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(contract?.status).toBe('cancelled')
    expect(contract?.cancellationReason).toBe('Cliente desistiu do projeto.')
  })

  it('contrato cancelado continua existindo — nunca é excluído', async () => {
    const { actor, contractId } = await wonOpportunityContract()
    await changeContractStatus(contractId, 'cancelled', actor, 'Motivo qualquer')

    const contract = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(contract).toBeDefined()
    expect(contract?.status).toBe('cancelled')
  })
})

describe('aditivos de contrato', () => {
  it('aditivo de prazo estende a data de término ao ser ativado', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )
    await markOpportunityWon(opportunity.id, actor)
    const { id: contractId } = await convertOpportunityToContract(opportunity.id, actor)

    const today = todayISO()
    const originalEnd = addDaysISO(today, 30)
    await db.update(contracts).set({ endDate: originalEnd }).where(eq(contracts.id, contractId))
    // Aditivo só é ativado em contrato ativo ou suspenso.
    await changeContractStatus(contractId, 'active', actor)

    const newEnd = addDaysISO(today, 60)
    const addendum = await createAddendum(
      {
        contractId,
        type: 'deadline',
        title: 'Extensão de prazo',
        newEndDate: newEnd,
      },
      actor,
    )

    let contract = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(contract?.endDate).toBe(originalEnd)

    await activateAddendum(addendum.id, actor)

    contract = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(contract?.endDate).toBe(newEnd)

    const stored = await db.query.contractAddendums.findFirst({
      where: eq(contractAddendums.id, addendum.id),
    })
    expect(stored?.status).toBe('active')
    expect(stored?.sequence).toBe(1)
  })

  it('numera os aditivos em sequência por contrato', async () => {
    const actor = await createTestUser('gestor')
    const client = await createTestClient(actor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id },
      actor,
    )
    await markOpportunityWon(opportunity.id, actor)
    const { id: contractId } = await convertOpportunityToContract(opportunity.id, actor)

    const first = await createAddendum({ contractId, type: 'scope', title: 'Aditivo 1' }, actor)
    const second = await createAddendum({ contractId, type: 'scope', title: 'Aditivo 2' }, actor)

    const rows = await db
      .select({ id: contractAddendums.id, sequence: contractAddendums.sequence })
      .from(contractAddendums)
      .where(eq(contractAddendums.contractId, contractId))
      .orderBy(contractAddendums.sequence)

    expect(rows).toEqual([
      { id: first.id, sequence: 1 },
      { id: second.id, sequence: 2 },
    ])
  })
})

describe('geração de código', () => {
  it('nextCode nunca repete entre chamadas concorrentes', async () => {
    const codes = await Promise.all(Array.from({ length: 5 }, () => nextCode('lead')))
    expect(new Set(codes).size).toBe(5)
  })
})
