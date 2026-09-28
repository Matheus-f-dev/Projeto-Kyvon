import { and, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'

import type { AuthContext } from '@/server/auth/context'
import { db } from '@/server/db/client'
import {
  approvals,
  clients,
  contracts,
  marketingContents,
  opportunities,
  projects,
  scopeChanges,
  supportTickets,
  tasks,
} from '@/server/db/schema'

/**
 * Busca global (Ctrl+K).
 *
 * Consulta as entidades principais em paralelo, com limite por tipo (ADR-005).
 * Cada consulta é filtrada pela permissão de leitura correspondente — o que a
 * pessoa não pode abrir não aparece no resultado, e não apenas fica escondido.
 *
 * O termo é escapado para `ILIKE`: sem isso, um `%` digitado pela pessoa viraria
 * curinga e faria varredura completa da tabela.
 */

export type SearchEntity =
  | 'client'
  | 'project'
  | 'task'
  | 'opportunity'
  | 'contract'
  | 'support_ticket'
  | 'marketing_content'
  | 'approval'
  | 'scope_change'

export interface SearchResult {
  entity: SearchEntity
  id: string
  code: string | null
  title: string
  subtitle: string | null
  href: string
}

export interface SearchGroup {
  entity: SearchEntity
  label: string
  results: SearchResult[]
}

const GROUP_LABELS: Record<SearchEntity, string> = {
  client: 'Clientes',
  project: 'Projetos',
  task: 'Tarefas',
  opportunity: 'Oportunidades',
  contract: 'Contratos',
  support_ticket: 'Chamados',
  marketing_content: 'Conteúdos',
  approval: 'Aprovações',
  scope_change: 'Mudanças de escopo',
}

const PER_ENTITY_LIMIT = 5
const MIN_QUERY_LENGTH = 2

/** Neutraliza os curingas do LIKE para que o termo seja tratado como literal. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function globalSearch(context: AuthContext, rawQuery: string): Promise<SearchGroup[]> {
  const query = rawQuery.trim()
  if (query.length < MIN_QUERY_LENGTH) return []

  const pattern = `%${escapeLike(query)}%`
  const groups: SearchGroup[] = []

  const searches: Promise<SearchGroup | null>[] = []

  if (context.can('clients.read')) {
    searches.push(searchClients(pattern))
  }
  if (context.can('projects.read')) {
    searches.push(searchProjects(pattern))
  }
  if (context.can('tasks.read')) {
    searches.push(searchTasks(pattern))
  }
  if (context.can('approvals.read')) {
    searches.push(searchApprovals(pattern))
  }
  if (context.can('scope.read')) {
    searches.push(searchScopeChanges(pattern))
  }
  if (context.can('crm.read')) {
    searches.push(searchOpportunities(pattern))
  }
  if (context.can('contracts.read')) {
    searches.push(searchContracts(pattern))
  }
  if (context.can('support.read')) {
    searches.push(searchTickets(pattern))
  }
  if (context.can('marketing.read')) {
    searches.push(searchContents(pattern))
  }

  const settled = await Promise.all(searches)
  for (const group of settled) {
    if (group && group.results.length > 0) groups.push(group)
  }

  return groups
}

function group(entity: SearchEntity, results: SearchResult[]): SearchGroup {
  return { entity, label: GROUP_LABELS[entity], results }
}

/** `code ILIKE` primeiro: quem digita "PRJ-12" quer aquele projeto, não outro. */
function matches(column: SQL | unknown, pattern: string) {
  return ilike(column as never, pattern)
}

async function searchClients(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: clients.id,
      code: clients.code,
      name: clients.name,
      tradeName: clients.tradeName,
      status: clients.status,
    })
    .from(clients)
    .where(
      and(
        isNull(clients.deletedAt),
        or(
          matches(clients.name, pattern),
          matches(clients.tradeName, pattern),
          matches(clients.code, pattern),
          matches(clients.document, pattern),
        ),
      ),
    )
    .orderBy(clients.name)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'client',
    rows.map((row) => ({
      entity: 'client' as const,
      id: row.id,
      code: row.code,
      title: row.name,
      subtitle: row.tradeName,
      href: `/clientes/${row.id}`,
    })),
  )
}

async function searchProjects(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      clientName: clients.name,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(or(matches(projects.name, pattern), matches(projects.code, pattern)))
    .orderBy(projects.name)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'project',
    rows.map((row) => ({
      entity: 'project' as const,
      id: row.id,
      code: row.code,
      title: row.name,
      subtitle: row.clientName,
      href: `/projetos/${row.id}`,
    })),
  )
}

async function searchTasks(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: tasks.id,
      code: tasks.code,
      title: tasks.title,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(or(matches(tasks.title, pattern), matches(tasks.code, pattern)))
    .orderBy(sql`${tasks.updatedAt} desc`)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'task',
    rows.map((row) => ({
      entity: 'task' as const,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.projectName,
      href: `/tarefas?tarefa=${row.id}`,
    })),
  )
}

async function searchApprovals(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: approvals.id,
      code: approvals.code,
      title: approvals.title,
      projectName: projects.name,
    })
    .from(approvals)
    .innerJoin(projects, eq(projects.id, approvals.projectId))
    .where(or(matches(approvals.title, pattern), matches(approvals.code, pattern)))
    .orderBy(sql`${approvals.updatedAt} desc`)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'approval',
    rows.map((row) => ({
      entity: 'approval' as const,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.projectName,
      href: `/aprovacoes?aprovacao=${row.id}`,
    })),
  )
}

async function searchScopeChanges(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: scopeChanges.id,
      code: scopeChanges.code,
      title: scopeChanges.title,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(scopeChanges)
    .innerJoin(projects, eq(projects.id, scopeChanges.projectId))
    .where(or(matches(scopeChanges.title, pattern), matches(scopeChanges.code, pattern)))
    .orderBy(sql`${scopeChanges.updatedAt} desc`)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'scope_change',
    rows.map((row) => ({
      entity: 'scope_change' as const,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.projectName,
      href: `/projetos/${row.projectId}?escopo=${row.id}`,
    })),
  )
}

async function searchOpportunities(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: opportunities.id,
      code: opportunities.code,
      title: opportunities.title,
      clientName: clients.name,
    })
    .from(opportunities)
    .innerJoin(clients, eq(clients.id, opportunities.clientId))
    .where(or(matches(opportunities.title, pattern), matches(opportunities.code, pattern)))
    .orderBy(sql`${opportunities.updatedAt} desc`)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'opportunity',
    rows.map((row) => ({
      entity: 'opportunity' as const,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.clientName,
      href: `/comercial?oportunidade=${row.id}`,
    })),
  )
}

async function searchContracts(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: contracts.id,
      code: contracts.code,
      title: contracts.title,
      clientName: clients.name,
    })
    .from(contracts)
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .where(or(matches(contracts.title, pattern), matches(contracts.code, pattern)))
    .orderBy(sql`${contracts.updatedAt} desc`)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'contract',
    rows.map((row) => ({
      entity: 'contract' as const,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.clientName,
      href: `/contratos/${row.id}`,
    })),
  )
}

async function searchTickets(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: supportTickets.id,
      code: supportTickets.code,
      title: supportTickets.title,
      clientName: clients.name,
    })
    .from(supportTickets)
    .innerJoin(clients, eq(clients.id, supportTickets.clientId))
    .where(or(matches(supportTickets.title, pattern), matches(supportTickets.code, pattern)))
    .orderBy(sql`${supportTickets.updatedAt} desc`)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'support_ticket',
    rows.map((row) => ({
      entity: 'support_ticket' as const,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.clientName,
      href: `/suporte?chamado=${row.id}`,
    })),
  )
}

async function searchContents(pattern: string): Promise<SearchGroup> {
  const rows = await db
    .select({
      id: marketingContents.id,
      code: marketingContents.code,
      title: marketingContents.title,
      channel: marketingContents.channel,
    })
    .from(marketingContents)
    .where(or(matches(marketingContents.title, pattern), matches(marketingContents.code, pattern)))
    .orderBy(sql`${marketingContents.updatedAt} desc`)
    .limit(PER_ENTITY_LIMIT)

  return group(
    'marketing_content',
    rows.map((row) => ({
      entity: 'marketing_content' as const,
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.channel,
      href: `/marketing?conteudo=${row.id}`,
    })),
  )
}
