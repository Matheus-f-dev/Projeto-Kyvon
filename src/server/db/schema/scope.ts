import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { primaryId, timestamps } from './_shared'
import { scopeChangeOriginEnum, scopeChangeStatusEnum } from './enums'
import { contractAddendums, contracts } from './contracts'
import { projects } from './projects'
import { users } from './identity'

/**
 * Mudança de escopo.
 *
 * O escopo do contrato é imutável (regra 8 de product.md). Toda alteração vira
 * um registro aqui, com impacto medido em horas, prazo e dinheiro. Se aprovada
 * e com impacto financeiro, origina um aditivo — e o vínculo fica registrado.
 */

export const scopeChanges = pgTable(
  'scope_changes',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),

    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),

    origin: scopeChangeOriginEnum('origin').notNull(),
    status: scopeChangeStatusEnum('status').notNull().default('requested'),

    /** Análise de impacto — preenchida na etapa `under_analysis`. */
    impactDescription: text('impact_description'),
    estimatedHours: numeric('estimated_hours', { precision: 7, scale: 2 }),
    deadlineImpactDays: integer('deadline_impact_days'),
    financialImpact: numeric('financial_impact', { precision: 14, scale: 2 }),

    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    analyzedBy: uuid('analyzed_by').references(() => users.id, { onDelete: 'set null' }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionComment: text('decision_comment'),
    implementedAt: timestamp('implemented_at', { withTimezone: true }),

    /** Aditivo gerado quando a mudança aprovada tem impacto financeiro. */
    addendumId: uuid('addendum_id').references(() => contractAddendums.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('scope_changes_code_uq').on(table.code),
    index('scope_changes_project_idx').on(table.projectId),
    index('scope_changes_contract_idx').on(table.contractId),
    index('scope_changes_status_idx').on(table.status),
  ],
)

export const scopeChangesRelations = relations(scopeChanges, ({ one }) => ({
  project: one(projects, { fields: [scopeChanges.projectId], references: [projects.id] }),
  contract: one(contracts, { fields: [scopeChanges.contractId], references: [contracts.id] }),
  requester: one(users, { fields: [scopeChanges.requestedBy], references: [users.id] }),
  decider: one(users, { fields: [scopeChanges.decidedBy], references: [users.id] }),
  addendum: one(contractAddendums, {
    fields: [scopeChanges.addendumId],
    references: [contractAddendums.id],
  }),
}))
