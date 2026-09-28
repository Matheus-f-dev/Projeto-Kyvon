import { relations } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { primaryId, timestamps } from './_shared'
import { projectStatusEnum, stageStatusEnum, taskPriorityEnum, taskTypeEnum } from './enums'
import { clients, serviceTypes } from './crm'
import { contracts } from './contracts'
import { roles, users } from './identity'

/**
 * Projetos, etapas e templates.
 *
 * Etapa e status são dimensões independentes (ADR-004): `currentStageId` diz
 * onde o projeto está no processo; `status` diz como ele está agora.
 */

// ── Templates ────────────────────────────────────────────────────────────────

export const projectTemplates = pgTable(
  'project_templates',
  {
    id: primaryId(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    serviceTypeId: uuid('service_type_id').references(() => serviceTypes.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (table) => [uniqueIndex('project_templates_key_uq').on(table.key)],
)

export const projectTemplateStages = pgTable(
  'project_template_stages',
  {
    id: primaryId(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => projectTemplates.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('project_template_stages_template_idx').on(table.templateId)],
)

export const projectTemplateTasks = pgTable(
  'project_template_tasks',
  {
    id: primaryId(),
    templateStageId: uuid('template_stage_id')
      .notNull()
      .references(() => projectTemplateStages.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    type: taskTypeEnum('type').notNull().default('generic'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    estimateHours: numeric('estimate_hours', { precision: 7, scale: 2 }),
    /** Perfil sugerido como responsável ao instanciar o template. */
    defaultRoleId: uuid('default_role_id').references(() => roles.id, { onDelete: 'set null' }),
    /** Prazo relativo ao início do projeto, em dias. */
    dueOffsetDays: integer('due_offset_days'),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('project_template_tasks_stage_idx').on(table.templateStageId)],
)

export const projectTemplateChecklistItems = pgTable(
  'project_template_checklist_items',
  {
    id: primaryId(),
    templateTaskId: uuid('template_task_id')
      .notNull()
      .references(() => projectTemplateTasks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('project_template_checklist_task_idx').on(table.templateTaskId)],
)

export const projectTemplateTaskDependencies = pgTable(
  'project_template_task_dependencies',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTemplateTasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => projectTemplateTasks.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependsOnTaskId] })],
)

// ── Projetos ─────────────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    description: text('description'),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    /** Quando há contrato, o cliente é derivado dele (regra 4 de product.md). */
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').references(() => projectTemplates.id, {
      onDelete: 'set null',
    }),

    status: projectStatusEnum('status').notNull().default('planning'),
    /** FK circular com `project_stages` — resolvida após a criação das etapas. */
    currentStageId: uuid('current_stage_id').references((): AnyPgColumn => projectStages.id, {
      onDelete: 'set null',
    }),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),

    startDate: date('start_date'),
    dueDate: date('due_date'),
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),

    /** Bloqueio exige justificativa (regra 5 de product.md). */
    blockedReason: text('blocked_reason'),
    blockedSince: timestamp('blocked_since', { withTimezone: true }),
    blockedOwnerId: uuid('blocked_owner_id').references(() => users.id, { onDelete: 'set null' }),

    /** 0-100. Cache do cálculo sobre as tarefas; recalculado a cada mudança. */
    progress: integer('progress').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('projects_code_uq').on(table.code),
    index('projects_client_idx').on(table.clientId),
    index('projects_contract_idx').on(table.contractId),
    index('projects_status_idx').on(table.status),
    index('projects_owner_idx').on(table.ownerId),
    index('projects_due_date_idx').on(table.dueDate),
    index('projects_name_idx').on(table.name),
  ],
)

export const projectStages = pgTable(
  'project_stages',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    status: stageStatusEnum('status').notNull().default('pending'),
    position: integer('position').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('project_stages_project_idx').on(table.projectId),
    index('project_stages_status_idx').on(table.status),
  ],
)

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Papel dentro deste projeto (ex.: "UI Designer"), livre e informativo. */
    roleInProject: varchar('role_in_project', { length: 60 }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('project_members_user_idx').on(table.userId),
  ],
)

// ── Relations ────────────────────────────────────────────────────────────────

export const projectTemplatesRelations = relations(projectTemplates, ({ one, many }) => ({
  serviceType: one(serviceTypes, {
    fields: [projectTemplates.serviceTypeId],
    references: [serviceTypes.id],
  }),
  stages: many(projectTemplateStages),
}))

export const projectTemplateStagesRelations = relations(projectTemplateStages, ({ one, many }) => ({
  template: one(projectTemplates, {
    fields: [projectTemplateStages.templateId],
    references: [projectTemplates.id],
  }),
  tasks: many(projectTemplateTasks),
}))

export const projectTemplateTasksRelations = relations(projectTemplateTasks, ({ one, many }) => ({
  stage: one(projectTemplateStages, {
    fields: [projectTemplateTasks.templateStageId],
    references: [projectTemplateStages.id],
  }),
  defaultRole: one(roles, {
    fields: [projectTemplateTasks.defaultRoleId],
    references: [roles.id],
  }),
  checklistItems: many(projectTemplateChecklistItems),
}))

export const projectTemplateChecklistItemsRelations = relations(
  projectTemplateChecklistItems,
  ({ one }) => ({
    task: one(projectTemplateTasks, {
      fields: [projectTemplateChecklistItems.templateTaskId],
      references: [projectTemplateTasks.id],
    }),
  }),
)

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  contract: one(contracts, { fields: [projects.contractId], references: [contracts.id] }),
  template: one(projectTemplates, {
    fields: [projects.templateId],
    references: [projectTemplates.id],
  }),
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  stages: many(projectStages),
  members: many(projectMembers),
}))

export const projectStagesRelations = relations(projectStages, ({ one }) => ({
  project: one(projects, { fields: [projectStages.projectId], references: [projects.id] }),
}))

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}))
