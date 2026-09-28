import { relations, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  boolean,
  check,
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
import { taskDependencyTypeEnum, taskPriorityEnum, taskStatusEnum, taskTypeEnum } from './enums'
import { projectStages, projects } from './projects'
import { users } from './identity'

/**
 * Tarefas.
 *
 * Fonte única de trabalho do sistema. A "área DEV" é uma visualização filtrada
 * destas mesmas linhas — não existe um segundo sistema de tarefas.
 */

export const tasks = pgTable(
  'tasks',
  {
    id: primaryId(),
    code: varchar('code', { length: 20 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),

    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id').references(() => projectStages.id, { onDelete: 'set null' }),
    parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => tasks.id, {
      onDelete: 'cascade',
    }),

    status: taskStatusEnum('status').notNull().default('todo'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    type: taskTypeEnum('type').notNull().default('generic'),

    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),

    startDate: date('start_date'),
    dueDate: date('due_date'),
    estimateHours: numeric('estimate_hours', { precision: 7, scale: 2 }),
    spentHours: numeric('spent_hours', { precision: 7, scale: 2 }),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    /**
     * Bloqueio exige motivo, início e responsável (regra 5 de product.md).
     * O CHECK garante a regra no banco, não só no service.
     */
    blockedReason: text('blocked_reason'),
    blockedSince: timestamp('blocked_since', { withTimezone: true }),
    blockedOwnerId: uuid('blocked_owner_id').references(() => users.id, { onDelete: 'set null' }),

    /** Ordem dentro da coluna do kanban. */
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('tasks_code_uq').on(table.code),
    index('tasks_project_idx').on(table.projectId),
    index('tasks_stage_idx').on(table.stageId),
    index('tasks_assignee_idx').on(table.assigneeId),
    index('tasks_status_idx').on(table.status),
    index('tasks_due_date_idx').on(table.dueDate),
    index('tasks_priority_idx').on(table.priority),
    index('tasks_title_idx').on(table.title),
    // "Minhas tarefas de hoje" é a consulta mais frequente do sistema.
    index('tasks_assignee_status_due_idx').on(table.assigneeId, table.status, table.dueDate),
    check(
      'tasks_blocked_requires_reason',
      sql`${table.status} <> 'blocked' OR (${table.blockedReason} IS NOT NULL AND ${table.blockedSince} IS NOT NULL)`,
    ),
  ],
)

/**
 * Campos técnicos, presentes só em tarefas de desenvolvimento. Tabela separada
 * para não engordar `tasks` com colunas nulas na maioria das linhas.
 */
export const taskDevDetails = pgTable('task_dev_details', {
  taskId: uuid('task_id')
    .primaryKey()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  repository: varchar('repository', { length: 200 }),
  branch: varchar('branch', { length: 120 }),
  pullRequestUrl: varchar('pull_request_url', { length: 300 }),
  environment: varchar('environment', { length: 40 }),
  version: varchar('version', { length: 40 }),
  release: varchar('release', { length: 40 }),
  ...timestamps(),
})

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: taskDependencyTypeEnum('type').notNull().default('blocks'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    index('task_dependencies_depends_on_idx').on(table.dependsOnTaskId),
    check('task_dependencies_no_self', sql`${table.taskId} <> ${table.dependsOnTaskId}`),
  ],
)

export const taskChecklistItems = pgTable(
  'task_checklist_items',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    isDone: boolean('is_done').notNull().default(false),
    position: integer('position').notNull().default(0),
    doneBy: uuid('done_by').references(() => users.id, { onDelete: 'set null' }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index('task_checklist_items_task_idx').on(table.taskId)],
)

/** Quem recebe notificação de movimentação da tarefa sem ser o responsável. */
export const taskWatchers = pgTable(
  'task_watchers',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.userId] }),
    index('task_watchers_user_idx').on(table.userId),
  ],
)

// ── Relations ────────────────────────────────────────────────────────────────

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  stage: one(projectStages, { fields: [tasks.stageId], references: [projectStages.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  createdByUser: one(users, { fields: [tasks.createdBy], references: [users.id] }),
  devDetails: one(taskDevDetails, {
    fields: [tasks.id],
    references: [taskDevDetails.taskId],
  }),
  checklistItems: many(taskChecklistItems),
  watchers: many(taskWatchers),
}))

export const taskDevDetailsRelations = relations(taskDevDetails, ({ one }) => ({
  task: one(tasks, { fields: [taskDevDetails.taskId], references: [tasks.id] }),
}))

export const taskChecklistItemsRelations = relations(taskChecklistItems, ({ one }) => ({
  task: one(tasks, { fields: [taskChecklistItems.taskId], references: [tasks.id] }),
}))

export const taskWatchersRelations = relations(taskWatchers, ({ one }) => ({
  task: one(tasks, { fields: [taskWatchers.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskWatchers.userId], references: [users.id] }),
}))
