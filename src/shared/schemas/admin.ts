import { z } from 'zod'

import { PERMISSION_KEYS } from '@/shared/permissions'

/**
 * Schemas de administração: usuários, perfis, catálogos e empresa.
 *
 * Helpers opcionais terminam em `.optional()` — ver a nota em `clients.ts`.
 */

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value : undefined))
    .optional()

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.email('E-mail inválido.').trim().toLowerCase().max(180),
  roleId: z.uuid('Selecione o perfil.'),
  jobTitle: optionalString(80),
  phone: optionalString(40),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  roleId: z.uuid('Selecione o perfil.'),
  jobTitle: optionalString(80),
  phone: optionalString(40),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

/** Dados que a própria pessoa edita em /perfil — sem perfil nem e-mail. */
export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  jobTitle: optionalString(80),
  phone: optionalString(40),
})

export type ProfileInput = z.infer<typeof profileSchema>

export const permissionKeySchema = z.enum(PERMISSION_KEYS)

export const userOverrideSchema = z.object({
  userId: z.uuid(),
  permission: permissionKeySchema,
  /** `inherit` remove a exceção e volta ao que o perfil define. */
  effect: z.enum(['allow', 'deny', 'inherit']),
})

export type UserOverrideInput = z.infer<typeof userOverrideSchema>

export const roleSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do perfil.').max(80),
  description: optionalString(400),
})

export type RoleInput = z.infer<typeof roleSchema>

export const createRoleSchema = roleSchema.extend({
  /** Perfil de partida: o novo perfil nasce com as mesmas permissões. */
  copyFromRoleId: z
    .string()
    .trim()
    .transform((value) => (value ? value : undefined))
    .optional()
    .refine((value) => !value || z.uuid().safeParse(value).success, 'Perfil inválido.'),
})

export type CreateRoleInput = z.infer<typeof createRoleSchema>

export const catalogKindValues = ['lead_source', 'service_type'] as const

export const catalogItemSchema = z.object({
  kind: z.enum(catalogKindValues),
  name: z.string().trim().min(2, 'Informe o nome.').max(80),
})

export type CatalogItemInput = z.infer<typeof catalogItemSchema>

export const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(160),
  legalName: optionalString(160),
  document: optionalString(20),
  email: z
    .string()
    .trim()
    .max(180)
    .transform((value) => (value ? value : undefined))
    .optional()
    .refine((value) => !value || z.email().safeParse(value).success, 'E-mail inválido.'),
  phone: optionalString(40),
  website: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value ? value : undefined))
    .optional()
    .refine((value) => !value || /^https?:\/\/\S+$/i.test(value), 'Informe a URL completa, com https://.'),
})

export type OrganizationInput = z.infer<typeof organizationSchema>

export const auditFilterSchema = z.object({
  q: optionalString(100),
  entityType: optionalString(40),
  action: z.enum(['create', 'update', 'delete', 'login', 'logout', 'login_failed', 'permission_change', 'export']).optional(),
  actorId: z
    .string()
    .trim()
    .transform((value) => (value ? value : undefined))
    .optional()
    .refine((value) => !value || z.uuid().safeParse(value).success),
  from: optionalString(10).refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)),
  to: optionalString(10).refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)),
  page: z.coerce.number().int().positive().optional(),
})

export type AuditFilter = z.infer<typeof auditFilterSchema>
