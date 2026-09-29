import { describe, expect, it } from 'vitest'

import { createOpportunity, markOpportunityWon } from '@/server/modules/crm/service'
import {
  getCommercialReport,
  getFinancialReport,
  getSupportReport,
  parsePeriod,
  periodMonths,
} from '@/server/modules/reports/queries'

import { contextFor, createTestClient, createTestUser, unique } from './helpers'

/**
 * Relatórios: meses no fuso da empresa, contagens por mês e o mesmo corte de
 * permissão do resto do sistema — quem não lê o módulo não recebe o bloco.
 */

describe('período', () => {
  it('lista os meses do mais antigo ao atual, atravessando a virada do ano', () => {
    expect(periodMonths(3, new Date('2026-02-15T12:00:00Z'))).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expect(periodMonths(12, new Date('2026-09-28T12:00:00Z'))).toHaveLength(12)
  })

  it('usa o fuso da empresa, não o UTC', () => {
    // 01/10 02:00 UTC ainda é 30/09 em São Paulo.
    const months = periodMonths(3, new Date('2026-10-01T02:00:00Z'))
    expect(months[months.length - 1]).toBe('2026-09')
  })

  it('período inválido cai no padrão de 6 meses', () => {
    expect(parsePeriod('12')).toBe(12)
    expect(parsePeriod('7')).toBe(6)
    expect(parsePeriod(undefined)).toBe(6)
  })
})

describe('comercial', () => {
  it('conta a oportunidade ganha no mês atual', async () => {
    const gestor = await createTestUser('gestor')
    const context = await contextFor(gestor)
    const months = periodMonths(3)
    const current = months[months.length - 1]

    const before = await getCommercialReport(context, months)
    const client = await createTestClient(gestor.id)
    const opportunity = await createOpportunity(
      { title: unique('Oportunidade'), clientId: client.id, estimatedValue: '1000.00' },
      gestor,
    )
    await markOpportunityWon(opportunity.id, gestor)
    const after = await getCommercialReport(context, months)

    const row = (report: typeof after) => report?.months.find((item) => item.month === current)
    expect(row(after)!.created - row(before)!.created).toBe(1)
    expect(row(after)!.won - row(before)!.won).toBe(1)
    expect(after!.totals.wonValue! - before!.totals.wonValue!).toBe(1000)
  })

  it('omite valores para quem não tem crm.values.read', async () => {
    const designer = await createTestUser('design')
    const context = await contextFor(designer, [{ key: 'crm.read', effect: 'allow' }])
    const report = await getCommercialReport(context, periodMonths(3))
    expect(report).not.toBeNull()
    expect(report!.totals.wonValue).toBeNull()
    expect(report!.months.every((row) => row.wonValue === null)).toBe(true)
  })
})

describe('permissões', () => {
  it('não consulta blocos de módulos que a pessoa não lê', async () => {
    const designer = await createTestUser('design')
    const context = await contextFor(designer)
    const months = periodMonths(3)
    expect(await getCommercialReport(context, months)).toBeNull()
    expect(await getSupportReport(context, months)).toBeNull()
    expect(await getFinancialReport(context, months)).toBeNull()
  })
})
