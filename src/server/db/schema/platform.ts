import { relations, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAt, primaryId, timestamps } from './_shared'
import { activityVerbEnum, auditActionEnum, entityTypeEnum, notificationTypeEnum } from './enums'
import { clients, opportunities, proposals } from './crm'
import { contractAddendums, contracts } from './contracts'
import { projects } from './projects'
import { tasks } from './tasks'
import { approvalVersions, approvals } from './approvals'
import { scopeChanges } from './scope'
import { supportTickets } from './support'
import { cases, marketingContents } from './marketing'
import { users } from './identity'

/**
 * Infraestrutura transversal: arquivos, comentários, notificações, feed de
 * atividade, auditoria, configuração e geração de códigos legíveis.
 */

// ── Arquivos ─────────────────────────────────────────────────────────────────

/**
 * Metadados. O binário vive no storage (ADR-008) — nunca no banco.
 * `storageKey` é sempre gerado pelo servidor; o nome enviado pelo usuário
 * fica só em `originalName` e jamais compõe um caminho.
 */
export const files = pgTable(
  'files',
  {
    id: primaryId(),
    name: varchar('name', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    storageDriver: varchar('storage_driver', { length: 20 }).notNull(),
    storageKey: varchar('storage_key', { length: 400 }).notNull(),
    checksum: varchar('checksum', { length: 64 }),

    /** Versionamento: uma nova versão aponta para a anterior. */
    version: integer('version').notNull().default(1),
    previousFileId: uuid('previous_file_id').references((): AnyPgColumn => files.id, {
      onDelete: 'set null',
    }),

    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('files_storage_key_uq').on(table.storageKey),
    index('files_uploaded_by_idx').on(table.uploadedBy),
    index('files_name_idx').on(table.name),
  ],
)

/**
 * Vínculo de um arquivo a uma entidade.
 *
 * Usa FKs reais em vez de `(entity_type, entity_id)` (ADR-007): o CHECK garante
 * que exatamente uma coluna esteja preenchida, e o banco continua responsável
 * pela integridade. Um mesmo arquivo pode estar vinculado a mais de uma entidade.
 */
export const fileLinks = pgTable(
  'file_links',
  {
    id: primaryId(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').references(() => proposals.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'cascade' }),
    contractAddendumId: uuid('contract_addendum_id').references(() => contractAddendums.id, {
      onDelete: 'cascade',
    }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    approvalVersionId: uuid('approval_version_id').references(() => approvalVersions.id, {
      onDelete: 'cascade',
    }),
    scopeChangeId: uuid('scope_change_id').references(() => scopeChanges.id, {
      onDelete: 'cascade',
    }),
    supportTicketId: uuid('support_ticket_id').references(() => supportTickets.id, {
      onDelete: 'cascade',
    }),
    marketingContentId: uuid('marketing_content_id').references(() => marketingContents.id, {
      onDelete: 'cascade',
    }),
    caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),

    /** Rótulo do papel do arquivo no vínculo, ex.: "Contrato assinado". */
    label: varchar('label', { length: 120 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('file_links_file_idx').on(table.fileId),
    index('file_links_client_idx').on(table.clientId),
    index('file_links_project_idx').on(table.projectId),
    index('file_links_task_idx').on(table.taskId),
    index('file_links_contract_idx').on(table.contractId),
    index('file_links_approval_version_idx').on(table.approvalVersionId),
    index('file_links_support_ticket_idx').on(table.supportTicketId),
    index('file_links_marketing_content_idx').on(table.marketingContentId),
    check(
      'file_links_exactly_one_target',
      sql`num_nonnulls(${table.clientId}, ${table.proposalId}, ${table.contractId}, ${table.contractAddendumId}, ${table.projectId}, ${table.taskId}, ${table.approvalVersionId}, ${table.scopeChangeId}, ${table.supportTicketId}, ${table.marketingContentId}, ${table.caseId}) = 1`,
    ),
  ],
)

// ── Comentários ──────────────────────────────────────────────────────────────

/**
 * Comentários de todas as entidades comentáveis, no mesmo padrão de FK exclusiva
 * dos vínculos de arquivo. Uma tabela em vez de nove, sem abrir mão de integridade.
 */
export const comments = pgTable(
  'comments',
  {
    id: primaryId(),
    body: text('body').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),

    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'cascade' }),
    approvalId: uuid('approval_id').references(() => approvals.id, { onDelete: 'cascade' }),
    scopeChangeId: uuid('scope_change_id').references(() => scopeChanges.id, {
      onDelete: 'cascade',
    }),
    supportTicketId: uuid('support_ticket_id').references(() => supportTickets.id, {
      onDelete: 'cascade',
    }),
    marketingContentId: uuid('marketing_content_id').references(() => marketingContents.id, {
      onDelete: 'cascade',
    }),

    /** Visível apenas para a equipe — nunca sai em material para o cliente. */
    isInternal: boolean('is_internal').notNull().default(true),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('comments_task_idx').on(table.taskId),
    index('comments_project_idx').on(table.projectId),
    index('comments_client_idx').on(table.clientId),
    index('comments_opportunity_idx').on(table.opportunityId),
    index('comments_support_ticket_idx').on(table.supportTicketId),
    index('comments_author_idx').on(table.authorId),
    check(
      'comments_exactly_one_target',
      sql`num_nonnulls(${table.taskId}, ${table.projectId}, ${table.clientId}, ${table.opportunityId}, ${table.contractId}, ${table.approvalId}, ${table.scopeChangeId}, ${table.supportTicketId}, ${table.marketingContentId}) = 1`,
    ),
  ],
)

// ── Notificações, atividade e auditoria ──────────────────────────────────────

/**
 * As três tabelas abaixo usam referência polimórfica (ADR-007).
 *
 * É deliberado e limitado a elas: o registro precisa **sobreviver** à exclusão
 * da entidade. Uma FK com CASCADE apagaria exatamente a evidência que a
 * auditoria existe para preservar.
 */

export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),

    /** Quem provocou. Nulo quando a origem é o próprio sistema (ex.: prazo vencendo). */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),

    entityType: entityTypeEnum('entity_type'),
    entityId: uuid('entity_id'),
    /** Caminho interno para onde a notificação leva. Sempre relativo. */
    link: varchar('link', { length: 300 }),

    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // Badge de não lidas e a lista do painel — as duas consultas quentes.
    index('notifications_user_read_idx').on(table.userId, table.readAt, table.createdAt),
    index('notifications_entity_idx').on(table.entityType, table.entityId),
  ],
)

export const activities = pgTable(
  'activities',
  {
    id: primaryId(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    verb: activityVerbEnum('verb').notNull(),

    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    /** Rótulo congelado no momento do evento, para o feed sobreviver a renomeações. */
    entityLabel: varchar('entity_label', { length: 200 }).notNull(),

    /** Escopo do feed. Nulos quando o evento não pertence a um projeto/cliente. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),

    summary: varchar('summary', { length: 300 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (table) => [
    index('activities_created_idx').on(table.createdAt),
    index('activities_project_idx').on(table.projectId, table.createdAt),
    index('activities_client_idx').on(table.clientId, table.createdAt),
    index('activities_entity_idx').on(table.entityType, table.entityId),
    index('activities_actor_idx').on(table.actorId),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: varchar('actor_email', { length: 180 }),
    action: auditActionEnum('action').notNull(),

    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id'),
    entityLabel: varchar('entity_label', { length: 200 }),

    /** `{ campo: { from, to } }`. Só os campos que realmente mudaram. */
    changes: jsonb('changes'),

    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (table) => [
    index('audit_logs_created_idx').on(table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_actor_idx').on(table.actorId),
    index('audit_logs_action_idx').on(table.action),
  ],
)

// ── Configuração e códigos ───────────────────────────────────────────────────

/** Singleton: sempre exatamente uma linha, garantida pelo CHECK. */
export const organization = pgTable(
  'organization',
  {
    id: integer('id').primaryKey().default(1),
    name: varchar('name', { length: 160 }).notNull(),
    legalName: varchar('legal_name', { length: 160 }),
    document: varchar('document', { length: 20 }),
    email: varchar('email', { length: 180 }),
    phone: varchar('phone', { length: 40 }),
    website: varchar('website', { length: 200 }),
    logoFileId: uuid('logo_file_id').references(() => files.id, { onDelete: 'set null' }),
    timezone: varchar('timezone', { length: 60 }).notNull().default('America/Sao_Paulo'),
    ...timestamps(),
  },
  (table) => [check('organization_singleton', sql`${table.id} = 1`)],
)

/**
 * Códigos legíveis (CLI-0001, PRJ-0042…).
 *
 * Tabela em vez de SEQUENCE do Postgres porque o prefixo é configurável e o
 * contador precisa ser transacional junto com a criação da entidade —
 * `UPDATE … RETURNING` dá atomicidade e permite rollback conjunto.
 */
export const codeSequences = pgTable('code_sequences', {
  entity: varchar('entity', { length: 40 }).primaryKey(),
  prefix: varchar('prefix', { length: 8 }).notNull(),
  currentValue: integer('current_value').notNull().default(0),
  padding: integer('padding').notNull().default(4),
})

// ── Relations ────────────────────────────────────────────────────────────────

export const filesRelations = relations(files, ({ one, many }) => ({
  uploader: one(users, { fields: [files.uploadedBy], references: [users.id] }),
  links: many(fileLinks),
}))

export const fileLinksRelations = relations(fileLinks, ({ one }) => ({
  file: one(files, { fields: [fileLinks.fileId], references: [files.id] }),
}))

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  project: one(projects, { fields: [comments.projectId], references: [projects.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  actor: one(users, { fields: [notifications.actorId], references: [users.id] }),
}))

export const activitiesRelations = relations(activities, ({ one }) => ({
  actor: one(users, { fields: [activities.actorId], references: [users.id] }),
  project: one(projects, { fields: [activities.projectId], references: [projects.id] }),
  client: one(clients, { fields: [activities.clientId], references: [clients.id] }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}))
