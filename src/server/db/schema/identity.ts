import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAt, deletedAt, primaryId, timestamps } from './_shared'
import { permissionEffectEnum, userStatusEnum } from './enums'

/**
 * Identidade e controle de acesso.
 * Modelo detalhado em `docs/permissions.md`.
 */

export const roles = pgTable(
  'roles',
  {
    id: primaryId(),
    /** Chave estável usada em código: admin, gestor, comercial, … */
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    /** Perfis de sistema não podem ser excluídos (mas suas permissões são editáveis). */
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps(),
  },
  (table) => [uniqueIndex('roles_key_uq').on(table.key)],
)

export const permissions = pgTable(
  'permissions',
  {
    id: primaryId(),
    /** Formato `<módulo>.<recurso?>.<ação>`, ex.: `contracts.values.read`. */
    key: varchar('key', { length: 60 }).notNull(),
    module: varchar('module', { length: 40 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    description: text('description'),
    /** Valores financeiros, documentos e poder de decisão. Nunca concedidas por padrão. */
    isSensitive: boolean('is_sensitive').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('permissions_key_uq').on(table.key),
    index('permissions_module_idx').on(table.module),
  ],
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index('role_permissions_permission_idx').on(table.permissionId),
  ],
)

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Sempre armazenado em minúsculas — normalizado no service. */
    email: varchar('email', { length: 180 }).notNull(),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    jobTitle: varchar('job_title', { length: 80 }),
    phone: varchar('phone', { length: 40 }),
    status: userStatusEnum('status').notNull().default('invited'),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('users_email_uq').on(table.email),
    index('users_role_idx').on(table.roleId),
    index('users_status_idx').on(table.status),
  ],
)

/**
 * Sobreposição granular por usuário, aplicada sobre o perfil.
 * `deny` vence tudo — inclusive ADMIN.
 */
export const userPermissions = pgTable(
  'user_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    effect: permissionEffectEnum('effect').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.permissionId] }),
    index('user_permissions_permission_idx').on(table.permissionId),
  ],
)

/**
 * Sessões opacas (ADR-003). O banco guarda apenas o HMAC do token —
 * um vazamento do banco não produz sessões utilizáveis.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt),
  ],
)

// ── Relations ────────────────────────────────────────────────────────────────

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userPermissions: many(userPermissions),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  permissions: many(userPermissions),
  sessions: many(sessions),
}))

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, { fields: [userPermissions.userId], references: [users.id] }),
  permission: one(permissions, {
    fields: [userPermissions.permissionId],
    references: [permissions.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))
