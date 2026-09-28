import { relations } from 'drizzle-orm'
import {
  date,
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
import {
  addendumStatusEnum,
  addendumTypeEnum,
  contractStatusEnum,
  paymentMethodEnum,
} from './enums'
import { clients, opportunities, proposals, serviceTypes } from './crm'
import { users } from './identity'

/**
 * Contratos e aditivos.
 *
 * Contrato não tem exclusão — nem física nem lógica. Encerrar e cancelar são
 * mudanças de status; o registro permanece consultável (regra 10 de product.md).
 * O escopo original nunca é editado: alterações viram aditivo ou mudança de escopo.
 */

export const contracts = pgTable(
  'contracts',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    /** Origem comercial. Preserva a rastreabilidade oportunidade → contrato. */
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    proposalId: uuid('proposal_id').references(() => proposals.id, { onDelete: 'set null' }),
    serviceTypeId: uuid('service_type_id').references(() => serviceTypes.id, {
      onDelete: 'set null',
    }),

    status: contractStatusEnum('status').notNull().default('draft'),

    /** Escopo contratado. Imutável após ativação — mudanças viram aditivo. */
    scope: text('scope'),
    deliverables: text('deliverables'),
    responsibilities: text('responsibilities'),
    exclusions: text('exclusions'),

    totalValue: numeric('total_value', { precision: 14, scale: 2 }),
    paymentMethod: paymentMethodEnum('payment_method'),
    paymentTerms: text('payment_terms'),
    installments: integer('installments'),

    startDate: date('start_date'),
    endDate: date('end_date'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),

    /** Revisões incluídas no preço. Base para cobrar mudança de escopo. */
    revisionsIncluded: integer('revisions_included'),
    supportDays: integer('support_days'),
    /** Derivado de lançamento + supportDays; materializado para alertar vencimento. */
    supportEndsAt: date('support_ends_at'),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('contracts_code_uq').on(table.code),
    index('contracts_client_idx').on(table.clientId),
    index('contracts_status_idx').on(table.status),
    index('contracts_end_date_idx').on(table.endDate),
    index('contracts_support_ends_idx').on(table.supportEndsAt),
    index('contracts_opportunity_idx').on(table.opportunityId),
  ],
)

export const contractAddendums = pgTable(
  'contract_addendums',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: addendumTypeEnum('type').notNull(),
    status: addendumStatusEnum('status').notNull().default('draft'),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description'),

    /** Delta, não valor absoluto: o total do contrato é base + soma dos aditivos. */
    valueDelta: numeric('value_delta', { precision: 14, scale: 2 }),
    newEndDate: date('new_end_date'),
    additionalSupportDays: integer('additional_support_days'),

    signedAt: timestamp('signed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('contract_addendums_code_uq').on(table.code),
    uniqueIndex('contract_addendums_sequence_uq').on(table.contractId, table.sequence),
    index('contract_addendums_status_idx').on(table.status),
  ],
)

// ── Relations ────────────────────────────────────────────────────────────────

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  client: one(clients, { fields: [contracts.clientId], references: [clients.id] }),
  opportunity: one(opportunities, {
    fields: [contracts.opportunityId],
    references: [opportunities.id],
  }),
  proposal: one(proposals, { fields: [contracts.proposalId], references: [proposals.id] }),
  serviceType: one(serviceTypes, {
    fields: [contracts.serviceTypeId],
    references: [serviceTypes.id],
  }),
  owner: one(users, { fields: [contracts.ownerId], references: [users.id] }),
  addendums: many(contractAddendums),
}))

export const contractAddendumsRelations = relations(contractAddendums, ({ one }) => ({
  contract: one(contracts, { fields: [contractAddendums.contractId], references: [contracts.id] }),
  createdByUser: one(users, { fields: [contractAddendums.createdBy], references: [users.id] }),
}))
