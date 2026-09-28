import { and, eq, isNull } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import {
  cases,
  contacts,
  marketingCampaigns,
  marketingContents,
  projects,
} from '@/server/db/schema'
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import type { Actor } from '@/server/modules/projects/service'
import { userHasPermission } from '@/server/modules/users/queries'
import { localDateTimeToDate } from '@/shared/dates'
import {
  CASE_STATUS,
  CASE_TRANSITIONS,
  CONTENT_STATUS,
  CONTENT_TRANSITIONS,
  type CaseStatus,
} from '@/shared/domain'
import type {
  CampaignInput,
  CaseAuthorizationInput,
  CaseContentInput,
  ContentInput,
  CreateCaseInput,
  MoveContentInput,
} from '@/shared/schemas/marketing'

/**
 * Marketing da própria Kyvon.
 *
 * Conteúdo: ideia → produção → revisão → aprovado → agendado → publicado.
 * Publicado é final e exige o link — o que está no ar vira histórico.
 *
 * Case: só sai de "Aguardando autorização" com a resposta do cliente
 * registrada (quem, quando, como). Sem isso, nada de produção nem publicação.
 */

async function assertOwner(ownerId: string | undefined, tx: Database) {
  if (ownerId && !(await userHasPermission(ownerId, 'marketing.write', tx))) {
    throw new ValidationError('Esta pessoa não trabalha no marketing.', {
      ownerId: ['Escolha alguém do marketing.'],
    })
  }
}

// ── Campanhas ────────────────────────────────────────────────────────────────

const CAMPAIGN_FIELDS = [
  'name',
  'objective',
  'status',
  'startDate',
  'endDate',
  'budget',
  'ownerId',
] as const

function campaignValues(input: CampaignInput) {
  return {
    name: input.name,
    objective: input.objective ?? null,
    status: input.status,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    budget: input.budget ?? null,
    ownerId: input.ownerId ?? null,
  }
}

export async function createCampaign(input: CampaignInput, actor: Actor): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await assertOwner(input.ownerId, tx)
    const [row] = await tx
      .insert(marketingCampaigns)
      .values(campaignValues(input))
      .returning({ id: marketingCampaigns.id })
    if (!row) throw new Error('Falha ao criar campanha.')

    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'marketing_campaign',
        entityId: row.id,
        entityLabel: input.name,
        changes: { status: { from: null, to: input.status } },
      },
      tx,
    )
    return row
  })
}

export async function updateCampaign(
  id: string,
  input: CampaignInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.id, id))
      .limit(1)
    if (!current) throw new NotFoundError('Campanha')
    await assertOwner(input.ownerId, tx)

    const next = campaignValues(input)
    const normalized = {
      ...current,
      budget: current.budget === null ? null : Number(current.budget).toFixed(2),
    }
    const changes = diffChanges(normalized, next, CAMPAIGN_FIELDS)
    if (!changes) return

    await tx.update(marketingCampaigns).set(next).where(eq(marketingCampaigns.id, id))
    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'marketing_campaign',
        entityId: id,
        entityLabel: next.name,
        changes,
      },
      tx,
    )
  })
}

// ── Conteúdos ────────────────────────────────────────────────────────────────

type ContentRow = typeof marketingContents.$inferSelect
const contentLabel = (row: Pick<ContentRow, 'code' | 'title'>) => `${row.code} · ${row.title}`

async function assertCampaign(campaignId: string | undefined, tx: Database) {
  if (!campaignId) return
  const [campaign] = await tx
    .select({ id: marketingCampaigns.id })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.id, campaignId))
    .limit(1)
  if (!campaign)
    throw new ValidationError('Campanha inexistente.', { campaignId: ['Selecione uma campanha.'] })
}

function contentValues(input: ContentInput) {
  return {
    title: input.title,
    format: input.format,
    channel: input.channel,
    campaignId: input.campaignId ?? null,
    ownerId: input.ownerId ?? null,
    dueDate: input.dueDate ?? null,
    briefing: input.briefing ?? null,
    copy: input.copy ?? null,
    referencesNotes: input.referencesNotes ?? null,
  }
}

const CONTENT_FIELDS = [
  'title',
  'format',
  'channel',
  'campaignId',
  'ownerId',
  'dueDate',
  'briefing',
  'copy',
  'referencesNotes',
] as const

async function contentActivity(
  row: ContentRow,
  summary: string,
  actor: Actor,
  tx: Database,
  verb: 'created' | 'updated' | 'status_changed' | 'deleted' = 'status_changed',
) {
  await recordActivity(
    {
      actorId: actor.id,
      verb,
      entityType: 'marketing_content',
      entityId: row.id,
      entityLabel: contentLabel(row),
      summary,
    },
    tx,
  )
}

export async function createContent(
  input: ContentInput,
  actor: Actor,
): Promise<{ id: string; code: string }> {
  return db.transaction(async (tx) => {
    await assertCampaign(input.campaignId, tx)
    await assertOwner(input.ownerId, tx)

    const code = await nextCode('marketing_content', tx)
    const [row] = await tx
      .insert(marketingContents)
      .values({ ...contentValues(input), code, status: 'idea', createdBy: actor.id })
      .returning()
    if (!row) throw new Error('Falha ao criar conteúdo.')

    await contentActivity(row, 'criou o conteúdo', actor, tx, 'created')
    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'marketing_content',
        entityId: row.id,
        entityLabel: contentLabel(row),
        changes: { status: { from: null, to: 'idea' } },
      },
      tx,
    )
    return { id: row.id, code }
  })
}

async function lockContent(id: string, tx: Database): Promise<ContentRow> {
  const [row] = await tx
    .select()
    .from(marketingContents)
    .where(eq(marketingContents.id, id))
    .limit(1)
    .for('update')
  if (!row) throw new NotFoundError('Conteúdo')
  return row
}

export async function updateContent(id: string, input: ContentInput, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockContent(id, tx)
    if (row.status === 'published') {
      throw new BusinessRuleError(
        'Conteúdo publicado não é mais editado — ele é o registro do que foi ao ar.',
      )
    }
    await assertCampaign(input.campaignId, tx)
    await assertOwner(input.ownerId, tx)

    const next = contentValues(input)
    const changes = diffChanges(row, next, CONTENT_FIELDS)
    if (!changes) return

    await tx.update(marketingContents).set(next).where(eq(marketingContents.id, id))
    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'marketing_content',
        entityId: id,
        entityLabel: contentLabel(row),
        changes,
      },
      tx,
    )
  })
}

/**
 * Move o conteúdo no fluxo. Agendar grava o horário (no fuso da empresa);
 * voltar de "Agendado" desfaz o agendamento; publicar grava link e momento.
 * A permissão de publicar é conferida pela action (`marketing.publish`).
 */
export async function moveContent(input: MoveContentInput, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockContent(input.contentId, tx)
    if (row.status === input.status) return

    if (!CONTENT_TRANSITIONS[row.status].includes(input.status)) {
      throw new BusinessRuleError(
        `Não é possível passar de "${CONTENT_STATUS[row.status].label}" para "${CONTENT_STATUS[input.status].label}".`,
      )
    }

    const patch: Partial<typeof marketingContents.$inferInsert> = { status: input.status }

    if (input.status === 'scheduled') {
      const at = input.scheduledAt ? localDateTimeToDate(input.scheduledAt) : null
      if (!at)
        throw new ValidationError('Informe data e hora.', { scheduledAt: ['Informe data e hora.'] })
      patch.scheduledAt = at
    } else if (row.status === 'scheduled' && input.status !== 'published') {
      patch.scheduledAt = null
    }

    if (input.status === 'published') {
      if (!input.publishedUrl) {
        throw new ValidationError('Informe o link do conteúdo publicado.', {
          publishedUrl: ['Obrigatório.'],
        })
      }
      patch.publishedUrl = input.publishedUrl
      patch.publishedAt = new Date()
    }

    await tx.update(marketingContents).set(patch).where(eq(marketingContents.id, row.id))

    await contentActivity(
      row,
      input.status === 'published'
        ? 'publicou o conteúdo'
        : `moveu para ${CONTENT_STATUS[input.status].label}`,
      actor,
      tx,
    )
    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'marketing_content',
        entityId: row.id,
        entityLabel: contentLabel(row),
        changes: {
          status: { from: row.status, to: input.status },
          ...(patch.scheduledAt !== undefined
            ? { scheduledAt: { from: row.scheduledAt, to: patch.scheduledAt } }
            : {}),
          ...(patch.publishedUrl ? { publishedUrl: { from: null, to: patch.publishedUrl } } : {}),
        },
      },
      tx,
    )
  })
}

/** Só ideia é descartada. Depois disso já houve trabalho — e ele fica registrado. */
export async function deleteContent(id: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockContent(id, tx)
    if (row.status !== 'idea') {
      throw new BusinessRuleError('Só conteúdos na etapa "Ideia" podem ser descartados.')
    }
    await tx.delete(marketingContents).where(eq(marketingContents.id, id))
    await recordAudit(
      {
        actor,
        action: 'delete',
        entityType: 'marketing_content',
        entityId: id,
        entityLabel: contentLabel(row),
        changes: { title: { from: row.title, to: null } },
      },
      tx,
    )
  })
}

// ── Cases ────────────────────────────────────────────────────────────────────

type CaseRow = typeof cases.$inferSelect
const caseLabel = (row: Pick<CaseRow, 'code' | 'title'>) => `${row.code} · ${row.title}`

async function lockCase(id: string, tx: Database): Promise<CaseRow> {
  const [row] = await tx.select().from(cases).where(eq(cases.id, id)).limit(1).for('update')
  if (!row) throw new NotFoundError('Case')
  return row
}

async function caseActivity(
  row: CaseRow,
  summary: string,
  actor: Actor,
  tx: Database,
  verb: 'created' | 'updated' | 'status_changed' | 'approved' = 'status_changed',
) {
  await recordActivity(
    {
      actorId: actor.id,
      verb,
      entityType: 'case',
      entityId: row.id,
      entityLabel: caseLabel(row),
      summary,
      projectId: row.projectId,
      clientId: row.clientId,
    },
    tx,
  )
}

async function caseAudit(
  row: CaseRow,
  changes: Record<string, { from: unknown; to: unknown }>,
  actor: Actor,
  tx: Database,
) {
  await recordAudit(
    {
      actor,
      action: 'update',
      entityType: 'case',
      entityId: row.id,
      entityLabel: caseLabel(row),
      changes,
    },
    tx,
  )
}

function assertCaseTransition(from: CaseStatus, to: CaseStatus) {
  if (!CASE_TRANSITIONS[from].includes(to)) {
    throw new BusinessRuleError(
      `Não é possível passar de "${CASE_STATUS[from].label}" para "${CASE_STATUS[to].label}".`,
    )
  }
}

/**
 * Abre um case a partir de um projeto entregue (lançado ou concluído). Um case
 * por projeto. Nasce aguardando a autorização do cliente — pedir é o primeiro
 * passo, e fica registrado quando foi pedido.
 */
export async function createCase(
  input: CreateCaseInput,
  actor: Actor,
): Promise<{ id: string; code: string }> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: projects.id,
        clientId: projects.clientId,
        status: projects.status,
        launchedAt: projects.launchedAt,
      })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1)
    if (!project) throw new NotFoundError('Projeto')
    if (project.status !== 'completed' && !project.launchedAt) {
      throw new BusinessRuleError('Case nasce de projeto entregue — lançado ou concluído.')
    }

    const [existing] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.projectId, project.id))
      .limit(1)
    if (existing) throw new ConflictError('Este projeto já tem um case.')

    await assertOwner(input.ownerId, tx)

    const code = await nextCode('case', tx)
    const [row] = await tx
      .insert(cases)
      .values({
        code,
        title: input.title,
        projectId: project.id,
        clientId: project.clientId,
        status: 'pending_authorization',
        authorizationRequestedAt: new Date(),
        ownerId: input.ownerId ?? actor.id,
      })
      .returning()
    if (!row) throw new Error('Falha ao criar o case.')

    await caseActivity(row, 'abriu o case e pediu autorização ao cliente', actor, tx, 'created')
    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'case',
        entityId: row.id,
        entityLabel: caseLabel(row),
        changes: { status: { from: null, to: 'pending_authorization' } },
      },
      tx,
    )
    return { id: row.id, code }
  })
}

/** Registra a resposta do cliente: quem autorizou, quando e como. */
export async function recordCaseAuthorization(
  input: CaseAuthorizationInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockCase(input.caseId, tx)
    assertCaseTransition(row.status, input.decision)

    if (input.decision === 'authorized') {
      const [contact] = await tx
        .select({ clientId: contacts.clientId })
        .from(contacts)
        .where(and(eq(contacts.id, input.contactId ?? ''), isNull(contacts.deletedAt)))
        .limit(1)
      if (!contact || contact.clientId !== row.clientId) {
        throw new ValidationError('A autorização precisa vir de um contato deste cliente.', {
          contactId: ['Selecione um contato do cliente.'],
        })
      }
    }

    const now = new Date()
    const patch =
      input.decision === 'authorized'
        ? {
            status: 'authorized' as const,
            authorizedAt: now,
            authorizedByContactId: input.contactId ?? null,
            authorizationNotes: input.notes ?? null,
            deniedAt: null,
          }
        : {
            status: 'denied' as const,
            deniedAt: now,
            authorizedAt: null,
            authorizedByContactId: null,
            authorizationNotes: input.notes ?? null,
          }

    await tx.update(cases).set(patch).where(eq(cases.id, row.id))

    await caseActivity(
      row,
      input.decision === 'authorized'
        ? 'registrou a autorização do cliente'
        : 'registrou que o cliente não autorizou',
      actor,
      tx,
      input.decision === 'authorized' ? 'approved' : 'status_changed',
    )
    await caseAudit(
      row,
      {
        status: { from: row.status, to: input.decision },
        authorizedByContactId: { from: row.authorizedByContactId, to: patch.authorizedByContactId },
        authorizationNotes: { from: row.authorizationNotes, to: patch.authorizationNotes },
      },
      actor,
      tx,
    )
  })
}

/** O cliente disse não, mas o assunto voltou: pede de novo, com nova data. */
export async function requestCaseAuthorizationAgain(id: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockCase(id, tx)
    assertCaseTransition(row.status, 'pending_authorization')
    await tx
      .update(cases)
      .set({
        status: 'pending_authorization',
        authorizationRequestedAt: new Date(),
        deniedAt: null,
      })
      .where(eq(cases.id, row.id))
    await caseActivity(row, 'pediu autorização ao cliente novamente', actor, tx)
    await caseAudit(row, { status: { from: row.status, to: 'pending_authorization' } }, actor, tx)
  })
}

const CASE_CONTENT_FIELDS = [
  'title',
  'summary',
  'challenge',
  'solution',
  'results',
  'ownerId',
] as const

/**
 * Texto do case. Pode ser rascunhado antes da autorização — o que ela
 * bloqueia é produzir e publicar, não pensar no texto. Publicado não muda.
 */
export async function updateCaseContent(
  id: string,
  input: CaseContentInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockCase(id, tx)
    if (row.status === 'published')
      throw new BusinessRuleError('Case publicado não é mais editado.')
    if (row.status === 'denied') throw new BusinessRuleError('O cliente não autorizou este case.')
    await assertOwner(input.ownerId, tx)

    const next = {
      title: input.title,
      summary: input.summary ?? null,
      challenge: input.challenge ?? null,
      solution: input.solution ?? null,
      results: input.results ?? null,
      ownerId: input.ownerId ?? null,
    }
    const changes = diffChanges(row, next, CASE_CONTENT_FIELDS)
    if (!changes) return
    await tx.update(cases).set(next).where(eq(cases.id, row.id))
    await caseAudit(row, changes, actor, tx)
  })
}

/** Produção e revisão. A autorização já foi exigida para chegar a `authorized`. */
export async function moveCase(
  id: string,
  status: 'in_production' | 'review',
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockCase(id, tx)
    assertCaseTransition(row.status, status)
    if (!row.authorizedAt) throw new BusinessRuleError('Sem autorização do cliente registrada.')

    if (status === 'review' && (!row.summary || !row.challenge || !row.solution || !row.results)) {
      throw new BusinessRuleError(
        'Preencha resumo, desafio, solução e resultados antes da revisão.',
      )
    }

    await tx.update(cases).set({ status }).where(eq(cases.id, row.id))
    await caseActivity(row, `moveu o case para ${CASE_STATUS[status].label}`, actor, tx)
    await caseAudit(row, { status: { from: row.status, to: status } }, actor, tx)
  })
}

export async function publishCase(id: string, publishedUrl: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockCase(id, tx)
    assertCaseTransition(row.status, 'published')
    if (!row.authorizedAt) throw new BusinessRuleError('Sem autorização do cliente registrada.')

    await tx
      .update(cases)
      .set({ status: 'published', publishedUrl, publishedAt: new Date() })
      .where(eq(cases.id, row.id))
    await caseActivity(row, 'publicou o case', actor, tx)
    await caseAudit(
      row,
      {
        status: { from: row.status, to: 'published' },
        publishedUrl: { from: null, to: publishedUrl },
      },
      actor,
      tx,
    )
  })
}
