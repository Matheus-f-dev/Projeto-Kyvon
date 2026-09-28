import { and, eq, isNull, sql } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import {
  clients,
  comments,
  contacts,
  leadSources,
  opportunities,
  projects,
  supportTickets,
} from '@/server/db/schema'
import { BusinessRuleError, NotFoundError, ValidationError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { notify } from '@/server/modules/notifications/service'
import type { Actor } from '@/server/modules/projects/service'
import { userHasPermission } from '@/server/modules/users/queries'
import {
  SUPPORT_SLA_HOURS,
  SUPPORT_STATUS,
  SUPPORT_TRANSITIONS,
  type SupportPriority,
} from '@/shared/domain'
import type {
  ChangeTicketStatusInput,
  CreateTicketInput,
  TicketCommentInput,
  UpdateTicketInput,
} from '@/shared/schemas/support'

/**
 * Suporte pós-lançamento.
 *
 * O prazo (`dueAt`) mede a **primeira resposta**: abertura + horas da
 * prioridade (`SUPPORT_SLA_HOURS`). Responder é sair de "Aberto" ou registrar
 * uma resposta ao cliente — o que acontecer primeiro. Mudar a prioridade antes
 * disso recalcula o prazo a partir da abertura, não de agora: rebaixar a
 * prioridade não pode "zerar o relógio".
 */

export const ticketLink = (ticketId: string) => `/suporte?chamado=${ticketId}`

type TicketRow = typeof supportTickets.$inferSelect

export function computeDueAt(openedAt: Date, priority: SupportPriority): Date {
  return new Date(openedAt.getTime() + SUPPORT_SLA_HOURS[priority] * 60 * 60 * 1000)
}

const label = (row: Pick<TicketRow, 'code' | 'title'>) => `${row.code} · ${row.title}`

async function lockTicket(id: string, tx: Database): Promise<TicketRow> {
  const [row] = await tx
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1)
    .for('update')
  if (!row) throw new NotFoundError('Chamado')
  return row
}

function assertEditable(row: TicketRow) {
  if (row.status === 'closed' || row.status === 'cancelled') {
    throw new BusinessRuleError(
      'Chamado fechado ou cancelado não é mais alterado. Abra um novo, se preciso.',
    )
  }
}

/** Projeto e contato precisam ser do cliente; o contrato vem do projeto. */
async function resolveLinks(
  clientId: string,
  input: { projectId?: string; requesterContactId?: string; assigneeId?: string },
  tx: Database,
): Promise<{ contractId: string | null }> {
  let contractId: string | null = null

  if (input.projectId) {
    const [project] = await tx
      .select({ clientId: projects.clientId, contractId: projects.contractId })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1)
    if (!project || project.clientId !== clientId) {
      throw new ValidationError('O projeto precisa ser deste cliente.', {
        projectId: ['Selecione um projeto do cliente.'],
      })
    }
    contractId = project.contractId
  }

  if (input.requesterContactId) {
    const [contact] = await tx
      .select({ clientId: contacts.clientId })
      .from(contacts)
      .where(and(eq(contacts.id, input.requesterContactId), isNull(contacts.deletedAt)))
      .limit(1)
    if (!contact || contact.clientId !== clientId) {
      throw new ValidationError('O contato precisa ser deste cliente.', {
        requesterContactId: ['Selecione um contato do cliente.'],
      })
    }
  }

  if (input.assigneeId && !(await userHasPermission(input.assigneeId, 'support.write', tx))) {
    throw new ValidationError('Esta pessoa não atende chamados.', {
      assigneeId: ['Escolha alguém do atendimento.'],
    })
  }

  return { contractId }
}

async function notifyAssignee(
  row: Pick<TicketRow, 'id' | 'code' | 'title'>,
  assigneeId: string,
  actor: Actor,
  body: string,
  tx: Database,
) {
  await notify(
    {
      userId: assigneeId,
      type: 'support_assigned',
      title: label(row),
      body,
      actorId: actor.id,
      entityType: 'support_ticket',
      entityId: row.id,
      link: ticketLink(row.id),
    },
    tx,
  )
}

async function activity(
  row: TicketRow,
  summary: string,
  actor: Actor,
  tx: Database,
  verb:
    | 'created'
    | 'updated'
    | 'status_changed'
    | 'assigned'
    | 'commented'
    | 'converted' = 'status_changed',
) {
  await recordActivity(
    {
      actorId: actor.id,
      verb,
      entityType: 'support_ticket',
      entityId: row.id,
      entityLabel: label(row),
      summary,
      projectId: row.projectId,
      clientId: row.clientId,
    },
    tx,
  )
}

// ── Abertura ─────────────────────────────────────────────────────────────────

export async function createTicket(
  input: CreateTicketInput,
  actor: Actor,
): Promise<{ id: string; code: string }> {
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select({ id: clients.id, status: clients.status })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
      .limit(1)
    if (!client) throw new NotFoundError('Cliente')

    const { contractId } = await resolveLinks(client.id, input, tx)

    const code = await nextCode('support_ticket', tx)
    const openedAt = new Date()

    const [row] = await tx
      .insert(supportTickets)
      .values({
        code,
        title: input.title,
        description: input.description,
        clientId: client.id,
        projectId: input.projectId ?? null,
        contractId,
        requesterContactId: input.requesterContactId ?? null,
        category: input.category,
        priority: input.priority,
        status: 'open',
        assigneeId: input.assigneeId ?? null,
        createdBy: actor.id,
        dueAt: computeDueAt(openedAt, input.priority),
        createdAt: openedAt,
      })
      .returning()

    if (!row) throw new Error('Falha ao abrir o chamado.')

    if (row.assigneeId) {
      await notifyAssignee(row, row.assigneeId, actor, 'Novo chamado atribuído a você.', tx)
    }

    await activity(row, 'abriu o chamado', actor, tx, 'created')
    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'support_ticket',
        entityId: row.id,
        entityLabel: label(row),
        changes: {
          status: { from: null, to: 'open' },
          priority: { from: null, to: input.priority },
          category: { from: null, to: input.category },
        },
      },
      tx,
    )

    return { id: row.id, code }
  })
}

// ── Edição ───────────────────────────────────────────────────────────────────

const AUDITED_FIELDS = [
  'title',
  'description',
  'projectId',
  'requesterContactId',
  'category',
  'priority',
  'assigneeId',
] as const

export async function updateTicket(
  id: string,
  input: UpdateTicketInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockTicket(id, tx)
    assertEditable(row)
    if (row.convertedOpportunityId && input.category !== 'new_demand') {
      throw new BusinessRuleError('Chamado já enviado ao Comercial continua como "Nova demanda".')
    }

    const { contractId } = await resolveLinks(row.clientId, input, tx)

    const next = {
      title: input.title,
      description: input.description,
      projectId: input.projectId ?? null,
      requesterContactId: input.requesterContactId ?? null,
      category: input.category,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
    }

    const changes = diffChanges(row, next, AUDITED_FIELDS)
    if (!changes) return

    const dueAt =
      next.priority !== row.priority && !row.firstResponseAt
        ? computeDueAt(row.createdAt, next.priority)
        : row.dueAt

    await tx
      .update(supportTickets)
      .set({ ...next, contractId: next.projectId ? contractId : row.contractId, dueAt })
      .where(eq(supportTickets.id, id))

    if (next.assigneeId && next.assigneeId !== row.assigneeId) {
      await notifyAssignee(row, next.assigneeId, actor, 'Chamado atribuído a você.', tx)
      await activity(row, 'reatribuiu o chamado', actor, tx, 'assigned')
    }

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'support_ticket',
        entityId: row.id,
        entityLabel: label(row),
        changes:
          dueAt !== row.dueAt ? { ...changes, dueAt: { from: row.dueAt, to: dueAt } } : changes,
      },
      tx,
    )
  })
}

/** Atribui (ou assume) o chamado sem passar pelo formulário inteiro. */
export async function assignTicket(
  id: string,
  assigneeId: string | null,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockTicket(id, tx)
    assertEditable(row)
    if (row.assigneeId === assigneeId) return

    if (assigneeId && !(await userHasPermission(assigneeId, 'support.write', tx))) {
      throw new ValidationError('Esta pessoa não atende chamados.')
    }

    await tx.update(supportTickets).set({ assigneeId }).where(eq(supportTickets.id, id))

    if (assigneeId) {
      if (assigneeId !== actor.id) {
        await notifyAssignee(row, assigneeId, actor, 'Chamado atribuído a você.', tx)
      }
      await activity(
        row,
        assigneeId === actor.id ? 'assumiu o chamado' : 'atribuiu o chamado',
        actor,
        tx,
        'assigned',
      )
    }

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'support_ticket',
        entityId: row.id,
        entityLabel: label(row),
        changes: { assigneeId: { from: row.assigneeId, to: assigneeId } },
      },
      tx,
    )
  })
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function changeTicketStatus(
  input: ChangeTicketStatusInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockTicket(input.ticketId, tx)
    if (row.status === input.status) return

    if (!SUPPORT_TRANSITIONS[row.status].includes(input.status)) {
      throw new BusinessRuleError(
        `Não é possível passar de "${SUPPORT_STATUS[row.status].label}" para "${SUPPORT_STATUS[input.status].label}".`,
      )
    }

    const now = new Date()
    const patch: Partial<typeof supportTickets.$inferInsert> = { status: input.status }

    // Qualquer movimento de "Aberto" (exceto cancelar) conta como primeira resposta.
    if (!row.firstResponseAt && input.status !== 'cancelled') patch.firstResponseAt = now

    if (input.status === 'resolved') {
      patch.resolution = input.resolution ?? null
      patch.resolvedAt = now
    }
    if (input.status === 'closed') patch.closedAt = now
    if (input.status === 'cancelled') {
      patch.resolution = input.resolution ?? null
      patch.closedAt = now
    }
    // Reabrir: a solução anterior não resolveu. Ela fica na auditoria.
    if (row.status === 'resolved' && input.status === 'in_progress') {
      patch.resolution = null
      patch.resolvedAt = null
    }

    await tx.update(supportTickets).set(patch).where(eq(supportTickets.id, row.id))

    const reopened = row.status === 'resolved' && input.status === 'in_progress'
    await activity(
      row,
      reopened
        ? 'reabriu o chamado'
        : input.status === 'cancelled'
          ? `cancelou o chamado: ${input.resolution ?? ''}`
          : `moveu para ${SUPPORT_STATUS[input.status].label}`,
      actor,
      tx,
    )

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'support_ticket',
        entityId: row.id,
        entityLabel: label(row),
        changes: {
          status: { from: row.status, to: input.status },
          ...(patch.resolution !== undefined
            ? { resolution: { from: row.resolution, to: patch.resolution } }
            : {}),
        },
      },
      tx,
    )

    // Quem abriu fica sabendo que o chamado foi resolvido por outra pessoa.
    if (input.status === 'resolved' && row.createdBy && row.createdBy !== actor.id) {
      await notify(
        {
          userId: row.createdBy,
          type: 'support_assigned',
          title: label(row),
          body: 'Chamado resolvido.',
          actorId: actor.id,
          entityType: 'support_ticket',
          entityId: row.id,
          link: ticketLink(row.id),
        },
        tx,
      )
    }
  })
}

// ── Interações ───────────────────────────────────────────────────────────────

/**
 * Registra uma nota interna ou uma resposta dada ao cliente.
 *
 * A primeira resposta ao cliente cumpre o prazo de atendimento e, se o chamado
 * ainda estava "Aberto", já o coloca "Em atendimento" — ninguém precisa mudar o
 * status à mão depois de responder.
 */
export async function addTicketComment(input: TicketCommentInput, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockTicket(input.ticketId, tx)
    assertEditable(row)

    await tx.insert(comments).values({
      supportTicketId: row.id,
      body: input.body,
      authorId: actor.id,
      isInternal: !input.toClient,
    })

    if (input.toClient) {
      const patch: Partial<typeof supportTickets.$inferInsert> = {}
      if (!row.firstResponseAt) patch.firstResponseAt = new Date()
      if (row.status === 'open') patch.status = 'in_progress'
      if (Object.keys(patch).length > 0) {
        await tx.update(supportTickets).set(patch).where(eq(supportTickets.id, row.id))
      }
    }

    await activity(
      row,
      input.toClient ? 'registrou uma resposta ao cliente' : 'adicionou uma nota interna',
      actor,
      tx,
      'commented',
    )

    if (row.assigneeId && row.assigneeId !== actor.id) {
      await notify(
        {
          userId: row.assigneeId,
          type: 'support_assigned',
          title: label(row),
          body: input.toClient
            ? 'Nova resposta registrada no chamado.'
            : 'Nova nota interna no chamado.',
          actorId: actor.id,
          entityType: 'support_ticket',
          entityId: row.id,
          link: ticketLink(row.id),
        },
        tx,
      )
    }
  })
}

// ── Suporte → Comercial ──────────────────────────────────────────────────────

/**
 * "Enviar para Comercial" (regra 11).
 *
 * Um pedido de nova demanda não é trabalho de suporte: vira oportunidade no
 * pipeline, já com cliente, contato e a descrição do chamado, com o dono do
 * cliente como responsável. O chamado é resolvido com o apontamento para a
 * oportunidade — o atendimento terminou; a venda começa.
 *
 * É o único caminho em que alguém sem `crm.write` cria uma oportunidade — por
 * isso os campos são todos derivados do chamado, nada vem do formulário.
 */
export async function sendTicketToCommercial(
  id: string,
  actor: Actor,
): Promise<{ opportunityId: string; code: string }> {
  return db.transaction(async (tx) => {
    const row = await lockTicket(id, tx)
    assertEditable(row)

    if (row.category !== 'new_demand') {
      throw new BusinessRuleError(
        'Só chamados de "Nova demanda" vão para o Comercial. Ajuste a categoria antes.',
      )
    }
    if (row.convertedOpportunityId)
      throw new BusinessRuleError('Este chamado já foi enviado ao Comercial.')

    const [client] = await tx
      .select({ id: clients.id, name: clients.name, ownerId: clients.ownerId })
      .from(clients)
      .where(eq(clients.id, row.clientId))
      .limit(1)
    if (!client) throw new NotFoundError('Cliente')

    const [source] = await tx
      .select({ id: leadSources.id })
      .from(leadSources)
      .where(eq(leadSources.key, 'cliente-existente'))
      .limit(1)

    const [position] = await tx
      .select({ max: sql<number>`coalesce(max(${opportunities.position}), -1)::int` })
      .from(opportunities)
      .where(eq(opportunities.stage, 'new_contact'))

    const code = await nextCode('opportunity', tx)
    const title = truncate(`Nova demanda: ${row.title}`, 180)

    const [opportunity] = await tx
      .insert(opportunities)
      .values({
        code,
        title,
        clientId: client.id,
        contactId: row.requesterContactId,
        sourceId: source?.id ?? null,
        ownerId: client.ownerId,
        stage: 'new_contact',
        description: truncate(`Originada do chamado ${row.code}.\n\n${row.description}`, 8000),
        position: (position?.max ?? -1) + 1,
      })
      .returning({ id: opportunities.id })

    if (!opportunity) throw new Error('Falha ao criar a oportunidade.')

    const now = new Date()
    await tx
      .update(supportTickets)
      .set({
        convertedOpportunityId: opportunity.id,
        status: 'resolved',
        resolution: `Encaminhado ao Comercial como ${code}.`,
        resolvedAt: now,
        firstResponseAt: row.firstResponseAt ?? now,
      })
      .where(eq(supportTickets.id, row.id))

    if (client.ownerId) {
      await notify(
        {
          userId: client.ownerId,
          type: 'opportunity_assigned',
          title: `${code} · ${title}`,
          body: `Nova demanda de ${client.name}, vinda do chamado ${row.code}.`,
          actorId: actor.id,
          entityType: 'opportunity',
          entityId: opportunity.id,
          link: `/comercial?oportunidade=${opportunity.id}`,
        },
        tx,
      )
    }

    await activity(row, `enviou ao Comercial como ${code}`, actor, tx, 'converted')
    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'opportunity',
        entityId: opportunity.id,
        entityLabel: `${code} · ${title}`,
        summary: `criou a oportunidade a partir do chamado ${row.code}`,
        projectId: row.projectId,
        clientId: client.id,
      },
      tx,
    )

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'support_ticket',
        entityId: row.id,
        entityLabel: label(row),
        changes: {
          status: { from: row.status, to: 'resolved' },
          convertedOpportunityId: { from: null, to: opportunity.id },
        },
      },
      tx,
    )
    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'opportunity',
        entityId: opportunity.id,
        entityLabel: `${code} · ${title}`,
        changes: {
          origin: { from: null, to: `support_ticket:${row.id}` },
          stage: { from: null, to: 'new_contact' },
        },
      },
      tx,
    )

    return { opportunityId: opportunity.id, code }
  })
}

// ── Utilidades ───────────────────────────────────────────────────────────────

export async function getTicketOwnership(
  id: string,
): Promise<{ assigneeId: string | null; clientId: string; projectId: string | null }> {
  const [row] = await db
    .select({
      assigneeId: supportTickets.assigneeId,
      clientId: supportTickets.clientId,
      projectId: supportTickets.projectId,
    })
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1)
  if (!row) throw new NotFoundError('Chamado')
  return row
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
