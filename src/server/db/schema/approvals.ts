import { relations } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { primaryId, timestamps } from './_shared'
import { approvalStatusEnum } from './enums'
import { clients, contacts } from './crm'
import { projects } from './projects'
import { tasks } from './tasks'
import { users } from './identity'

/**
 * Aprovações.
 *
 * Uma aprovação nunca é sobrescrita (regra 7 de product.md). "Solicitar ajustes"
 * encerra a versão atual e abre a próxima: v1 → v2 → v3. O histórico de decisões
 * é imutável — é o que permite provar o que foi aprovado e quando.
 */

export const approvals = pgTable(
  'approvals',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),

    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Material geralmente nasce de uma tarefa; o vínculo é opcional. */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),

    status: approvalStatusEnum('status').notNull().default('pending'),
    /** Número da versão aberta agora. Espelha `approval_versions.version`. */
    currentVersion: integer('current_version').notNull().default(1),

    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    /** Quem decide internamente. */
    approverUserId: uuid('approver_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Quem decide do lado do cliente — a decisão é registrada pela equipe. */
    approverContactId: uuid('approver_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),

    dueDate: date('due_date'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('approvals_code_uq').on(table.code),
    index('approvals_project_idx').on(table.projectId),
    index('approvals_client_idx').on(table.clientId),
    index('approvals_status_idx').on(table.status),
    index('approvals_approver_idx').on(table.approverUserId),
    index('approvals_due_date_idx').on(table.dueDate),
  ],
)

export const approvalVersions = pgTable(
  'approval_versions',
  {
    id: primaryId(),
    approvalId: uuid('approval_id')
      .notNull()
      .references(() => approvals.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** O que mudou nesta versão em relação à anterior. */
    notes: text('notes'),
    status: approvalStatusEnum('status').notNull().default('pending'),

    submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),

    decisionComment: text('decision_comment'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('approval_versions_number_uq').on(table.approvalId, table.version),
    index('approval_versions_status_idx').on(table.status),
  ],
)

// ── Relations ────────────────────────────────────────────────────────────────

export const approvalsRelations = relations(approvals, ({ one, many }) => ({
  project: one(projects, { fields: [approvals.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [approvals.taskId], references: [tasks.id] }),
  client: one(clients, { fields: [approvals.clientId], references: [clients.id] }),
  requester: one(users, { fields: [approvals.requestedBy], references: [users.id] }),
  approver: one(users, { fields: [approvals.approverUserId], references: [users.id] }),
  approverContact: one(contacts, {
    fields: [approvals.approverContactId],
    references: [contacts.id],
  }),
  versions: many(approvalVersions),
}))

export const approvalVersionsRelations = relations(approvalVersions, ({ one }) => ({
  approval: one(approvals, { fields: [approvalVersions.approvalId], references: [approvals.id] }),
  submitter: one(users, { fields: [approvalVersions.submittedBy], references: [users.id] }),
  decider: one(users, { fields: [approvalVersions.decidedBy], references: [users.id] }),
}))
