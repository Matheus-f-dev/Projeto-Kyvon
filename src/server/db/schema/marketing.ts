import { relations } from 'drizzle-orm'
import {
  date,
  index,
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
  campaignStatusEnum,
  caseStatusEnum,
  contentChannelEnum,
  contentFormatEnum,
  contentStatusEnum,
} from './enums'
import { clients, contacts } from './crm'
import { projects } from './projects'
import { users } from './identity'

/**
 * Marketing da própria Kyvon: campanhas, conteúdos e cases de portfólio.
 *
 * Cases nascem de projetos concluídos e só avançam com autorização registrada
 * do cliente — a autorização é um dado, não um acordo verbal.
 */

export const marketingCampaigns = pgTable(
  'marketing_campaigns',
  {
    id: primaryId(),
    name: varchar('name', { length: 160 }).notNull(),
    objective: text('objective'),
    status: campaignStatusEnum('status').notNull().default('planned'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    budget: numeric('budget', { precision: 14, scale: 2 }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    index('marketing_campaigns_status_idx').on(table.status),
    index('marketing_campaigns_name_idx').on(table.name),
  ],
)

export const marketingContents = pgTable(
  'marketing_contents',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    format: contentFormatEnum('format').notNull(),
    channel: contentChannelEnum('channel').notNull(),
    status: contentStatusEnum('status').notNull().default('idea'),

    campaignId: uuid('campaign_id').references(() => marketingCampaigns.id, {
      onDelete: 'set null',
    }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),

    dueDate: date('due_date'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedUrl: varchar('published_url', { length: 300 }),

    copy: text('copy'),
    referencesNotes: text('references_notes'),
    briefing: text('briefing'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('marketing_contents_code_uq').on(table.code),
    index('marketing_contents_status_idx').on(table.status),
    index('marketing_contents_campaign_idx').on(table.campaignId),
    index('marketing_contents_owner_idx').on(table.ownerId),
    index('marketing_contents_due_idx').on(table.dueDate),
    index('marketing_contents_scheduled_idx').on(table.scheduledAt),
  ],
)

export const cases = pgTable(
  'cases',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    status: caseStatusEnum('status').notNull().default('pending_authorization'),

    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),

    /** Trilha de autorização — sem ela o case não avança de status. */
    authorizationRequestedAt: timestamp('authorization_requested_at', { withTimezone: true }),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    authorizedByContactId: uuid('authorized_by_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    authorizationNotes: text('authorization_notes'),
    deniedAt: timestamp('denied_at', { withTimezone: true }),

    summary: text('summary'),
    challenge: text('challenge'),
    solution: text('solution'),
    results: text('results'),

    publishedUrl: varchar('published_url', { length: 300 }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('cases_code_uq').on(table.code),
    uniqueIndex('cases_project_uq').on(table.projectId),
    index('cases_status_idx').on(table.status),
    index('cases_client_idx').on(table.clientId),
  ],
)

// ── Relations ────────────────────────────────────────────────────────────────

export const marketingCampaignsRelations = relations(marketingCampaigns, ({ one, many }) => ({
  owner: one(users, { fields: [marketingCampaigns.ownerId], references: [users.id] }),
  contents: many(marketingContents),
}))

export const marketingContentsRelations = relations(marketingContents, ({ one }) => ({
  campaign: one(marketingCampaigns, {
    fields: [marketingContents.campaignId],
    references: [marketingCampaigns.id],
  }),
  owner: one(users, { fields: [marketingContents.ownerId], references: [users.id] }),
}))

export const casesRelations = relations(cases, ({ one }) => ({
  project: one(projects, { fields: [cases.projectId], references: [projects.id] }),
  client: one(clients, { fields: [cases.clientId], references: [clients.id] }),
  authorizedByContact: one(contacts, {
    fields: [cases.authorizedByContactId],
    references: [contacts.id],
  }),
  owner: one(users, { fields: [cases.ownerId], references: [users.id] }),
}))
