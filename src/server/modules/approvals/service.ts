import { and, eq, isNull } from 'drizzle-orm'

import { db, type Database } from '@/server/db/client'
import { nextCode } from '@/server/db/codes'
import { approvals, approvalVersions, contacts, projects, tasks } from '@/server/db/schema'
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '@/server/errors'
import { recordActivity } from '@/server/modules/activity/service'
import { diffChanges, recordAudit } from '@/server/modules/audit/service'
import { notify, notifyMany } from '@/server/modules/notifications/service'
import type { Actor } from '@/server/modules/projects/service'
import { userHasPermission } from '@/server/modules/users/queries'
import { OPEN_APPROVAL_STATUSES, type ApprovalStatus } from '@/shared/domain'
import type {
  CreateApprovalInput,
  DecideApprovalInput,
  NewVersionInput,
  UpdateApprovalInput,
} from '@/shared/schemas/approvals'

/**
 * Aprovações (regra 7 de `docs/product.md`).
 *
 * Ciclo de uma aprovação:
 *
 *   v1 pending ──aprovar──────────────▶ approved (final)
 *      │
 *      └─solicitar ajustes─▶ v1 changes_requested ──enviar v2──▶ v2 pending ─▶ …
 *
 * Nada decidido é editado: a decisão, o comentário e o material de cada versão
 * ficam como estavam no momento da decisão. "Ajustes" não reabre a v1 — gera a v2.
 */

export const approvalLink = (approvalId: string) => `/aprovacoes?aprovacao=${approvalId}`

const isOpen = (status: ApprovalStatus) => OPEN_APPROVAL_STATUSES.includes(status)

// ── Validações compartilhadas ────────────────────────────────────────────────

async function assertTaskInProject(taskId: string | undefined, projectId: string, tx: Database) {
  if (!taskId) return
  const [task] = await tx
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)
  if (!task || task.projectId !== projectId) {
    throw new ValidationError('A tarefa precisa ser do mesmo projeto.', {
      taskId: ['Selecione uma tarefa deste projeto.'],
    })
  }
}

/** Aprovador interno precisa estar ativo e poder decidir — senão a aprovação nasce órfã. */
async function assertApproverUser(userId: string | undefined, tx: Database) {
  if (!userId) return
  if (!(await userHasPermission(userId, 'approvals.decide', tx))) {
    throw new ValidationError('Esta pessoa não pode decidir aprovações.', {
      approverUserId: ['Escolha alguém com permissão para aprovar.'],
    })
  }
}

/** Contato do cliente precisa ser do cliente do projeto e estar autorizado a aprovar. */
async function assertApproverContact(
  contactId: string | undefined,
  clientId: string,
  tx: Database,
) {
  if (!contactId) return
  const [contact] = await tx
    .select({ clientId: contacts.clientId, canApprove: contacts.canApprove })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
    .limit(1)
  if (!contact || contact.clientId !== clientId) {
    throw new ValidationError('O contato precisa ser do cliente do projeto.', {
      approverContactId: ['Selecione um contato deste cliente.'],
    })
  }
  if (!contact.canApprove) {
    throw new ValidationError('Este contato não está autorizado a aprovar materiais.', {
      approverContactId: [
        'Marque o contato como autorizado a aprovar no cadastro do cliente, ou escolha outro.',
      ],
    })
  }
}

/** Lê a aprovação travando a linha: duas decisões simultâneas não podem passar as duas. */
async function lockApproval(approvalId: string, tx: Database) {
  const [approval] = await tx
    .select()
    .from(approvals)
    .where(eq(approvals.id, approvalId))
    .limit(1)
    .for('update')
  if (!approval) throw new NotFoundError('Aprovação')
  return approval
}

async function currentVersionOf(approvalId: string, version: number, tx: Database) {
  const [row] = await tx
    .select()
    .from(approvalVersions)
    .where(and(eq(approvalVersions.approvalId, approvalId), eq(approvalVersions.version, version)))
    .limit(1)
  if (!row) throw new NotFoundError('Versão da aprovação')
  return row
}

async function projectName(projectId: string, tx: Database): Promise<string> {
  const [row] = await tx
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
  return row?.name ?? 'projeto'
}

// ── Criação ──────────────────────────────────────────────────────────────────

export async function createApproval(
  input: CreateApprovalInput,
  actor: Actor,
): Promise<{ id: string; code: string; versionId: string }> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        clientId: projects.clientId,
      })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1)

    if (!project) throw new NotFoundError('Projeto')
    if (project.status === 'completed' || project.status === 'cancelled') {
      throw new BusinessRuleError(
        'Não é possível pedir aprovação em projeto concluído ou cancelado.',
      )
    }

    await assertTaskInProject(input.taskId, project.id, tx)
    await assertApproverUser(input.approverUserId, tx)
    await assertApproverContact(input.approverContactId, project.clientId, tx)

    const code = await nextCode('approval', tx)

    const [approval] = await tx
      .insert(approvals)
      .values({
        code,
        title: input.title,
        description: input.description ?? null,
        projectId: project.id,
        taskId: input.taskId ?? null,
        // O cliente vem do projeto, não do formulário: não há como divergir.
        clientId: project.clientId,
        status: 'pending',
        currentVersion: 1,
        requestedBy: actor.id,
        approverUserId: input.approverUserId ?? null,
        approverContactId: input.approverContactId ?? null,
        dueDate: input.dueDate ?? null,
      })
      .returning({ id: approvals.id })

    if (!approval) throw new Error('Falha ao criar aprovação.')

    const [version] = await tx
      .insert(approvalVersions)
      .values({
        approvalId: approval.id,
        version: 1,
        notes: input.notes ?? null,
        status: 'pending',
        submittedBy: actor.id,
      })
      .returning({ id: approvalVersions.id })

    if (!version) throw new Error('Falha ao criar a versão 1.')

    if (input.approverUserId) {
      await notify(
        {
          userId: input.approverUserId,
          type: 'approval_requested',
          title: `${code} · ${input.title}`,
          body: `Aprovação solicitada em ${project.name}.`,
          actorId: actor.id,
          entityType: 'approval',
          entityId: approval.id,
          link: approvalLink(approval.id),
        },
        tx,
      )
    }

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'created',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: `${code} · ${input.title}`,
        summary: 'solicitou aprovação (v1)',
        projectId: project.id,
        clientId: project.clientId,
      },
      tx,
    )

    await recordAudit(
      {
        actor,
        action: 'create',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: `${code} · ${input.title}`,
        changes: {
          status: { from: null, to: 'pending' },
          version: { from: null, to: 1 },
          approverUserId: { from: null, to: input.approverUserId ?? null },
          approverContactId: { from: null, to: input.approverContactId ?? null },
        },
      },
      tx,
    )

    return { id: approval.id, code, versionId: version.id }
  })
}

// ── Edição dos dados (não do material) ───────────────────────────────────────

const AUDITED_FIELDS = [
  'title',
  'description',
  'taskId',
  'approverUserId',
  'approverContactId',
  'dueDate',
] as const

export async function updateApproval(
  approvalId: string,
  input: UpdateApprovalInput,
  actor: Actor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const approval = await lockApproval(approvalId, tx)
    if (!isOpen(approval.status)) {
      throw new BusinessRuleError('Aprovação decidida ou cancelada não é mais editada.')
    }

    await assertTaskInProject(input.taskId, approval.projectId, tx)
    await assertApproverUser(input.approverUserId, tx)
    await assertApproverContact(input.approverContactId, approval.clientId, tx)

    const next = {
      title: input.title,
      description: input.description ?? null,
      taskId: input.taskId ?? null,
      approverUserId: input.approverUserId ?? null,
      approverContactId: input.approverContactId ?? null,
      dueDate: input.dueDate ?? null,
    }

    const changes = diffChanges(approval, next, AUDITED_FIELDS)
    if (!changes) return

    await tx.update(approvals).set(next).where(eq(approvals.id, approvalId))

    // Novo aprovador interno precisa saber que agora é com ele.
    if (
      next.approverUserId &&
      next.approverUserId !== approval.approverUserId &&
      approval.status === 'pending'
    ) {
      await notify(
        {
          userId: next.approverUserId,
          type: 'approval_requested',
          title: `${approval.code} · ${next.title}`,
          body: `Você foi indicado para decidir a v${approval.currentVersion}.`,
          actorId: actor.id,
          entityType: 'approval',
          entityId: approval.id,
          link: approvalLink(approval.id),
        },
        tx,
      )
    }

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: `${approval.code} · ${next.title}`,
        changes,
      },
      tx,
    )
  })
}

// ── Decisão ──────────────────────────────────────────────────────────────────

export async function decideApproval(input: DecideApprovalInput, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const approval = await lockApproval(input.approvalId, tx)

    if (approval.status !== 'pending') {
      throw new BusinessRuleError(
        approval.status === 'changes_requested'
          ? 'Ajustes já foram solicitados. A decisão agora é sobre a próxima versão.'
          : 'Esta aprovação já foi encerrada.',
      )
    }

    // A tela pode estar desatualizada: decidir "a v1" quando a v2 já foi
    // enviada registraria uma decisão sobre material que ninguém viu.
    if (input.version !== approval.currentVersion) {
      throw new ConflictError(
        `A versão em análise agora é a v${approval.currentVersion}. Atualize a página antes de decidir.`,
      )
    }

    const version = await currentVersionOf(approval.id, approval.currentVersion, tx)

    // Aprovação interna não pode ser decidida por quem enviou o material.
    // Quando quem aprova é o cliente, a equipe registra a decisão dele — aí
    // quem enviou pode, sim, registrar.
    if (!approval.approverContactId && version.submittedBy === actor.id) {
      throw new BusinessRuleError(
        'Você enviou esta versão — a decisão precisa ser de outra pessoa.',
      )
    }

    const now = new Date()

    await tx
      .update(approvalVersions)
      .set({
        status: input.decision,
        decisionComment: input.comment ?? null,
        decidedBy: actor.id,
        decidedAt: now,
      })
      .where(eq(approvalVersions.id, version.id))

    await tx
      .update(approvals)
      .set({
        status: input.decision,
        decidedAt: input.decision === 'approved' ? now : null,
      })
      .where(eq(approvals.id, approval.id))

    const approved = input.decision === 'approved'
    const label = `${approval.code} · ${approval.title}`
    const project = await projectName(approval.projectId, tx)

    const recipients = new Set(
      [approval.requestedBy, version.submittedBy].filter((id): id is string => Boolean(id)),
    )
    await notifyMany(
      [...recipients].map((userId) => ({
        userId,
        type: 'approval_decided' as const,
        title: label,
        body: approved
          ? `v${version.version} aprovada em ${project}.`
          : `Ajustes solicitados na v${version.version}: ${truncate(input.comment ?? '', 140)}`,
        actorId: actor.id,
        entityType: 'approval' as const,
        entityId: approval.id,
        link: approvalLink(approval.id),
      })),
      tx,
    )

    await recordActivity(
      {
        actorId: actor.id,
        verb: approved ? 'approved' : 'changes_requested',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: label,
        summary: approved
          ? `aprovou a v${version.version}`
          : `solicitou ajustes na v${version.version}`,
        projectId: approval.projectId,
        clientId: approval.clientId,
        metadata: { version: version.version, comment: input.comment ?? null },
      },
      tx,
    )

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: label,
        changes: {
          status: { from: approval.status, to: input.decision },
          [`v${version.version}.status`]: { from: version.status, to: input.decision },
          [`v${version.version}.comment`]: { from: null, to: input.comment ?? null },
        },
      },
      tx,
    )
  })
}

// ── Nova versão ──────────────────────────────────────────────────────────────

export async function submitNewVersion(
  input: NewVersionInput,
  actor: Actor,
): Promise<{ versionId: string; version: number }> {
  return db.transaction(async (tx) => {
    const approval = await lockApproval(input.approvalId, tx)

    if (approval.status !== 'changes_requested') {
      throw new BusinessRuleError(
        approval.status === 'pending'
          ? `A v${approval.currentVersion} ainda está em análise. Nova versão só depois de uma solicitação de ajustes.`
          : 'Esta aprovação já foi encerrada.',
      )
    }

    const number = approval.currentVersion + 1

    const [version] = await tx
      .insert(approvalVersions)
      .values({
        approvalId: approval.id,
        version: number,
        notes: input.notes,
        status: 'pending',
        submittedBy: actor.id,
      })
      .returning({ id: approvalVersions.id })

    if (!version) throw new Error('Falha ao criar a nova versão.')

    await tx
      .update(approvals)
      .set({ status: 'pending', currentVersion: number, decidedAt: null })
      .where(eq(approvals.id, approval.id))

    const label = `${approval.code} · ${approval.title}`

    if (approval.approverUserId) {
      await notify(
        {
          userId: approval.approverUserId,
          type: 'approval_requested',
          title: label,
          body: `v${number} enviada para análise.`,
          actorId: actor.id,
          entityType: 'approval',
          entityId: approval.id,
          link: approvalLink(approval.id),
        },
        tx,
      )
    }

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'updated',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: label,
        summary: `enviou a v${number} para aprovação`,
        projectId: approval.projectId,
        clientId: approval.clientId,
        metadata: { version: number },
      },
      tx,
    )

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: label,
        changes: {
          status: { from: approval.status, to: 'pending' },
          currentVersion: { from: approval.currentVersion, to: number },
        },
      },
      tx,
    )

    return { versionId: version.id, version: number }
  })
}

// ── Cancelamento ─────────────────────────────────────────────────────────────

export async function cancelApproval(
  approvalId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const trimmed = reason.trim()
  if (trimmed.length < 3) {
    throw new ValidationError('Informe o motivo do cancelamento.', {
      reason: ['Informe o motivo.'],
    })
  }

  await db.transaction(async (tx) => {
    const approval = await lockApproval(approvalId, tx)
    if (!isOpen(approval.status)) {
      throw new BusinessRuleError('Só aprovações em aberto podem ser canceladas.')
    }

    // A versão em análise é encerrada junto; versões já decididas ficam como estão.
    const version = await currentVersionOf(approval.id, approval.currentVersion, tx)
    if (version.status === 'pending') {
      await tx
        .update(approvalVersions)
        .set({
          status: 'cancelled',
          decisionComment: `Cancelada: ${trimmed}`,
          decidedBy: actor.id,
          decidedAt: new Date(),
        })
        .where(eq(approvalVersions.id, version.id))
    }

    await tx.update(approvals).set({ status: 'cancelled' }).where(eq(approvals.id, approval.id))

    const label = `${approval.code} · ${approval.title}`

    await recordActivity(
      {
        actorId: actor.id,
        verb: 'status_changed',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: label,
        summary: `cancelou a aprovação: ${trimmed}`,
        projectId: approval.projectId,
        clientId: approval.clientId,
      },
      tx,
    )

    await recordAudit(
      {
        actor,
        action: 'update',
        entityType: 'approval',
        entityId: approval.id,
        entityLabel: label,
        changes: {
          status: { from: approval.status, to: 'cancelled' },
          reason: { from: null, to: trimmed },
        },
      },
      tx,
    )
  })
}

// ── Leitura usada pelas actions ──────────────────────────────────────────────

export async function getApprovalProjectId(approvalId: string): Promise<string> {
  const [row] = await db
    .select({ projectId: approvals.projectId })
    .from(approvals)
    .where(eq(approvals.id, approvalId))
    .limit(1)
  if (!row) throw new NotFoundError('Aprovação')
  return row.projectId
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
