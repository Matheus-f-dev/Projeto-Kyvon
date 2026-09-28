import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/server/db/client'
import {
  comments,
  contracts,
  notifications,
  opportunities,
  projects,
  supportTickets,
} from '@/server/db/schema'
import { BusinessRuleError, ValidationError } from '@/server/errors'
import { createProject } from '@/server/modules/projects/service'
import {
  countTicketShortcuts,
  getTicketDetail,
  listTickets,
} from '@/server/modules/support/queries'
import {
  addTicketComment,
  assignTicket,
  changeTicketStatus,
  computeDueAt,
  createTicket,
  sendTicketToCommercial,
  updateTicket,
} from '@/server/modules/support/service'
import {
  changeTicketStatusSchema,
  createTicketSchema,
  ticketCommentSchema,
} from '@/shared/schemas/support'

import { contextFor, createTestClient, createTestUser, unique } from './helpers'

/**
 * Suporte: prazo de primeira resposta derivado da prioridade, resolução
 * obrigatória, e a regra 11 — nova demanda vira oportunidade, uma vez só.
 */

async function setup() {
  const gestor = await createTestUser('gestor')
  const agent = await createTestUser('suporte')
  const client = await createTestClient(gestor.id)

  const [contract] = await db
    .insert(contracts)
    .values({
      code: unique('CTR').slice(0, 20),
      title: 'Contrato',
      clientId: client.id,
      status: 'active',
      supportEndsAt: '2026-01-31',
    })
    .returning({ id: contracts.id })

  const project = await createProject(
    { name: unique('Projeto'), clientId: client.id, contractId: contract!.id, ownerId: gestor.id },
    gestor,
  )
  return { gestor, agent, client, projectId: project.id, contractId: contract!.id }
}

const open = (clientId: string, overrides: Partial<Record<string, string>> = {}) =>
  createTicketSchema.parse({
    clientId,
    title: 'Formulário de contato não envia',
    description: 'Cliente relata erro ao enviar o formulário.',
    category: 'bug',
    priority: 'high',
    ...overrides,
  })

async function row(id: string) {
  const [found] = await db.select().from(supportTickets).where(eq(supportTickets.id, id))
  return found!
}

describe('abertura', () => {
  it('calcula o prazo pela prioridade e herda o contrato do projeto', async () => {
    const { agent, client, projectId, contractId } = await setup()
    const { id, code } = await createTicket(open(client.id, { projectId }), agent)

    expect(code).toMatch(/^CHM-\d{5}$/)
    const ticket = await row(id)
    expect(ticket).toMatchObject({ status: 'open', contractId, createdBy: agent.id })
    expect(ticket.dueAt!.getTime() - ticket.createdAt.getTime()).toBe(8 * 60 * 60 * 1000)
  })

  it('projeto e contato precisam ser do cliente', async () => {
    const { agent, client } = await setup()
    const other = await setup()

    await expect(
      createTicket(open(client.id, { projectId: other.projectId }), agent),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      createTicket(open(client.id, { requesterContactId: other.client.contactId }), agent),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('responsável precisa atender chamados', async () => {
    const { agent, client } = await setup()
    const designer = await createTestUser('design')
    await expect(createTicket(open(client.id, { assigneeId: designer.id }), agent)).rejects.toThrow(
      /não atende/,
    )

    const other = await createTestUser('suporte')
    const { id } = await createTicket(open(client.id, { assigneeId: other.id }), agent)
    const [notification] = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(eq(notifications.entityId, id), eq(notifications.type, 'support_assigned')))
    expect(notification?.userId).toBe(other.id)
  })
})

describe('prazo de atendimento', () => {
  it('mudar a prioridade antes de responder recalcula a partir da abertura', async () => {
    const { agent, client } = await setup()
    const { id } = await createTicket(open(client.id, { priority: 'low' }), agent)
    const opened = (await row(id)).createdAt

    await updateTicket(
      id,
      {
        title: 'Formulário',
        description: 'Erro ao enviar.',
        category: 'bug',
        priority: 'critical',
      },
      agent,
    )
    expect((await row(id)).dueAt?.getTime()).toBe(computeDueAt(opened, 'critical').getTime())
  })

  it('resposta ao cliente cumpre o prazo e coloca em atendimento; nota interna não', async () => {
    const { agent, client } = await setup()
    const { id } = await createTicket(open(client.id), agent)

    await addTicketComment(
      ticketCommentSchema.parse({ ticketId: id, body: 'Verificando os logs.' }),
      agent,
    )
    expect(await row(id)).toMatchObject({ status: 'open', firstResponseAt: null })

    await addTicketComment(
      ticketCommentSchema.parse({ ticketId: id, body: 'Já estamos analisando.', toClient: 'on' }),
      agent,
    )
    const answered = await row(id)
    expect(answered.status).toBe('in_progress')
    expect(answered.firstResponseAt).toBeInstanceOf(Date)

    const thread = await db
      .select({ isInternal: comments.isInternal })
      .from(comments)
      .where(eq(comments.supportTicketId, id))
    expect(thread.map((comment) => comment.isInternal)).toEqual([true, false])
  })

  it('lista de atrasados: sem resposta e com o prazo vencido', async () => {
    const { agent, client } = await setup()
    const { id } = await createTicket(open(client.id, { title: unique('Atrasado') }), agent)
    await db
      .update(supportTickets)
      .set({ dueAt: new Date(Date.now() - 60_000) })
      .where(eq(supportTickets.id, id))

    const context = await contextFor(agent)
    const late = await listTickets(context, { filtro: 'atrasados', q: 'Atrasado' })
    expect(late.items.some((item) => item.id === id)).toBe(true)
    expect((await countTicketShortcuts(context)).overdue).toBeGreaterThan(0)

    await changeTicketStatus(
      changeTicketStatusSchema.parse({ ticketId: id, status: 'in_progress' }),
      agent,
    )
    const after = await listTickets(context, { filtro: 'atrasados', q: 'Atrasado' })
    expect(after.items.some((item) => item.id === id)).toBe(false)
  })
})

describe('status', () => {
  it('resolver exige a solução; reabrir limpa a solução; fechado é final', async () => {
    const { agent, client } = await setup()
    const { id } = await createTicket(open(client.id), agent)

    expect(changeTicketStatusSchema.safeParse({ ticketId: id, status: 'resolved' }).success).toBe(
      false,
    )

    await changeTicketStatus(
      changeTicketStatusSchema.parse({
        ticketId: id,
        status: 'resolved',
        resolution: 'Corrigido o SMTP.',
      }),
      agent,
    )
    expect(await row(id)).toMatchObject({ status: 'resolved', resolution: 'Corrigido o SMTP.' })

    await changeTicketStatus(
      changeTicketStatusSchema.parse({ ticketId: id, status: 'in_progress' }),
      agent,
    )
    expect(await row(id)).toMatchObject({
      status: 'in_progress',
      resolution: null,
      resolvedAt: null,
    })

    await changeTicketStatus(
      changeTicketStatusSchema.parse({
        ticketId: id,
        status: 'resolved',
        resolution: 'Agora sim.',
      }),
      agent,
    )
    await changeTicketStatus(
      changeTicketStatusSchema.parse({ ticketId: id, status: 'closed' }),
      agent,
    )

    await expect(
      changeTicketStatus(
        changeTicketStatusSchema.parse({ ticketId: id, status: 'in_progress' }),
        agent,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError)
    await expect(
      addTicketComment(ticketCommentSchema.parse({ ticketId: id, body: 'Mais uma coisa' }), agent),
    ).rejects.toBeInstanceOf(BusinessRuleError)
  })

  it('assumir o chamado', async () => {
    const { agent, client } = await setup()
    const { id } = await createTicket(open(client.id), agent)
    await assignTicket(id, agent.id, agent)
    expect((await row(id)).assigneeId).toBe(agent.id)
  })
})

describe('suporte → comercial (regra 11)', () => {
  it('nova demanda vira oportunidade vinculada, resolve o chamado e avisa o dono do cliente', async () => {
    const { agent, gestor, client } = await setup()
    const { id } = await createTicket(
      open(client.id, {
        category: 'new_demand',
        title: 'Quer um app mobile',
        requesterContactId: client.contactId,
      }),
      agent,
    )

    const { opportunityId, code } = await sendTicketToCommercial(id, agent)

    const [opportunity] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
    expect(opportunity).toMatchObject({
      clientId: client.id,
      contactId: client.contactId,
      ownerId: gestor.id,
      stage: 'new_contact',
      title: 'Nova demanda: Quer um app mobile',
    })
    expect(opportunity?.description).toContain((await row(id)).code)

    expect(await row(id)).toMatchObject({
      convertedOpportunityId: opportunityId,
      status: 'resolved',
      resolution: `Encaminhado ao Comercial como ${code}.`,
    })

    const [notification] = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.entityId, opportunityId),
          eq(notifications.type, 'opportunity_assigned'),
        ),
      )
    expect(notification?.userId).toBe(gestor.id)

    // Uma vez só: resolvido pela conversão, pedir de novo é recusado.
    await expect(sendTicketToCommercial(id, agent)).rejects.toThrow(/já foi enviado/)
  })

  it('só chamados de nova demanda', async () => {
    const { agent, client } = await setup()
    const { id } = await createTicket(open(client.id, { category: 'bug' }), agent)
    await expect(sendTicketToCommercial(id, agent)).rejects.toThrow(/Nova demanda/)
  })

  it('a oportunidade gerada só aparece para quem vê o pipeline', async () => {
    const { agent, client } = await setup()
    const { id } = await createTicket(open(client.id, { category: 'new_demand' }), agent)
    await sendTicketToCommercial(id, agent)

    // Suporte vê o pipeline por padrão; com `crm.read` negado individualmente, não.
    const withoutCrm = await contextFor(agent, [{ key: 'crm.read', effect: 'deny' }])
    expect((await getTicketDetail(withoutCrm, id))?.opportunity).toBeNull()
    expect((await getTicketDetail(await contextFor(agent), id))?.opportunity?.code).toMatch(/^OPP-/)

    const comercial = await createTestUser('comercial')
    const comercialView = await getTicketDetail(await contextFor(comercial), id)
    expect(comercialView?.opportunity?.code).toMatch(/^OPP-/)
  })

  it('suporte do contrato vencido aparece no detalhe', async () => {
    const { agent, client, projectId } = await setup()
    const { id } = await createTicket(open(client.id, { projectId }), agent)
    const detail = await getTicketDetail(await contextFor(agent), id)
    expect(detail?.contract?.supportEndsAt).toBe('2026-01-31')
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
    expect(detail?.project?.id).toBe(project?.id)
  })
})
