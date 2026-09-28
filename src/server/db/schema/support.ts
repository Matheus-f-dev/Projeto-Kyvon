import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { primaryId, timestamps } from './_shared'
import { supportCategoryEnum, supportPriorityEnum, supportStatusEnum } from './enums'
import { clients, contacts, opportunities } from './crm'
import { contracts } from './contracts'
import { projects } from './projects'
import { users } from './identity'

/**
 * Suporte pós-lançamento.
 *
 * Um chamado de categoria `new_demand` pode ser enviado ao Comercial: a ação
 * cria uma oportunidade já vinculada ao cliente, ao projeto e a este chamado
 * (regra 11 de product.md), fechando o ciclo suporte → comercial.
 */

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    requesterContactId: uuid('requester_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),

    category: supportCategoryEnum('category').notNull(),
    priority: supportPriorityEnum('priority').notNull().default('medium'),
    status: supportStatusEnum('status').notNull().default('open'),

    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),

    /** Prazo de atendimento derivado da prioridade no momento da abertura. */
    dueAt: timestamp('due_at', { withTimezone: true }),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    resolution: text('resolution'),

    /** Preenchido quando o chamado vira demanda comercial. */
    convertedOpportunityId: uuid('converted_opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('support_tickets_code_uq').on(table.code),
    index('support_tickets_client_idx').on(table.clientId),
    index('support_tickets_project_idx').on(table.projectId),
    index('support_tickets_status_idx').on(table.status),
    index('support_tickets_assignee_idx').on(table.assigneeId),
    index('support_tickets_due_idx').on(table.dueAt),
    index('support_tickets_category_idx').on(table.category),
  ],
)

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  client: one(clients, { fields: [supportTickets.clientId], references: [clients.id] }),
  project: one(projects, { fields: [supportTickets.projectId], references: [projects.id] }),
  contract: one(contracts, { fields: [supportTickets.contractId], references: [contracts.id] }),
  requesterContact: one(contacts, {
    fields: [supportTickets.requesterContactId],
    references: [contacts.id],
  }),
  assignee: one(users, { fields: [supportTickets.assigneeId], references: [users.id] }),
  convertedOpportunity: one(opportunities, {
    fields: [supportTickets.convertedOpportunityId],
    references: [opportunities.id],
  }),
}))
