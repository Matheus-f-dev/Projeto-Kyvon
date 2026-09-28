'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  formDataToObject,
  parseInput,
  runAction,
  successState,
  type ActionState,
} from '@/server/action-state'
import { requireAuth, requirePermission } from '@/server/auth/context'
import {
  catalogItemSchema,
  catalogKindValues,
  createRoleSchema,
  createUserSchema,
  organizationSchema,
  permissionKeySchema,
  profileSchema,
  roleSchema,
  updateUserSchema,
  userOverrideSchema,
} from '@/shared/schemas/admin'

import {
  createCatalogItem,
  createRole,
  createUser,
  deleteRole,
  resetUserPassword,
  revokeOtherSessions,
  setRolePermissions,
  setTemplateActive,
  setUserOverride,
  setUserStatus,
  updateCatalogItem,
  updateOrganization,
  updateOwnProfile,
  updateRole,
  updateUser,
} from './service'

/**
 * Server Actions de administração. Cada uma confere a permissão da área;
 * as travas de escalada e de autotrava ficam no service, perto do dado.
 */

const idSchema = z.uuid()

function revalidateSettings() {
  revalidatePath('/configuracoes', 'layout')
}

// ── Usuários ─────────────────────────────────────────────────────────────────

export async function createUserAction(
  _previous: unknown,
  formData: FormData,
): Promise<ActionState<{ temporaryPassword: string; email: string }>> {
  return runAction(async () => {
    const context = await requirePermission('users.write')
    const input = parseInput(createUserSchema, formDataToObject(formData))
    const result = await createUser(input, context)
    revalidateSettings()
    return successState({ temporaryPassword: result.temporaryPassword, email: input.email }, 'Usuário criado.')
  })
}

export async function updateUserAction(userId: string, _previous: unknown, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('users.write')
    const input = parseInput(updateUserSchema, formDataToObject(formData))
    await updateUser(idSchema.parse(userId), input, context)
    revalidateSettings()
    return successState(undefined, 'Usuário atualizado.')
  })
}

export async function setUserStatusAction(userId: string, status: 'active' | 'suspended'): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('users.write')
    await setUserStatus(idSchema.parse(userId), z.enum(['active', 'suspended']).parse(status), context)
    revalidateSettings()
    return successState(undefined, status === 'suspended' ? 'Usuário suspenso. As sessões dele foram encerradas.' : 'Usuário reativado.')
  })
}

export async function resetUserPasswordAction(userId: string): Promise<ActionState<{ temporaryPassword: string }>> {
  return runAction(async () => {
    const context = await requirePermission('users.write')
    const result = await resetUserPassword(idSchema.parse(userId), context)
    revalidateSettings()
    return successState(result, 'Senha redefinida. As sessões da pessoa foram encerradas.')
  })
}

export async function setUserOverrideAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('roles.manage')
    const input = parseInput(userOverrideSchema, formDataToObject(formData))
    await setUserOverride(input, context)
    revalidateSettings()
    return successState(undefined, 'Exceção atualizada.')
  })
}

// ── Perfis ───────────────────────────────────────────────────────────────────

export async function createRoleAction(_previous: unknown, formData: FormData): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const context = await requirePermission('roles.manage')
    const input = parseInput(createRoleSchema, formDataToObject(formData))
    const result = await createRole(input, context)
    revalidateSettings()
    return successState(result, 'Perfil criado.')
  })
}

export async function updateRoleAction(roleId: string, _previous: unknown, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('roles.manage')
    const input = parseInput(roleSchema, formDataToObject(formData))
    await updateRole(idSchema.parse(roleId), input, context)
    revalidateSettings()
    return successState(undefined, 'Perfil atualizado.')
  })
}

export async function setRolePermissionsAction(roleId: string, keys: string[]): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('roles.manage')
    const parsed = z.array(permissionKeySchema).max(200).parse(keys)
    await setRolePermissions(idSchema.parse(roleId), parsed, context)
    revalidateSettings()
    return successState(undefined, 'Permissões do perfil salvas.')
  })
}

export async function deleteRoleAction(roleId: string): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('roles.manage')
    await deleteRole(idSchema.parse(roleId), context)
    revalidateSettings()
    return successState(undefined, 'Perfil excluído.')
  })
}

// ── Catálogos, templates, empresa ────────────────────────────────────────────

export async function createCatalogItemAction(_previous: unknown, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('settings.manage')
    const input = parseInput(catalogItemSchema, formDataToObject(formData))
    await createCatalogItem(input, context)
    revalidateSettings()
    return successState(undefined, 'Item adicionado.')
  })
}

export async function updateCatalogItemAction(
  kind: string,
  id: string,
  patch: { name?: string; isActive?: boolean },
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('settings.manage')
    const safePatch = z
      .object({ name: z.string().trim().min(2).max(80).optional(), isActive: z.boolean().optional() })
      .parse(patch)
    await updateCatalogItem(z.enum(catalogKindValues).parse(kind), idSchema.parse(id), safePatch, context)
    revalidateSettings()
    return successState(undefined, 'Catálogo atualizado.')
  })
}

export async function setTemplateActiveAction(templateId: string, isActive: boolean): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('projects.templates.manage')
    await setTemplateActive(idSchema.parse(templateId), z.boolean().parse(isActive), context)
    revalidateSettings()
    revalidatePath('/projetos')
    return successState(undefined, isActive ? 'Template ativado.' : 'Template desativado.')
  })
}

export async function updateOrganizationAction(_previous: unknown, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('settings.manage')
    const input = parseInput(organizationSchema, formDataToObject(formData))
    await updateOrganization(input, context)
    revalidateSettings()
    return successState(undefined, 'Dados da empresa salvos.')
  })
}

// ── Meu perfil ───────────────────────────────────────────────────────────────

export async function updateProfileAction(_previous: unknown, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireAuth()
    const input = parseInput(profileSchema, formDataToObject(formData))
    await updateOwnProfile(context.user.id, context.user.email, input)
    revalidatePath('/', 'layout')
    return successState(undefined, 'Perfil atualizado.')
  })
}

export async function revokeOtherSessionsAction(): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireAuth()
    const revoked = await revokeOtherSessions(context.user.id, context.sessionId)
    revalidatePath('/perfil')
    return successState(
      undefined,
      revoked === 0 ? 'Não havia outras sessões abertas.' : `${revoked} ${revoked === 1 ? 'sessão encerrada' : 'sessões encerradas'}.`,
    )
  })
}
