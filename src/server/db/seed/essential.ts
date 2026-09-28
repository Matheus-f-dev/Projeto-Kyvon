import { eq, notInArray, sql } from 'drizzle-orm'

import { hashPassword } from '@/server/auth/password'
import { PERMISSION_KEYS, PERMISSIONS, ROLES, type PermissionKey } from '@/shared/permissions'
import type { Database } from '../client'
import { CODE_ENTITIES } from '../codes'
import {
  codeSequences,
  leadSources,
  organization,
  permissions,
  projectTemplateChecklistItems,
  projectTemplateStages,
  projectTemplateTaskDependencies,
  projectTemplateTasks,
  projectTemplates,
  rolePermissions,
  roles,
  serviceTypes,
  users,
} from '../schema'
import { PROJECT_TEMPLATES } from './templates'

/**
 * Seed essencial — o mínimo para o sistema funcionar.
 *
 * Roda em **qualquer** ambiente, produção incluída, e é idempotente: aplicar
 * duas vezes produz o mesmo estado. Nada aqui é dado fictício; dados de
 * demonstração vivem em `demo.ts` e são bloqueados em produção.
 */

export interface SeedResult {
  adminEmail: string
  adminPassword: string | null
  createdAdmin: boolean
}

const LEAD_SOURCES = [
  { key: 'indicacao', name: 'Indicação', position: 1 },
  { key: 'site', name: 'Site', position: 2 },
  { key: 'instagram', name: 'Instagram', position: 3 },
  { key: 'linkedin', name: 'LinkedIn', position: 4 },
  { key: 'google', name: 'Busca no Google', position: 5 },
  { key: 'evento', name: 'Evento', position: 6 },
  { key: 'prospeccao', name: 'Prospecção ativa', position: 7 },
  { key: 'cliente-existente', name: 'Cliente existente', position: 8 },
  { key: 'outro', name: 'Outro', position: 9 },
]

const SERVICE_TYPES = [
  {
    key: 'website',
    name: 'Website institucional',
    description: 'Site de presença digital com foco em credibilidade e captação.',
    position: 1,
  },
  {
    key: 'landing-page',
    name: 'Landing page',
    description: 'Página única de conversão para campanha.',
    position: 2,
  },
  {
    key: 'ecommerce',
    name: 'E-commerce',
    description: 'Loja virtual com catálogo, pagamento e frete.',
    position: 3,
  },
  {
    key: 'aplicacao-web',
    name: 'Aplicação web',
    description: 'Sistema sob medida com regra de negócio própria.',
    position: 4,
  },
  {
    key: 'automacao',
    name: 'Automação',
    description: 'Integração entre ferramentas e automação de processo.',
    position: 5,
  },
  {
    key: 'identidade-visual',
    name: 'Identidade visual',
    description: 'Marca, aplicações e manual de uso.',
    position: 6,
  },
  {
    key: 'manutencao',
    name: 'Manutenção e suporte',
    description: 'Evolução contínua de um produto já no ar.',
    position: 7,
  },
]

export async function seedEssential(db: Database): Promise<SeedResult> {
  await seedRolesAndPermissions(db)
  await seedCatalogs(db)
  await seedProjectTemplates(db)
  await seedOrganization(db)
  await seedCodeSequences(db)
  return seedAdminUser(db)
}

// ── Perfis e permissões ──────────────────────────────────────────────────────

async function seedRolesAndPermissions(db: Database) {
  // Quais permissões já existiam antes desta execução — as novas recebem a
  // concessão padrão; as antigas respeitam o que foi configurado na tela.
  const before = new Set(
    (await db.select({ key: permissions.key }).from(permissions)).map(
      (row) => row.key as PermissionKey,
    ),
  )
  const existingRoles = new Set(
    (await db.select({ key: roles.key }).from(roles)).map((row) => row.key),
  )

  await db
    .insert(permissions)
    .values(
      PERMISSIONS.map((permission) => ({
        key: permission.key,
        module: permission.module,
        label: permission.label,
        description: permission.description,
        isSensitive: permission.isSensitive,
      })),
    )
    .onConflictDoUpdate({
      target: permissions.key,
      set: {
        module: sql`excluded.module`,
        label: sql`excluded.label`,
        description: sql`excluded.description`,
        isSensitive: sql`excluded.is_sensitive`,
      },
    })

  // Permissões removidas do catálogo somem também do banco — evita conceder
  // por engano algo que a aplicação nem verifica mais.
  const validKeys = PERMISSIONS.map((permission) => permission.key)
  await db.delete(permissions).where(notInArray(permissions.key, validKeys))

  // Perfis de sistema: criados se faltarem. Nome e descrição editados na tela
  // não são sobrescritos.
  await db
    .insert(roles)
    .values(
      ROLES.map((role) => ({
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
      })),
    )
    .onConflictDoNothing({ target: roles.key })

  const permissionRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
  const permissionIdByKey = new Map(permissionRows.map((row) => [row.key as PermissionKey, row.id]))

  const roleRows = await db.select({ id: roles.id, key: roles.key }).from(roles)
  const roleIdByKey = new Map(roleRows.map((row) => [row.key, row.id]))

  /**
   * A matriz padrão (`ROLES`) é aplicada:
   *  - por inteiro, a um perfil que acabou de ser criado;
   *  - só para as permissões novas desta versão, nos perfis que já existiam.
   * O que foi ajustado em Configurações → Perfis nunca é desfeito por um
   * deploy. A exceção é o Administrador, que sempre tem tudo: sem isso, uma
   * permissão nova ficaria inacessível para quem administra o sistema.
   */
  for (const role of ROLES) {
    const roleId = roleIdByKey.get(role.key)
    if (!roleId) continue

    const keys =
      role.key === 'admin'
        ? PERMISSION_KEYS
        : existingRoles.has(role.key)
          ? role.permissions.filter((key) => !before.has(key))
          : role.permissions

    const ids = keys
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id))

    if (ids.length > 0) {
      await db
        .insert(rolePermissions)
        .values(ids.map((permissionId) => ({ roleId, permissionId })))
        .onConflictDoNothing()
    }
  }
}

// ── Catálogos ────────────────────────────────────────────────────────────────

async function seedCatalogs(db: Database) {
  // Catálogos são editáveis em Configurações: o seed só cria o que falta.
  await db.insert(leadSources).values(LEAD_SOURCES).onConflictDoNothing({ target: leadSources.key })
  await db
    .insert(serviceTypes)
    .values(SERVICE_TYPES)
    .onConflictDoNothing({ target: serviceTypes.key })
}

// ── Templates de projeto ─────────────────────────────────────────────────────

async function seedProjectTemplates(db: Database) {
  const serviceTypeRows = await db
    .select({ id: serviceTypes.id, key: serviceTypes.key })
    .from(serviceTypes)
  const serviceTypeIdByKey = new Map(serviceTypeRows.map((row) => [row.key, row.id]))

  const roleRows = await db.select({ id: roles.id, key: roles.key }).from(roles)
  const roleIdByKey = new Map(roleRows.map((row) => [row.key, row.id]))

  for (const template of PROJECT_TEMPLATES) {
    const [templateRow] = await db
      .insert(projectTemplates)
      .values({
        key: template.key,
        name: template.name,
        description: template.description,
        serviceTypeId: serviceTypeIdByKey.get(template.serviceTypeKey) ?? null,
      })
      .onConflictDoUpdate({
        target: projectTemplates.key,
        set: { name: sql`excluded.name`, description: sql`excluded.description` },
      })
      .returning({ id: projectTemplates.id })

    if (!templateRow) continue

    // Etapas e tarefas são recriadas por inteiro: o template de fábrica é
    // definido em código, e reconciliar item a item seria mais frágil do que
    // regravar. Templates criados pela Kyvon têm outra `key` e não são tocados.
    await db
      .delete(projectTemplateStages)
      .where(eq(projectTemplateStages.templateId, templateRow.id))

    const taskIdByTitle = new Map<string, string>()

    for (const [stageIndex, stage] of template.stages.entries()) {
      const [stageRow] = await db
        .insert(projectTemplateStages)
        .values({
          templateId: templateRow.id,
          name: stage.name,
          description: stage.description ?? null,
          position: stageIndex,
        })
        .returning({ id: projectTemplateStages.id })

      if (!stageRow) continue

      for (const [taskIndex, task] of stage.tasks.entries()) {
        const [taskRow] = await db
          .insert(projectTemplateTasks)
          .values({
            templateStageId: stageRow.id,
            title: task.title,
            description: task.description ?? null,
            type: task.type,
            priority: task.priority ?? 'medium',
            estimateHours: task.estimateHours?.toFixed(2) ?? null,
            defaultRoleId: task.defaultRole ? (roleIdByKey.get(task.defaultRole) ?? null) : null,
            dueOffsetDays: task.dueOffsetDays ?? null,
            position: taskIndex,
          })
          .returning({ id: projectTemplateTasks.id })

        if (!taskRow) continue
        taskIdByTitle.set(task.title, taskRow.id)

        if (task.checklist?.length) {
          await db.insert(projectTemplateChecklistItems).values(
            task.checklist.map((title, index) => ({
              templateTaskId: taskRow.id,
              title,
              position: index,
            })),
          )
        }
      }
    }

    // Dependências só depois que todas as tarefas existem.
    const dependencyRows: { taskId: string; dependsOnTaskId: string }[] = []
    for (const stage of template.stages) {
      for (const task of stage.tasks) {
        if (!task.dependsOn?.length) continue
        const taskId = taskIdByTitle.get(task.title)
        if (!taskId) continue

        for (const dependencyTitle of task.dependsOn) {
          const dependsOnTaskId = taskIdByTitle.get(dependencyTitle)
          if (!dependsOnTaskId || dependsOnTaskId === taskId) continue
          dependencyRows.push({ taskId, dependsOnTaskId })
        }
      }
    }

    if (dependencyRows.length > 0) {
      await db.insert(projectTemplateTaskDependencies).values(dependencyRows).onConflictDoNothing()
    }
  }
}

// ── Organização e contadores ─────────────────────────────────────────────────

async function seedOrganization(db: Database) {
  await db
    .insert(organization)
    .values({ id: 1, name: 'Kyvon', legalName: 'Kyvon', timezone: 'America/Sao_Paulo' })
    .onConflictDoNothing()
}

async function seedCodeSequences(db: Database) {
  const rows = Object.entries(CODE_ENTITIES).map(([entity, config]) => ({
    entity,
    prefix: config.prefix,
    padding: config.padding,
    currentValue: 0,
  }))

  // `DoNothing` de propósito: o contador nunca pode ser zerado por um reseed,
  // senão dois registros diferentes receberiam o mesmo código.
  await db.insert(codeSequences).values(rows).onConflictDoNothing()
}

// ── Usuário administrador ────────────────────────────────────────────────────

async function seedAdminUser(db: Database): Promise<SeedResult> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@kyvon.com.br').trim().toLowerCase()

  const existing = await db.select({ id: users.id }).from(users).limit(1)
  if (existing.length > 0) {
    return { adminEmail: email, adminPassword: null, createdAdmin: false }
  }

  const [adminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, 'admin'))
    .limit(1)

  if (!adminRole) throw new Error('Perfil admin não encontrado — o seed de perfis falhou.')

  const password = process.env.SEED_ADMIN_PASSWORD?.trim() || generatePassword()

  await db.insert(users).values({
    name: process.env.SEED_ADMIN_NAME?.trim() || 'Administrador',
    email,
    passwordHash: await hashPassword(password),
    roleId: adminRole.id,
    status: 'active',
    jobTitle: 'Administrador do sistema',
  })

  return { adminEmail: email, adminPassword: password, createdAdmin: true }
}

/**
 * Senha inicial aleatória, mostrada uma única vez no terminal.
 * Melhor do que uma senha padrão documentada, que sobrevive até a produção.
 */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

/** Utilitário de teste: garante que os perfis existem sem recriar templates. */
export async function seedRolesOnly(db: Database): Promise<void> {
  await seedRolesAndPermissions(db)
  await seedCatalogs(db)
  await seedCodeSequences(db)
  await seedOrganization(db)
}

/** Ids dos perfis por chave — usado pelo seed de demonstração e por testes. */
export async function getRoleIds(db: Database): Promise<Map<string, string>> {
  const rows = await db.select({ id: roles.id, key: roles.key }).from(roles)
  return new Map(rows.map((row) => [row.key, row.id]))
}

export async function getServiceTypeIds(db: Database): Promise<Map<string, string>> {
  const rows = await db.select({ id: serviceTypes.id, key: serviceTypes.key }).from(serviceTypes)
  return new Map(rows.map((row) => [row.key, row.id]))
}

export async function getLeadSourceIds(db: Database): Promise<Map<string, string>> {
  const rows = await db.select({ id: leadSources.id, key: leadSources.key }).from(leadSources)
  return new Map(rows.map((row) => [row.key, row.id]))
}

export async function getPermissionIds(db: Database): Promise<Map<PermissionKey, string>> {
  const rows = await db.select({ id: permissions.id, key: permissions.key }).from(permissions)
  return new Map(rows.map((row) => [row.key as PermissionKey, row.id]))
}

export async function permissionKeysForRole(
  db: Database,
  roleKey: string,
): Promise<PermissionKey[]> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, roleKey))
    .limit(1)
  if (!role) return []

  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, role.id))

  return rows.map((row) => row.key as PermissionKey)
}
