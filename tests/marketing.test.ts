import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import { cases, marketingContents, projects } from '@/server/db/schema'
import { BusinessRuleError, ConflictError, ValidationError } from '@/server/errors'
import { listCalendar, listCaseEligibleProjects } from '@/server/modules/marketing/queries'
import {
  createCase,
  createContent,
  deleteContent,
  moveCase,
  moveContent,
  publishCase,
  recordCaseAuthorization,
  requestCaseAuthorizationAgain,
  updateCaseContent,
  updateContent,
} from '@/server/modules/marketing/service'
import { createProject } from '@/server/modules/projects/service'
import { dateToLocalDateTime, localDateTimeToDate } from '@/shared/dates'
import {
  caseAuthorizationSchema,
  contentSchema,
  moveContentSchema,
} from '@/shared/schemas/marketing'

import { contextFor, createTestClient, createTestUser, unique } from './helpers'

/**
 * Marketing: o fluxo do conteúdo até o ar (publicado é final e exige link),
 * o agendamento no fuso da empresa e a regra dos cases — nada avança sem a
 * autorização do cliente registrada.
 */

const content = (overrides: Partial<Record<string, string>> = {}) =>
  contentSchema.parse({ title: unique('Post'), format: 'post', channel: 'linkedin', ...overrides })

const move = (contentId: string, status: string, extra: Record<string, string> = {}) =>
  moveContentSchema.parse({ contentId, status, ...extra })

async function walkTo(id: string, actor: { id: string; email: string }, path: string[]) {
  for (const status of path) await moveContent(move(id, status), actor)
}

async function stored(id: string) {
  const [row] = await db.select().from(marketingContents).where(eq(marketingContents.id, id))
  return row!
}

describe('agendamento no fuso da empresa', () => {
  it('14:00 em São Paulo é 17:00 UTC, ida e volta', () => {
    const date = localDateTimeToDate('2026-09-30T14:00')
    expect(date?.toISOString()).toBe('2026-09-30T17:00:00.000Z')
    expect(dateToLocalDateTime(date!)).toBe('2026-09-30T14:00')
  })

  it('recusa formato inválido', () => {
    expect(localDateTimeToDate('30/09/2026 14:00')).toBeNull()
  })
})

describe('fluxo do conteúdo', () => {
  it('não pula etapas; agendar exige horário; publicar exige link e é final', async () => {
    const author = await createTestUser('marketing')
    const { id, code } = await createContent(content(), author)
    expect(code).toMatch(/^CNT-/)

    await expect(moveContent(move(id, 'approved'), author)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )

    await walkTo(id, author, ['production', 'review', 'approved'])

    expect(moveContentSchema.safeParse({ contentId: id, status: 'scheduled' }).success).toBe(false)
    await moveContent(move(id, 'scheduled', { scheduledAt: '2026-10-05T09:30' }), author)
    expect((await stored(id)).scheduledAt?.toISOString()).toBe('2026-10-05T12:30:00.000Z')

    // Desagendar limpa o horário.
    await moveContent(move(id, 'approved'), author)
    expect((await stored(id)).scheduledAt).toBeNull()

    expect(moveContentSchema.safeParse({ contentId: id, status: 'published' }).success).toBe(false)
    expect(
      moveContentSchema.safeParse({
        contentId: id,
        status: 'published',
        publishedUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false)

    await moveContent(
      move(id, 'published', { publishedUrl: 'https://linkedin.com/posts/kyvon-1' }),
      author,
    )
    const published = await stored(id)
    expect(published).toMatchObject({
      status: 'published',
      publishedUrl: 'https://linkedin.com/posts/kyvon-1',
    })
    expect(published.publishedAt).toBeInstanceOf(Date)

    await expect(moveContent(move(id, 'approved'), author)).rejects.toBeInstanceOf(
      BusinessRuleError,
    )
    await expect(updateContent(id, content({ title: 'Outro' }), author)).rejects.toThrow(
      /publicado/,
    )
  })

  it('só ideia é descartada', async () => {
    const author = await createTestUser('marketing')
    const idea = await createContent(content(), author)
    await deleteContent(idea.id, author)
    expect(
      await db.select().from(marketingContents).where(eq(marketingContents.id, idea.id)),
    ).toHaveLength(0)

    const started = await createContent(content(), author)
    await moveContent(move(started.id, 'production'), author)
    await expect(deleteContent(started.id, author)).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('responsável precisa ser do marketing', async () => {
    const author = await createTestUser('marketing')
    const dev = await createTestUser('dev')
    await expect(createContent(content({ ownerId: dev.id }), author)).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('calendário mostra o conteúdo no dia em que vai ao ar, não no prazo', async () => {
    const author = await createTestUser('marketing')
    const title = unique('Agendado')
    const { id } = await createContent(content({ title, dueDate: '2031-03-10' }), author)
    await walkTo(id, author, ['production', 'review', 'approved'])
    await moveContent(move(id, 'scheduled', { scheduledAt: '2031-03-31T22:30' }), author)

    const context = await contextFor(author)
    const march = await listCalendar(context, '2031-03', { q: title })
    // 22:30 em São Paulo já é 01:30 UTC de 1º de abril — mas o dia é 31 de março.
    expect(march.map((entry) => [entry.day, entry.kind])).toEqual([['2031-03-31', 'scheduled']])
    expect(await listCalendar(context, '2031-04', { q: title })).toEqual([])
  })
})

describe('cases', () => {
  async function deliveredProject() {
    const gestor = await createTestUser('gestor')
    const author = await createTestUser('marketing')
    const client = await createTestClient(gestor.id)
    const project = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: gestor.id },
      gestor,
    )
    await db.update(projects).set({ launchedAt: new Date() }).where(eq(projects.id, project.id))
    return { author, client, projectId: project.id }
  }

  const authorize = (caseId: string, contactId?: string, decision = 'authorized') =>
    caseAuthorizationSchema.parse({
      caseId,
      decision,
      contactId,
      notes: 'Autorizado por e-mail em 12/09.',
    })

  it('só nasce de projeto entregue, um por projeto', async () => {
    const gestor = await createTestUser('gestor')
    const client = await createTestClient(gestor.id)
    const draft = await createProject(
      { name: unique('Projeto'), clientId: client.id, ownerId: gestor.id },
      gestor,
    )
    await expect(createCase({ projectId: draft.id, title: 'Case' }, gestor)).rejects.toThrow(
      /entregue/,
    )

    const { author, projectId } = await deliveredProject()
    expect((await listCaseEligibleProjects()).some((project) => project.id === projectId)).toBe(
      true,
    )

    await createCase({ projectId, title: 'Case' }, author)
    await expect(createCase({ projectId, title: 'Outro' }, author)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect((await listCaseEligibleProjects()).some((project) => project.id === projectId)).toBe(
      false,
    )
  })

  it('sem autorização não entra em produção; autorização precisa de contato do cliente', async () => {
    const { author, client, projectId } = await deliveredProject()
    const { id } = await createCase({ projectId, title: 'Case' }, author)

    await expect(moveCase(id, 'in_production', author)).rejects.toBeInstanceOf(BusinessRuleError)

    const other = await createTestClient()
    await expect(
      recordCaseAuthorization(authorize(id, other.contactId), author),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      caseAuthorizationSchema.safeParse({ caseId: id, decision: 'authorized', notes: 'ok' })
        .success,
    ).toBe(false)

    await recordCaseAuthorization(authorize(id, client.contactId), author)
    const [row] = await db.select().from(cases).where(eq(cases.id, id))
    expect(row).toMatchObject({ status: 'authorized', authorizedByContactId: client.contactId })
    expect(row?.authorizedAt).toBeInstanceOf(Date)
  })

  it('recusa bloqueia; pedir de novo reabre', async () => {
    const { author, projectId } = await deliveredProject()
    const { id } = await createCase({ projectId, title: 'Case' }, author)

    await recordCaseAuthorization(authorize(id, undefined, 'denied'), author)
    await expect(updateCaseContent(id, { title: 'Case', summary: 'x' }, author)).rejects.toThrow(
      /não autorizou/,
    )
    await expect(moveCase(id, 'in_production', author)).rejects.toBeInstanceOf(BusinessRuleError)

    await requestCaseAuthorizationAgain(id, author)
    const [row] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, id))
    expect(row?.status).toBe('pending_authorization')
  })

  it('revisão exige o texto completo; publicado é final', async () => {
    const { author, client, projectId } = await deliveredProject()
    const { id } = await createCase({ projectId, title: 'Case' }, author)
    await recordCaseAuthorization(authorize(id, client.contactId), author)
    await moveCase(id, 'in_production', author)

    await expect(moveCase(id, 'review', author)).rejects.toThrow(/Preencha/)

    await updateCaseContent(
      id,
      {
        title: 'Case',
        summary: 'Resumo',
        challenge: 'Desafio',
        solution: 'Solução',
        results: '+40% leads',
      },
      author,
    )
    await moveCase(id, 'review', author)
    await publishCase(id, 'https://kyvon.com.br/cases/aurora', author)

    const [row] = await db.select().from(cases).where(eq(cases.id, id))
    expect(row).toMatchObject({
      status: 'published',
      publishedUrl: 'https://kyvon.com.br/cases/aurora',
    })
    await expect(updateCaseContent(id, { title: 'Mudou' }, author)).rejects.toThrow(/publicado/)
  })
})
