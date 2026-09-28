import { eq } from 'drizzle-orm'

import type { AuthContext } from '@/server/auth/context'
import { db, type Database } from '@/server/db/client'
import {
  approvals,
  approvalVersions,
  cases,
  clients,
  contractAddendums,
  contracts,
  fileLinks,
  marketingContents,
  opportunities,
  projects,
  proposals,
  scopeChanges,
  supportTickets,
  tasks,
} from '@/server/db/schema'
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@/server/errors'
import { isInvolvedInProject, isInvolvedInTask } from '@/server/modules/tasks/service'
import type { PermissionKey } from '@/shared/permissions'
import type { FileTarget, FileTargetRef } from '@/shared/files'

/**
 * Quem pode ver e anexar arquivos em cada entidade.
 *
 * Arquivo não tem permissão própria além de `files.*`: ele herda a da entidade
 * a que está vinculado. Um contrato assinado é documento de contrato
 * (`contracts.documents.read`), não "um arquivo qualquer".
 */

const READ_PERMISSIONS: Record<FileTarget, readonly PermissionKey[]> = {
  client: ['clients.read'],
  // Proposta em PDF mostra preço: exige a mesma permissão que o valor na tela.
  proposal: ['crm.read', 'crm.values.read'],
  contract: ['contracts.read', 'contracts.documents.read'],
  contract_addendum: ['contracts.read', 'contracts.documents.read'],
  project: ['projects.read'],
  task: ['tasks.read'],
  approval_version: ['approvals.read'],
  scope_change: ['scope.read'],
  support_ticket: ['support.read'],
  marketing_content: ['marketing.read'],
  case: ['cases.read'],
}

const WRITE_PERMISSIONS: Record<FileTarget, readonly PermissionKey[]> = {
  client: ['clients.write'],
  proposal: ['crm.write', 'crm.values.read'],
  contract: ['contracts.write', 'contracts.documents.read'],
  contract_addendum: ['contracts.write', 'contracts.documents.read'],
  project: ['projects.write'],
  task: ['tasks.write'],
  approval_version: ['approvals.write'],
  scope_change: ['scope.write'],
  support_ticket: ['support.write'],
  marketing_content: ['marketing.write'],
  case: ['cases.write'],
}

/**
 * Alvos em que ver o arquivo exige mais do que ver o registro: quem abre o
 * contrato sem `contracts.documents.read` enxerga o feed dele, então o feed
 * não pode trazer o nome do documento. O nome fica só na auditoria.
 */
const CONFIDENTIAL_TARGETS: ReadonlySet<FileTarget> = new Set([
  'contract',
  'contract_addendum',
  'proposal',
])

export function isConfidentialTarget(type: FileTarget): boolean {
  return CONFIDENTIAL_TARGETS.has(type)
}

export function canReadTarget(context: AuthContext, type: FileTarget): boolean {
  return context.can('files.read') && context.canAll(...READ_PERMISSIONS[type])
}

/** Tipos de vínculo que o usuário pode ler — usado para filtrar listagens. */
export function readableTargets(context: AuthContext): FileTarget[] {
  return (Object.keys(READ_PERMISSIONS) as FileTarget[]).filter((type) =>
    canReadTarget(context, type),
  )
}

export async function assertCanWriteTarget(
  context: AuthContext,
  target: FileTargetRef,
): Promise<void> {
  if (!context.can('files.write') || !context.canAll(...WRITE_PERMISSIONS[target.type])) {
    throw new ForbiddenError('Você não tem permissão para anexar arquivos aqui.')
  }

  // Mesma regra de edição do resto do sistema (`docs/permissions.md`, seção 5).
  if (target.type === 'project' && !context.can('projects.delete')) {
    if (!(await isInvolvedInProject(target.id, context.user.id))) {
      throw new ForbiddenError('Só a equipe do projeto pode anexar arquivos nele.')
    }
  }
  // Material de aprovação é produção do projeto: mesma regra de equipe.
  if (target.type === 'approval_version' && !context.can('projects.delete')) {
    const { projectId } = await resolveTarget(target)
    if (!projectId || !(await isInvolvedInProject(projectId, context.user.id))) {
      throw new ForbiddenError('Só a equipe do projeto pode anexar material à aprovação.')
    }
  }
  if (target.type === 'task' && !context.can('tasks.delete')) {
    if (!(await isInvolvedInTask(target.id, context.user.id))) {
      throw new ForbiddenError('Só quem participa da tarefa pode anexar arquivos nela.')
    }
  }
}

// ── Resolução do alvo ────────────────────────────────────────────────────────

export interface ResolvedTarget {
  ref: FileTargetRef
  /** Rótulo legível para feed e auditoria, ex.: "PRJ-0003 · Site institucional". */
  label: string
  projectId: string | null
  clientId: string | null
  /** Onde a entidade é aberta na aplicação; `null` enquanto o módulo não tem tela. */
  href: string | null
  /** Material de uma versão de aprovação já decidida não muda mais. */
  locked: boolean
}

/** Confirma que o alvo existe e devolve o contexto dele (projeto, cliente). */
export async function resolveTarget(
  target: FileTargetRef,
  tx: Database = db,
): Promise<ResolvedTarget> {
  const found = await lookup(target, tx)
  if (!found) throw new NotFoundError('Registro')
  return { ref: target, locked: false, ...found }
}

type Lookup = Omit<ResolvedTarget, 'ref' | 'locked'> & { locked?: boolean }

async function lookup(target: FileTargetRef, tx: Database): Promise<Lookup | undefined> {
  const { id } = target

  switch (target.type) {
    case 'client': {
      const [row] = await tx
        .select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(eq(clients.id, id))
      return (
        row && { label: row.name, projectId: null, clientId: row.id, href: `/clientes/${row.id}` }
      )
    }
    case 'proposal': {
      const [row] = await tx
        .select({
          code: proposals.code,
          title: proposals.title,
          clientId: opportunities.clientId,
          opportunityId: opportunities.id,
        })
        .from(proposals)
        .innerJoin(opportunities, eq(opportunities.id, proposals.opportunityId))
        .where(eq(proposals.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title}`,
          projectId: null,
          clientId: row.clientId,
          href: `/comercial?oportunidade=${row.opportunityId}`,
        }
      )
    }
    case 'contract': {
      const [row] = await tx
        .select({ code: contracts.code, title: contracts.title, clientId: contracts.clientId })
        .from(contracts)
        .where(eq(contracts.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title}`,
          projectId: null,
          clientId: row.clientId,
          href: `/contratos/${id}`,
        }
      )
    }
    case 'contract_addendum': {
      const [row] = await tx
        .select({
          code: contractAddendums.code,
          title: contractAddendums.title,
          clientId: contracts.clientId,
          contractId: contracts.id,
        })
        .from(contractAddendums)
        .innerJoin(contracts, eq(contracts.id, contractAddendums.contractId))
        .where(eq(contractAddendums.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title}`,
          projectId: null,
          clientId: row.clientId,
          href: `/contratos/${row.contractId}`,
        }
      )
    }
    case 'project': {
      const [row] = await tx
        .select({ code: projects.code, name: projects.name, clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.id, id))
      return (
        row && {
          label: `${row.code} · ${row.name}`,
          projectId: id,
          clientId: row.clientId,
          href: `/projetos/${id}`,
        }
      )
    }
    case 'task': {
      const [row] = await tx
        .select({
          code: tasks.code,
          title: tasks.title,
          projectId: tasks.projectId,
          clientId: projects.clientId,
        })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(eq(tasks.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title}`,
          projectId: row.projectId,
          clientId: row.clientId,
          href: `/projetos/${row.projectId}?tarefa=${id}`,
        }
      )
    }
    case 'approval_version': {
      const [row] = await tx
        .select({
          code: approvals.code,
          title: approvals.title,
          version: approvalVersions.version,
          status: approvalVersions.status,
          projectId: approvals.projectId,
          clientId: approvals.clientId,
        })
        .from(approvalVersions)
        .innerJoin(approvals, eq(approvals.id, approvalVersions.approvalId))
        .where(eq(approvalVersions.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title} v${row.version}`,
          projectId: row.projectId,
          clientId: row.clientId,
          href: `/projetos/${row.projectId}`,
          locked: row.status !== 'pending',
        }
      )
    }
    case 'scope_change': {
      const [row] = await tx
        .select({
          code: scopeChanges.code,
          title: scopeChanges.title,
          projectId: scopeChanges.projectId,
          clientId: projects.clientId,
        })
        .from(scopeChanges)
        .innerJoin(projects, eq(projects.id, scopeChanges.projectId))
        .where(eq(scopeChanges.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title}`,
          projectId: row.projectId,
          clientId: row.clientId,
          href: `/projetos/${row.projectId}`,
        }
      )
    }
    case 'support_ticket': {
      const [row] = await tx
        .select({
          code: supportTickets.code,
          title: supportTickets.title,
          projectId: supportTickets.projectId,
          clientId: supportTickets.clientId,
        })
        .from(supportTickets)
        .where(eq(supportTickets.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title}`,
          projectId: row.projectId,
          clientId: row.clientId,
          href: null,
        }
      )
    }
    case 'marketing_content': {
      const [row] = await tx
        .select({ code: marketingContents.code, title: marketingContents.title })
        .from(marketingContents)
        .where(eq(marketingContents.id, id))
      return (
        row && { label: `${row.code} · ${row.title}`, projectId: null, clientId: null, href: null }
      )
    }
    case 'case': {
      const [row] = await tx
        .select({
          code: cases.code,
          title: cases.title,
          projectId: cases.projectId,
          clientId: cases.clientId,
        })
        .from(cases)
        .where(eq(cases.id, id))
      return (
        row && {
          label: `${row.code} · ${row.title}`,
          projectId: row.projectId,
          clientId: row.clientId,
          href: null,
        }
      )
    }
  }
}

export function assertTargetUnlocked(target: ResolvedTarget): void {
  if (target.locked) {
    throw new BusinessRuleError(
      'Esta versão já foi decidida — o material dela faz parte do histórico. Envie uma nova versão da aprovação.',
    )
  }
}

// ── Vínculo ↔ alvo ───────────────────────────────────────────────────────────

/** Coluna de `file_links` correspondente a cada tipo de alvo. */
export const LINK_COLUMNS = {
  client: fileLinks.clientId,
  proposal: fileLinks.proposalId,
  contract: fileLinks.contractId,
  contract_addendum: fileLinks.contractAddendumId,
  project: fileLinks.projectId,
  task: fileLinks.taskId,
  approval_version: fileLinks.approvalVersionId,
  scope_change: fileLinks.scopeChangeId,
  support_ticket: fileLinks.supportTicketId,
  marketing_content: fileLinks.marketingContentId,
  case: fileLinks.caseId,
} as const satisfies Record<FileTarget, unknown>

const LINK_KEYS = {
  client: 'clientId',
  proposal: 'proposalId',
  contract: 'contractId',
  contract_addendum: 'contractAddendumId',
  project: 'projectId',
  task: 'taskId',
  approval_version: 'approvalVersionId',
  scope_change: 'scopeChangeId',
  support_ticket: 'supportTicketId',
  marketing_content: 'marketingContentId',
  case: 'caseId',
} as const satisfies Record<FileTarget, keyof typeof fileLinks.$inferInsert>

export function linkValues(target: FileTargetRef): Partial<typeof fileLinks.$inferInsert> {
  return { [LINK_KEYS[target.type]]: target.id }
}

type LinkRow = Pick<typeof fileLinks.$inferSelect, (typeof LINK_KEYS)[FileTarget]>

/** Converte uma linha de `file_links` de volta no alvo que ela aponta. */
export function targetOfLink(link: LinkRow): FileTargetRef | undefined {
  for (const [type, key] of Object.entries(LINK_KEYS) as [FileTarget, keyof LinkRow][]) {
    const id = link[key]
    if (id) return { type, id }
  }
  return undefined
}
