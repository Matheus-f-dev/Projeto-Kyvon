import { eq } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import { contracts, projects, scopeChanges } from '@/server/db/schema'
import { BusinessRuleError, NotFoundError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { createAddendum } from '@/server/modules/contracts/service'
import { notify, notifyMany } from '@/server/modules/notifications/service'
import type { Actor } from '@/server/modules/projects/service'
import { listUsersWithPermission } from '@/server/modules/users/queries'
import { formatDayImpact } from '@/lib/format'
import { addDaysISO } from '@/shared/dates'
import {
  SCOPE_CHANGE_STATUS,
  SCOPE_CHANGE_TRANSITIONS,
  type ScopeChangeStatus,
} from '@/shared/domain'
import type {
  CreateScopeChangeInput,
  DecideScopeChangeInput,
  ScopeAnalysisInput,
} from '@/shared/schemas/scope'

/**
 * Mudança de escopo (regra 8 de `docs/product.md`).
 *
 * O escopo do contrato nunca é editado por aqui. A mudança é um registro
 * próprio, com impacto medido; aprovada, pode ajustar o prazo do projeto e
 * originar um aditivo em rascunho — que continua seguindo o fluxo de contratos
 * para valer.
 *
 *   requested → under_analysis → awaiting_approval → approved → implemented
 *        └──────────┴────────────────┴──→ rejected
 */

export const scopeChangeLink = (projectId: string, scopeChangeId: string) =>
  `/projetos/${projectId}?escopo=${scopeChangeId}`

type ScopeChangeRow = typeof scopeChanges.$inferSelect

async function lockScopeChange(id: string, tx: Database): Promise<ScopeChangeRow> {
  const [row] = await tx
    .select()
    .from(scopeChanges)
    .where(eq(scopeChanges.id, id))
    .limit(1)
    .for('update')
  if (!row) throw new NotFoundError('Mudança de escopo')
  return row
}

function assertTransition(from: ScopeChangeStatus, to: ScopeChangeStatus) {
  if (!SCOPE_CHANGE_TRANSITIONS[from].includes(to)) {
    throw new BusinessRuleError(
      `Não é possível passar de "${SCOPE_CHANGE_STATUS[from].label}" para "${SCOPE_CHANGE_STATUS[to].label}".`,
    )
  }
}

const label = (row: Pick<ScopeChangeRow, 'code' | 'title'>) => `${row.code} · ${row.title}`

async function projectContext(projectId: string, tx: Database) {
  const [project] = await tx
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      clientId: projects.clientId,
      contractId: projects.contractId,
      ownerId: projects.ownerId,
      dueDate: projects.dueDate,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project) throw new NotFoundError('Projeto')
  return project
}

async function statusActivity(
  row: ScopeChangeRow,
  clientId: string,
  summary: string,
  actor: Actor,
  tx: Database,
  verb: 'status_changed' | 'approved' | 'updated' = 'status_changed',
) {
  await recordActivity(
    {
      actorId: actor.id,
      verb,
      entityType: 'scope_change',
      entityId: row.id,
      entityLabel: label(row),
      summary,
      projectId: row.projectId,
      clientId,
    },
    tx,
  )
}

// ── Registro ─────────────────────────────────────────────────────────────────

export async function createScopeChange(
  input: CreateScopeChangeInput,
  actor: Actor,
): Promise<{ id: string; code: string }> {
  return db.transaction(async (tx) => {
    const project = await projectContext(input.projectId, tx)
    if (project.status === 'completed' || project.status === 'cancelled') {
      throw new BusinessRuleError('Projeto concluído ou cancelado não recebe mudança de escopo.')
    }

    const code = await nextCode('scope_change', tx)

    const [row] = await tx
      .insert(scopeChanges)
      .values({
        code,
        title: input.title,
        description: input.description,
        projectId: project.id,
        // O contrato vem do projeto: é o escopo dele que está sendo alterado.
        contractId: project.contractId,
        origin: input.origin,
        status: 'requested',
        requestedBy: actor.id,
      })
      .returning()

    if (!row) throw new Error('Falha ao registrar a mudança de escopo.')

    if (project.ownerId) {
      await notify(
        {
          userId: project.ownerId,
          type: 'scope_change_requested',
          title: label(row),
          body: `Mudança de escopo registrada em ${project.name}.`,
          actorId: actor.id,
          entityType: 'scope_change',
          entityId: row.id,
          link: scopeChangeLink(project.id, row.id),
        },
        tx,
      )
    }

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'scope_change',
        entityId: row.id,
        entityLabel: label(row),
        summary: 'registrou uma mudança de escopo',
        projectId: project.id,
        clientId: project.clientId,
      },
      tx,
    )

    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'scope_change',
        entityId: row.id,
        entityLabel: label(row),
        changes: {
          status: { from: null, to: 'requested' },
          origin: { from: null, to: input.origin },
        },
      },
      tx,
    )

    return { id: row.id, code }
  })
}

// ── Análise ──────────────────────────────────────────────────────────────────

const ANALYSIS_FIELDS = [
  'impactDescription',
  'estimatedHours',
  'deadlineImpactDays',
  'financialImpact',
] as const

/**
 * Registra (ou revisa) a análise de impacto. Salvar a análise de uma mudança
 * recém-registrada já a coloca em análise — um passo a menos.
 *
 * `preserveFinancials`: quem não vê valores não altera o impacto financeiro —
 * o que vier no formulário é ignorado e o valor atual é mantido.
 */
export async function saveScopeAnalysis(
  id: string,
  input: ScopeAnalysisInput,
  actor: Actor,
  options: { preserveFinancials: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockScopeChange(id, tx)
    if (row.status !== 'requested' && row.status !== 'under_analysis') {
      throw new BusinessRuleError(
        row.status === 'awaiting_approval'
          ? 'A análise já foi enviada para aprovação. Volte-a para análise antes de alterar.'
          : 'A análise desta mudança não pode mais ser alterada.',
      )
    }
    const project = await projectContext(row.projectId, tx)

    const next = {
      impactDescription: input.impactDescription,
      estimatedHours: input.estimatedHours ?? null,
      deadlineImpactDays: input.deadlineImpactDays ?? null,
      financialImpact: options.preserveFinancials
        ? row.financialImpact
        : (input.financialImpact ?? null),
    }

    // Numeric volta do banco como texto com casas fixas; comparar normalizado
    // evita registrar "mudança" de 100 para 100.00.
    const normalized = {
      ...row,
      estimatedHours: row.estimatedHours === null ? null : Number(row.estimatedHours).toFixed(2),
      financialImpact: row.financialImpact === null ? null : Number(row.financialImpact).toFixed(2),
    }
    const changes = diffChanges(normalized, next, ANALYSIS_FIELDS)

    await tx
      .update(scopeChanges)
      .set({ ...next, status: 'under_analysis', analyzedBy: actor.id })
      .where(eq(scopeChanges.id, id))

    if (row.status === 'requested') {
      await statusActivity(row, project.clientId, 'iniciou a análise de impacto', actor, tx)
    }

    if (changes || row.status === 'requested') {
      await recordAudit(
        {
          actor,
          action: 'update',
          entityType: 'scope_change',
          entityId: row.id,
          entityLabel: label(row),
          changes: {
            ...(changes ?? {}),
            ...(row.status === 'requested'
              ? { status: { from: 'requested', to: 'under_analysis' } }
              : {}),
          },
        },
        tx,
      )
    }
  })
}

/** Envia a análise para decisão. Quem pode decidir é avisado. */
export async function submitScopeForApproval(id: string, actor: Actor): Promise<void> {
  const deciders = await listUsersWithPermission('scope.decide')

  await db.transaction(async (tx) => {
    const row = await lockScopeChange(id, tx)
    assertTransition(row.status, 'awaiting_approval')

    if (!row.impactDescription || row.estimatedHours === null || row.deadlineImpactDays === null) {
      throw new BusinessRuleError(
        'Complete a análise de impacto (descrição, horas e prazo) antes de enviar.',
      )
    }

    const project = await projectContext(row.projectId, tx)

    await tx
      .update(scopeChanges)
      .set({ status: 'awaiting_approval' })
      .where(eq(scopeChanges.id, id))

    await notifyMany(
      deciders.map((user) => ({
        userId: user.id,
        type: 'scope_change_requested' as const,
        title: label(row),
        body: `Análise pronta para decisão em ${project.name}: ${row.estimatedHours}h, ${formatDayImpact(row.deadlineImpactDays ?? 0)}.`,
        actorId: actor.id,
        entityType: 'scope_change' as const,
        entityId: row.id,
        link: scopeChangeLink(project.id, row.id),
      })),
      tx,
    )

    await statusActivity(row, project.clientId, 'enviou a análise para aprovação', actor, tx)
    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'scope_change',
        entityId: row.id,
        entityLabel: label(row),
        changes: { status: { from: row.status, to: 'awaiting_approval' } },
      },
      tx,
    )
  })
}

/** Devolve para análise — quem decide pediu revisão, ou quem analisou quer corrigir. */
export async function returnScopeToAnalysis(id: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockScopeChange(id, tx)
    if (row.status !== 'awaiting_approval') {
      throw new BusinessRuleError('Só uma análise aguardando aprovação pode voltar para análise.')
    }
    const project = await projectContext(row.projectId, tx)

    await tx.update(scopeChanges).set({ status: 'under_analysis' }).where(eq(scopeChanges.id, id))
    await statusActivity(row, project.clientId, 'devolveu a mudança para análise', actor, tx)
    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'scope_change',
        entityId: row.id,
        entityLabel: label(row),
        changes: { status: { from: row.status, to: 'under_analysis' } },
      },
      tx,
    )
  })
}

// ── Decisão ──────────────────────────────────────────────────────────────────

export async function decideScopeChange(
  input: DecideScopeChangeInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockScopeChange(input.scopeChangeId, tx)
    assertTransition(row.status, input.decision)

    const project = await projectContext(row.projectId, tx)
    const approved = input.decision === 'approved'
    const now = new Date()

    await tx
      .update(scopeChanges)
      .set({
        status: input.decision,
        decidedBy: actor.id,
        decidedAt: now,
        decisionComment: input.comment ?? null,
      })
      .where(eq(scopeChanges.id, row.id))

    // Prazo do projeto: só quando pedido explicitamente, e só se houver o que aplicar.
    let newDueDate: string | null = null
    if (approved && input.applyDeadline && row.deadlineImpactDays && project.dueDate) {
      newDueDate = addDaysISO(project.dueDate, row.deadlineImpactDays)
      await tx.update(projects).set({ dueDate: newDueDate }).where(eq(projects.id, project.id))

      await recordActivity(
        {
          actorId: actor.id,
          verb: 'updated',
          entityType: 'project',
          entityId: project.id,
          entityLabel: project.name,
          summary: `ajustou o prazo do projeto para ${newDueDate} (${row.code})`,
          projectId: project.id,
          clientId: project.clientId,
        },
        tx,
      )
      await recordAudit(
        {
          actor,
          action: 'update',
          entityType: 'project',
          entityId: project.id,
          entityLabel: project.name,
          changes: {
            dueDate: { from: project.dueDate, to: newDueDate },
            reason: { from: null, to: `Mudança de escopo ${row.code}` },
          },
        },
        tx,
      )
    }

    const recipients = new Set(
      [row.requestedBy, row.analyzedBy].filter((id): id is string => Boolean(id)),
    )
    await notifyMany(
      [...recipients].map((userId) => ({
        userId,
        type: 'scope_change_decided' as const,
        title: label(row),
        body: approved
          ? `Mudança aprovada em ${project.name}.`
          : `Mudança recusada: ${truncate(input.comment ?? '', 140)}`,
        actorId: actor.id,
        entityType: 'scope_change' as const,
        entityId: row.id,
        link: scopeChangeLink(project.id, row.id),
      })),
      tx,
    )

    await statusActivity(
      row,
      project.clientId,
      approved
        ? 'aprovou a mudança de escopo'
        : `recusou a mudança de escopo: ${input.comment ?? ''}`,
      actor,
      tx,
      approved ? 'approved' : 'status_changed',
    )

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'scope_change',
        entityId: row.id,
        entityLabel: label(row),
        changes: {
          status: { from: row.status, to: input.decision },
          decisionComment: { from: null, to: input.comment ?? null },
        },
      },
      tx,
    )
  })
}

export async function markScopeImplemented(id: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockScopeChange(id, tx)
    assertTransition(row.status, 'implemented')
    const project = await projectContext(row.projectId, tx)

    await tx
      .update(scopeChanges)
      .set({ status: 'implemented', implementedAt: new Date() })
      .where(eq(scopeChanges.id, id))

    await statusActivity(
      row,
      project.clientId,
      'marcou a mudança de escopo como implementada',
      actor,
      tx,
    )
    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'scope_change',
        entityId: row.id,
        entityLabel: label(row),
        changes: { status: { from: row.status, to: 'implemented' } },
      },
      tx,
    )
  })
}

// ── Aditivo ──────────────────────────────────────────────────────────────────

/**
 * Gera o aditivo em rascunho a partir de uma mudança aprovada.
 *
 * O tipo segue o impacto: valor, se houver impacto financeiro; prazo, se só o
 * prazo mudar e o contrato tiver término; escopo, nos demais casos. Criação e
 * vínculo acontecem na mesma transação — não existe aditivo "solto" nem
 * segundo aditivo para a mesma mudança.
 */
export async function generateAddendumFromScope(
  id: string,
  actor: Actor,
): Promise<{ addendumId: string; code: string }> {
  return db.transaction(async (tx) => {
    const row = await lockScopeChange(id, tx)

    if (row.status !== 'approved' && row.status !== 'implemented') {
      throw new BusinessRuleError('Só mudanças aprovadas originam aditivo.')
    }
    if (row.addendumId) throw new BusinessRuleError('Esta mudança já tem aditivo.')
    if (!row.contractId) {
      throw new BusinessRuleError(
        'O projeto não tem contrato vinculado — não há onde registrar o aditivo.',
      )
    }

    const [contract] = await tx
      .select({ id: contracts.id, status: contracts.status, endDate: contracts.endDate })
      .from(contracts)
      .where(eq(contracts.id, row.contractId))
      .limit(1)
    if (!contract) throw new NotFoundError('Contrato')
    if (contract.status === 'cancelled' || contract.status === 'closed') {
      throw new BusinessRuleError('Contrato encerrado ou cancelado não recebe aditivo.')
    }

    const value =
      row.financialImpact !== null && Number(row.financialImpact) !== 0
        ? row.financialImpact
        : undefined
    const days = row.deadlineImpactDays ?? 0
    const newEndDate =
      days !== 0 && contract.endDate ? addDaysISO(contract.endDate, days) : undefined

    const type = value ? 'value' : newEndDate ? 'deadline' : 'scope'

    const description = [
      `Originado da mudança de escopo ${row.code}.`,
      '',
      row.description,
      row.impactDescription ? `\nImpacto: ${row.impactDescription}` : '',
      `Horas estimadas: ${row.estimatedHours ?? '—'} · Impacto no prazo: ${formatDayImpact(days)}.`,
    ]
      .filter((line) => line !== '')
      .join('\n')

    const addendum = await createAddendum(
      {
        contractId: contract.id,
        type,
        title: truncate(`Mudança de escopo ${row.code}: ${row.title}`, 180),
        description: truncate(description, 4000),
        valueDelta: value,
        newEndDate,
      },
      actor,
      tx,
    )

    await tx
      .update(scopeChanges)
      .set({ addendumId: addendum.id })
      .where(eq(scopeChanges.id, row.id))

    const project = await projectContext(row.projectId, tx)
    await statusActivity(
      row,
      project.clientId,
      `gerou o aditivo ${addendum.code}`,
      actor,
      tx,
      'updated',
    )
    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'scope_change',
        entityId: row.id,
        entityLabel: label(row),
        changes: { addendumId: { from: null, to: addendum.id } },
      },
      tx,
    )

    return { addendumId: addendum.id, code: addendum.code }
  })
}

// ── Utilidades ───────────────────────────────────────────────────────────────

export async function getScopeChangeMeta(
  id: string,
): Promise<{ projectId: string; financialImpact: string | null }> {
  const [row] = await db
    .select({ projectId: scopeChanges.projectId, financialImpact: scopeChanges.financialImpact })
    .from(scopeChanges)
    .where(eq(scopeChanges.id, id))
    .limit(1)
  if (!row) throw new NotFoundError('Mudança de escopo')
  return row
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
