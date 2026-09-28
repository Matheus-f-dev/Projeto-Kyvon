import { relations } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  boolean,
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

import { deletedAt, primaryId, timestamps } from './_shared'
import { clientStatusEnum, leadStatusEnum, opportunityStageEnum, proposalStatusEnum } from './enums'
import { users } from './identity'

/**
 * Comercial: catálogos, clientes, contatos, leads, oportunidades e propostas.
 */

// ── Catálogos configuráveis (ADR-006) ────────────────────────────────────────

export const leadSources = pgTable(
  'lead_sources',
  {
    id: primaryId(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (table) => [uniqueIndex('lead_sources_key_uq').on(table.key)],
)

export const serviceTypes = pgTable(
  'service_types',
  {
    id: primaryId(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (table) => [uniqueIndex('service_types_key_uq').on(table.key)],
)

// ── Clientes e contatos ──────────────────────────────────────────────────────

export const clients = pgTable(
  'clients',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    /** Razão social. */
    name: varchar('name', { length: 160 }).notNull(),
    tradeName: varchar('trade_name', { length: 160 }),
    document: varchar('document', { length: 20 }),
    email: varchar('email', { length: 180 }),
    phone: varchar('phone', { length: 40 }),
    website: varchar('website', { length: 200 }),
    segment: varchar('segment', { length: 80 }),
    status: clientStatusEnum('status').notNull().default('prospect'),
    sourceId: uuid('source_id').references(() => leadSources.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),

    addressStreet: varchar('address_street', { length: 200 }),
    addressNumber: varchar('address_number', { length: 20 }),
    addressComplement: varchar('address_complement', { length: 80 }),
    addressDistrict: varchar('address_district', { length: 80 }),
    addressCity: varchar('address_city', { length: 80 }),
    addressState: varchar('address_state', { length: 2 }),
    addressZip: varchar('address_zip', { length: 12 }),

    notes: text('notes'),
    /** Atualizado por qualquer interação registrada — alimenta "último contato". */
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('clients_code_uq').on(table.code),
    index('clients_name_idx').on(table.name),
    index('clients_status_idx').on(table.status),
    index('clients_owner_idx').on(table.ownerId),
    index('clients_document_idx').on(table.document),
  ],
)

export const contacts = pgTable(
  'contacts',
  {
    id: primaryId(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    jobTitle: varchar('job_title', { length: 80 }),
    email: varchar('email', { length: 180 }),
    phone: varchar('phone', { length: 40 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    /** Contato autorizado a aprovar materiais em nome do cliente. */
    canApprove: boolean('can_approve').notNull().default(false),
    notes: text('notes'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index('contacts_client_idx').on(table.clientId),
    index('contacts_name_idx').on(table.name),
  ],
)

// ── Leads ────────────────────────────────────────────────────────────────────

/**
 * Contato ainda não qualificado. Vive fora do CRM principal para não poluir a
 * base de clientes com quem talvez nunca feche. A conversão cria cliente +
 * contato + oportunidade e guarda os vínculos aqui.
 */
export const leads = pgTable(
  'leads',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    companyName: varchar('company_name', { length: 160 }),
    email: varchar('email', { length: 180 }),
    phone: varchar('phone', { length: 40 }),
    sourceId: uuid('source_id').references(() => leadSources.id, { onDelete: 'set null' }),
    serviceTypeId: uuid('service_type_id').references(() => serviceTypes.id, {
      onDelete: 'set null',
    }),
    message: text('message'),
    notes: text('notes'),
    status: leadStatusEnum('status').notNull().default('new'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),

    convertedClientId: uuid('converted_client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    convertedContactId: uuid('converted_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    // FK circular com `opportunities` (que também aponta para `leads`). Ambas as
    // colunas são nullable, então não há impasse de inserção.
    convertedOpportunityId: uuid('converted_opportunity_id').references(
      (): AnyPgColumn => opportunities.id,
      { onDelete: 'set null' },
    ),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    discardReason: text('discard_reason'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('leads_code_uq').on(table.code),
    index('leads_status_idx').on(table.status),
    index('leads_owner_idx').on(table.ownerId),
    index('leads_name_idx').on(table.name),
  ],
)

// ── Oportunidades ────────────────────────────────────────────────────────────

export const opportunities = pgTable(
  'opportunities',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    serviceTypeId: uuid('service_type_id').references(() => serviceTypes.id, {
      onDelete: 'set null',
    }),
    sourceId: uuid('source_id').references(() => leadSources.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),

    stage: opportunityStageEnum('stage').notNull().default('new_contact'),
    estimatedValue: numeric('estimated_value', { precision: 14, scale: 2 }),
    /** Campo informativo, preenchido pelo time. Não alimenta cálculo automático. */
    probability: integer('probability'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),

    nextAction: varchar('next_action', { length: 200 }),
    nextActionAt: date('next_action_at'),
    expectedCloseAt: date('expected_close_at'),

    wonAt: timestamp('won_at', { withTimezone: true }),
    lostAt: timestamp('lost_at', { withTimezone: true }),
    lostReason: text('lost_reason'),

    description: text('description'),
    notes: text('notes'),
    /** Ordem dentro da coluna do kanban. */
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('opportunities_code_uq').on(table.code),
    index('opportunities_client_idx').on(table.clientId),
    index('opportunities_stage_idx').on(table.stage),
    index('opportunities_owner_idx').on(table.ownerId),
    index('opportunities_next_action_idx').on(table.nextActionAt),
    index('opportunities_title_idx').on(table.title),
  ],
)

// ── Propostas ────────────────────────────────────────────────────────────────

/** Versionada por oportunidade: v1, v2… Uma versão nunca sobrescreve a anterior. */
export const proposals = pgTable(
  'proposals',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    title: varchar('title', { length: 180 }).notNull(),
    scope: text('scope'),
    deliverables: text('deliverables'),
    totalValue: numeric('total_value', { precision: 14, scale: 2 }),
    paymentTerms: text('payment_terms'),
    estimatedDurationDays: integer('estimated_duration_days'),
    validUntil: date('valid_until'),
    status: proposalStatusEnum('status').notNull().default('draft'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('proposals_code_uq').on(table.code),
    uniqueIndex('proposals_opportunity_version_uq').on(table.opportunityId, table.version),
    index('proposals_status_idx').on(table.status),
  ],
)

// ── Relations ────────────────────────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ one, many }) => ({
  owner: one(users, { fields: [clients.ownerId], references: [users.id] }),
  source: one(leadSources, { fields: [clients.sourceId], references: [leadSources.id] }),
  contacts: many(contacts),
  opportunities: many(opportunities),
}))

export const contactsRelations = relations(contacts, ({ one }) => ({
  client: one(clients, { fields: [contacts.clientId], references: [clients.id] }),
}))

export const leadsRelations = relations(leads, ({ one }) => ({
  owner: one(users, { fields: [leads.ownerId], references: [users.id] }),
  source: one(leadSources, { fields: [leads.sourceId], references: [leadSources.id] }),
  serviceType: one(serviceTypes, { fields: [leads.serviceTypeId], references: [serviceTypes.id] }),
  convertedClient: one(clients, {
    fields: [leads.convertedClientId],
    references: [clients.id],
  }),
}))

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  client: one(clients, { fields: [opportunities.clientId], references: [clients.id] }),
  contact: one(contacts, { fields: [opportunities.contactId], references: [contacts.id] }),
  owner: one(users, { fields: [opportunities.ownerId], references: [users.id] }),
  serviceType: one(serviceTypes, {
    fields: [opportunities.serviceTypeId],
    references: [serviceTypes.id],
  }),
  source: one(leadSources, { fields: [opportunities.sourceId], references: [leadSources.id] }),
  lead: one(leads, { fields: [opportunities.leadId], references: [leads.id] }),
  proposals: many(proposals),
}))

export const proposalsRelations = relations(proposals, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [proposals.opportunityId],
    references: [opportunities.id],
  }),
  createdByUser: one(users, { fields: [proposals.createdBy], references: [users.id] }),
}))
