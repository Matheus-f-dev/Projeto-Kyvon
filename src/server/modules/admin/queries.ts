import { and, asc, count, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm'

import { db } from '@/server/db/client'
import {
  auditLogs,
  leadSources,
  organization,
  permissions,
  projectTemplates,
  projectTemplateStages,
  projectTemplateTasks,
  rolePermissions,
  roles,
  serviceTypes,
  userPermissions,
  users,
} from '@/server/db/schema'
import { resolvePermissions } from '@/server/rbac/resolve'
import { buildPageResult, type PageResult } from '@/server/pagination'
import { addDaysISO, localDateTimeToDate } from '@/shared/dates'
import { isUuid } from '@/shared/ids'
import type { PermissionKey } from '@/shared/permissions'
import type { AuditFilter } from '@/shared/schemas/admin'

// ── Usuários ─────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string
  name: string
  email: string
  jobTitle: string | null
  phone: string | null
  status: 'active' | 'invited' | 'suspended'
  role: { id: string; key: string; name: string }
  lastLoginAt: Date | null
  overrides: number
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      jobTitle: users.jobTitle,
      phone: users.phone,
      status: users.status,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
      lastLoginAt: users.lastLoginAt,
      overrides: sql<number>`(select count(*)::int from ${userPermissions} where ${userPermissions.userId} = ${users.id})`,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(isNull(users.deletedAt))
    .orderBy(sql`case ${users.status} when 'active' then 0 when 'invited' then 1 else 2 end`, asc(users.name))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle,
    phone: row.phone,
    status: row.status,
    role: { id: row.roleId, key: row.roleKey, name: row.roleName },
    lastLoginAt: row.lastLoginAt,
    overrides: row.overrides,
  }))
}

export interface AdminUserDetail extends AdminUserRow {
  overridesList: { key: PermissionKey; effect: 'allow' | 'deny' }[]
  rolePermissions: PermissionKey[]
  effective: PermissionKey[]
}

export async function getAdminUser(userId: string): Promise<AdminUserDetail | null> {
  if (!isUuid(userId)) return null
  const list = await listAdminUsers()
  const user = list.find((row) => row.id === userId)
  if (!user) return null

  const [overrides, granted] = await Promise.all([
    db
      .select({ key: permissions.key, effect: userPermissions.effect })
      .from(userPermissions)
      .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
      .where(eq(userPermissions.userId, userId)),
    db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, user.role.id)),
  ])

  const overridesList = overrides.map((row) => ({ key: row.key as PermissionKey, effect: row.effect }))
  const rolePermissionKeys = granted.map((row) => row.key as PermissionKey)
  const effective = [...resolvePermissions({ rolePermissions: rolePermissionKeys, overrides: overridesList })]

  return { ...user, overridesList, rolePermissions: rolePermissionKeys, effective }
}

// ── Perfis ───────────────────────────────────────────────────────────────────

export interface RoleRow {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: PermissionKey[]
  users: number
}

export async function listRoles(): Promise<RoleRow[]> {
  const [roleRows, grants, counts] = await Promise.all([
    db.select().from(roles).orderBy(desc(roles.isSystem), asc(roles.name)),
    db
      .select({ roleId: rolePermissions.roleId, key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)),
    db
      .select({ roleId: users.roleId, value: count() })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.roleId),
  ])

  const byRole = new Map<string, PermissionKey[]>()
  for (const grant of grants) byRole.set(grant.roleId, [...(byRole.get(grant.roleId) ?? []), grant.key as PermissionKey])
  const usersByRole = new Map(counts.map((row) => [row.roleId, row.value]))

  return roleRows.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: byRole.get(role.id) ?? [],
    users: usersByRole.get(role.id) ?? 0,
  }))
}

// ── Catálogos, templates, empresa ────────────────────────────────────────────

export interface CatalogRow {
  id: string
  name: string
  isActive: boolean
  position: number
}

export async function listCatalog(kind: 'lead_source' | 'service_type'): Promise<CatalogRow[]> {
  const table = kind === 'lead_source' ? leadSources : serviceTypes
  return db
    .select({ id: table.id, name: table.name, isActive: table.isActive, position: table.position })
    .from(table)
    .orderBy(asc(table.position), asc(table.name))
}

export interface TemplateRow {
  id: string
  name: string
  description: string | null
  isActive: boolean
  serviceType: string | null
  stages: number
  tasks: number
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const rows = await db
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      description: projectTemplates.description,
      isActive: projectTemplates.isActive,
      serviceType: serviceTypes.name,
      stages: sql<number>`(select count(*)::int from ${projectTemplateStages} where ${projectTemplateStages.templateId} = ${projectTemplates.id})`,
      tasks: sql<number>`(select count(*)::int from ${projectTemplateTasks} inner join ${projectTemplateStages} on ${projectTemplateStages.id} = ${projectTemplateTasks.templateStageId} where ${projectTemplateStages.templateId} = ${projectTemplates.id})`,
    })
    .from(projectTemplates)
    .leftJoin(serviceTypes, eq(serviceTypes.id, projectTemplates.serviceTypeId))
    .orderBy(asc(projectTemplates.name))
  return rows
}

export async function getOrganization() {
  const [row] = await db.select().from(organization).where(eq(organization.id, 1)).limit(1)
  return row ?? null
}

// ── Auditoria ────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: string
  action: string
  entityType: string
  entityId: string | null
  entityLabel: string | null
  changes: unknown
  actorName: string | null
  actorEmail: string | null
  ipAddress: string | null
  createdAt: Date
}

const AUDIT_PAGE_SIZE = 50

/**
 * Log de auditoria, do mais recente para o mais antigo. Somente leitura — não
 * existe rota que altere ou apague um registro (`docs/permissions.md`, seção 6).
 */
export async function listAuditLogs(filter: AuditFilter): Promise<PageResult<AuditRow>> {
  const page = filter.page ?? 1
  const conditions: SQL[] = []

  if (filter.action) conditions.push(eq(auditLogs.action, filter.action))
  if (filter.entityType) conditions.push(sql`${auditLogs.entityType}::text = ${filter.entityType}`)
  if (filter.actorId) conditions.push(eq(auditLogs.actorId, filter.actorId))
  if (filter.from) {
    const from = localDateTimeToDate(`${filter.from}T00:00`)
    if (from) conditions.push(gte(auditLogs.createdAt, from))
  }
  if (filter.to) {
    const to = localDateTimeToDate(`${addDaysISO(filter.to, 1)}T00:00`)
    if (to) conditions.push(lt(auditLogs.createdAt, to))
  }
  const q = filter.q?.trim()
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(or(ilike(auditLogs.entityLabel, pattern), ilike(auditLogs.actorEmail, pattern)) as SQL)
  }
  const where = and(...conditions)

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        entityLabel: auditLogs.entityLabel,
        changes: auditLogs.changes,
        actorName: users.name,
        actorEmail: auditLogs.actorEmail,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ value: count() }).from(auditLogs).where(where),
  ])

  return buildPageResult(rows, total?.value ?? 0, page, AUDIT_PAGE_SIZE)
}
