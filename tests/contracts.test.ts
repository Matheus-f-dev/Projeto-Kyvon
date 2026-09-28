import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import { contracts } from '@/server/db/schema'
import { BusinessRuleError } from '@/server/errors'
import {
  activateAddendum,
  changeContractStatus,
  convertOpportunityToContract,
  createAddendum,
  getEffectiveContractValue,
  updateContract,
} from '@/server/modules/contracts/service'
import { createOpportunity, markOpportunityWon } from '@/server/modules/crm/service'
import { CONTRACT_TRANSITIONS } from '@/shared/domain'
import { addendumSchema } from '@/shared/schemas/contracts'
import { parseMoney } from '@/shared/schemas/money'

import { createTestClient, createTestUser, unique } from './helpers'

/**
 * Regras de contrato que a interface depende para não corromper dados:
 * transições de status, imutabilidade do escopo, valor vigente e o
 * tratamento de valores monetários digitados em formato brasileiro.
 */

async function draftContract(value = '10000.00') {
  const actor = await createTestUser('gestor')
  const client = await createTestClient(actor.id)
  const opportunity = await createOpportunity(
    { title: unique('Oportunidade'), clientId: client.id, estimatedValue: value },
    actor,
  )
  await markOpportunityWon(opportunity.id, actor)
  const { id } = await convertOpportunityToContract(opportunity.id, actor)
  return { actor, contractId: id }
}

describe('transições de status do contrato', () => {
  it('encerrado e cancelado são terminais', () => {
    expect(CONTRACT_TRANSITIONS.closed).toEqual([])
    expect(CONTRACT_TRANSITIONS.cancelled).toEqual([])
  })

  it('recusa reativar um contrato cancelado', async () => {
    const { actor, contractId } = await draftContract()
    await changeContractStatus(contractId, 'cancelled', actor, 'Cliente desistiu.')

    await expect(changeContractStatus(contractId, 'active', actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
  })

  it('recusa suspender um contrato que nunca foi ativado', async () => {
    const { actor, contractId } = await draftContract()

    await expect(changeContractStatus(contractId, 'suspended', actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
  })

  it('permite o ciclo ativo → suspenso → ativo → encerrado', async () => {
    const { actor, contractId } = await draftContract()

    await changeContractStatus(contractId, 'active', actor)
    await changeContractStatus(contractId, 'suspended', actor)
    await changeContractStatus(contractId, 'active', actor)
    await changeContractStatus(contractId, 'closed', actor)

    const stored = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(stored?.status).toBe('closed')
    expect(stored?.closedAt).toBeInstanceOf(Date)
  })
})

describe('edição de contrato ativo', () => {
  it('aceita editar campos administrativos sem acusar mudança de escopo', async () => {
    const { actor, contractId } = await draftContract('48000.00')
    await changeContractStatus(contractId, 'active', actor)

    // Escopo vazio no banco (null) e ausente no formulário (undefined), valor
    // digitado sem casas decimais: nada disso é mudança de escopo.
    await expect(
      updateContract(
        contractId,
        { title: 'Título revisado', totalValue: '48000', notes: 'Cliente pediu reunião mensal.' },
        actor,
      ),
    ).resolves.toBeUndefined()

    const stored = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(stored?.title).toBe('Título revisado')
    expect(stored?.notes).toBe('Cliente pediu reunião mensal.')
  })

  it('recusa alterar o valor de um contrato ativo', async () => {
    const { actor, contractId } = await draftContract('48000.00')
    await changeContractStatus(contractId, 'active', actor)

    await expect(
      updateContract(contractId, { title: 'Contrato', totalValue: '60000.00' }, actor),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('preserva os valores quando quem edita não pode vê-los', async () => {
    const { actor, contractId } = await draftContract('48000.00')

    // Sem permissão de valores o formulário não traz `totalValue` — em
    // rascunho isso apagaria o valor se o service não o preservasse.
    await updateContract(contractId, { title: 'Editado por quem não vê valores' }, actor, {
      preserveFinancials: true,
    })

    const stored = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) })
    expect(stored?.totalValue).toBe('48000.00')
    expect(stored?.title).toBe('Editado por quem não vê valores')
  })
})

describe('aditivos e valor vigente', () => {
  it('recusa ativar aditivo de contrato em rascunho', async () => {
    const { actor, contractId } = await draftContract()
    const addendum = await createAddendum(
      { contractId, type: 'scope', title: 'Nova página' },
      actor,
    )

    await expect(activateAddendum(addendum.id, actor)).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('conta só aditivos ativos no valor vigente', async () => {
    const { actor, contractId } = await draftContract('10000.00')
    await changeContractStatus(contractId, 'active', actor)

    const active = await createAddendum(
      { contractId, type: 'value', title: 'Integração extra', valueDelta: '2500.00' },
      actor,
    )
    // Este fica em rascunho: é proposta de mudança, não mudança.
    await createAddendum(
      { contractId, type: 'value', title: 'Ainda em negociação', valueDelta: '9000.00' },
      actor,
    )
    await activateAddendum(active.id, actor)

    expect(await getEffectiveContractValue(contractId)).toBe('12500.00')
  })

  it('aceita aditivo de redução de valor', async () => {
    const { actor, contractId } = await draftContract('10000.00')
    await changeContractStatus(contractId, 'active', actor)

    const reduction = await createAddendum(
      { contractId, type: 'value', title: 'Retirada do blog', valueDelta: '-1500.00' },
      actor,
    )
    await activateAddendum(reduction.id, actor)

    expect(await getEffectiveContractValue(contractId)).toBe('8500.00')
  })

  it('exige o delta em aditivo de valor e a data em aditivo de prazo', () => {
    const contractId = crypto.randomUUID()

    expect(
      addendumSchema.safeParse({ contractId, type: 'value', title: 'Sem valor' }).success,
    ).toBe(false)
    expect(
      addendumSchema.safeParse({ contractId, type: 'deadline', title: 'Sem data' }).success,
    ).toBe(false)
    expect(
      addendumSchema.safeParse({
        contractId,
        type: 'value',
        title: 'Com valor',
        valueDelta: '1.500,00',
      }).data?.valueDelta,
    ).toBe('1500.00')
  })
})

describe('valores monetários em formato brasileiro', () => {
  it.each([
    ['48.000,00', '48000.00'],
    ['48000', '48000.00'],
    ['R$ 1.234,5', '1234.50'],
    ['1234.56', '1234.56'],
    ['1.234', '1234.00'],
    ['1.234.567', '1234567.00'],
    ['12,5', '12.50'],
    ['-500,00', '-500.00'],
  ])('interpreta %s como %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected)
  })

  it.each(['abc', '12,345,6', '1,2,3', ''])('rejeita %j', (input) => {
    expect(parseMoney(input)).toBeNull()
  })
})
