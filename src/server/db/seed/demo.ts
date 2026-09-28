import { eq, inArray } from 'drizzle-orm'

import { hashPassword } from '@/server/auth/password'
import { createProject, recalculateProgress } from '@/server/modules/projects/service'
import { addDaysISO, todayISO } from '@/shared/dates'
import type { Database } from '../client'
import { nextCode } from '../codes'
import {
  approvalVersions,
  approvals,
  clients,
  contacts,
  contracts,
  leads,
  marketingCampaigns,
  marketingContents,
  opportunities,
  projectStages,
  projectTemplates,
  projects,
  proposals,
  scopeChanges,
  supportTickets,
  tasks,
  users,
} from '../schema'
import { getLeadSourceIds, getRoleIds, getServiceTypeIds } from './essential'

/**
 * Dados de demonstração.
 *
 * Retrato plausível de uma agência em operação: projetos em estágios
 * diferentes, coisas atrasadas, um bloqueio, aprovações em versões distintas.
 * Um seed onde está tudo em dia não permite avaliar a tela que mais importa —
 * a que mostra o que deu errado.
 *
 * Todas as datas são relativas a hoje, para o painel continuar fazendo sentido
 * independentemente de quando o seed rodar.
 *
 * **Nunca roda em produção** — `scripts/seed.ts` e o validador de ambiente
 * bloqueiam antes de chegar aqui.
 */

const DEMO_MARKER_DOCUMENT = '11222333000181'

export async function seedDemo(db: Database): Promise<string> {
  const existing = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.document, DEMO_MARKER_DOCUMENT))
    .limit(1)

  if (existing.length > 0) return 'já aplicado (nada a fazer)'

  const today = todayISO()
  const roleIds = await getRoleIds(db)
  const serviceTypeIds = await getServiceTypeIds(db)
  const sourceIds = await getLeadSourceIds(db)

  const team = await seedTeam(db, roleIds)
  const admin = await resolveAdmin(db)

  const createdClients = await seedClients(db, team, sourceIds)
  await seedLeads(db, team, sourceIds, serviceTypeIds)

  const pipeline = await seedOpportunities(db, createdClients, team, serviceTypeIds, sourceIds)
  const signedContracts = await seedContracts(db, createdClients, pipeline, serviceTypeIds, team)

  const builtProjects = await seedProjects(db, createdClients, signedContracts, team, admin)

  await seedApprovals(db, builtProjects, createdClients, team)
  await seedScopeChange(db, builtProjects, signedContracts, team)
  await seedSupport(db, createdClients, builtProjects, signedContracts, team)
  await seedMarketing(db, team)

  return [
    `${team.length} usuários`,
    `${createdClients.length} clientes`,
    `${pipeline.length} oportunidades`,
    `${signedContracts.length} contratos`,
    `${builtProjects.length} projetos`,
    `data base ${today}`,
  ].join(' · ')
}

// ── Equipe ───────────────────────────────────────────────────────────────────

interface DemoUser {
  id: string
  name: string
  email: string
  roleKey: string
}

const TEAM = [
  {
    name: 'Carla Menezes',
    email: 'carla@kyvon.com.br',
    role: 'gestor',
    title: 'Head de Operações',
  },
  {
    name: 'Rafael Prado',
    email: 'rafael@kyvon.com.br',
    role: 'comercial',
    title: 'Executivo comercial',
  },
  { name: 'Júlia Tavares', email: 'julia@kyvon.com.br', role: 'design', title: 'Product Designer' },
  { name: 'Diego Nakamura', email: 'diego@kyvon.com.br', role: 'dev', title: 'Tech Lead' },
  {
    name: 'Bianca Rocha',
    email: 'bianca@kyvon.com.br',
    role: 'marketing',
    title: 'Analista de marketing',
  },
  {
    name: 'Thiago Lemos',
    email: 'thiago@kyvon.com.br',
    role: 'suporte',
    title: 'Analista de suporte',
  },
]

/** Senha comum a todos os usuários de demonstração. Só existe fora de produção. */
const DEMO_PASSWORD = 'Demo@Kyvon2026'

async function seedTeam(db: Database, roleIds: Map<string, string>): Promise<DemoUser[]> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  const rows = TEAM.map((person) => ({
    id: crypto.randomUUID(),
    name: person.name,
    email: person.email,
    passwordHash,
    jobTitle: person.title,
    roleId: roleIds.get(person.role) ?? roleIds.get('gestor') ?? '',
    status: 'active' as const,
  })).filter((row) => row.roleId !== '')

  await db.insert(users).values(rows).onConflictDoNothing()

  const stored = await db
    .select({ id: users.id, name: users.name, email: users.email, roleId: users.roleId })
    .from(users)
    .where(
      inArray(
        users.email,
        TEAM.map((person) => person.email),
      ),
    )

  const roleKeyById = new Map([...roleIds].map(([key, id]) => [id, key]))

  return stored.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: roleKeyById.get(user.roleId) ?? 'gestor',
  }))
}

function pick(team: DemoUser[], roleKey: string): DemoUser {
  const found = team.find((member) => member.roleKey === roleKey)
  const fallback = team[0]
  if (!found && !fallback) throw new Error('Equipe de demonstração vazia.')
  return found ?? (fallback as DemoUser)
}

async function resolveAdmin(db: Database): Promise<{ id: string; email: string }> {
  const [admin] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .orderBy(users.createdAt)
    .limit(1)

  if (!admin) throw new Error('Nenhum usuário encontrado — rode o seed essencial antes.')
  return admin
}

// ── Clientes ─────────────────────────────────────────────────────────────────

interface DemoClient {
  id: string
  name: string
  key: string
  primaryContactId: string
}

const CLIENTS = [
  {
    key: 'aurora',
    name: 'Aurora Clínica Integrada LTDA',
    tradeName: 'Aurora Clínica',
    document: DEMO_MARKER_DOCUMENT,
    segment: 'Saúde',
    city: 'Belo Horizonte',
    state: 'MG',
    status: 'active' as const,
    source: 'indicacao',
    owner: 'comercial',
    contact: {
      name: 'Patrícia Lemos',
      jobTitle: 'Diretora',
      email: 'patricia@auroraclinica.com.br',
    },
  },
  {
    key: 'nordeste',
    name: 'Nordeste Alimentos S/A',
    tradeName: 'NA Alimentos',
    document: '44555666000122',
    segment: 'Indústria alimentícia',
    city: 'Recife',
    state: 'PE',
    status: 'active' as const,
    source: 'linkedin',
    owner: 'comercial',
    contact: {
      name: 'Eduardo Farias',
      jobTitle: 'Gerente de Marketing',
      email: 'eduardo@naalimentos.com.br',
    },
  },
  {
    key: 'vertice',
    name: 'Vértice Consultoria Empresarial',
    tradeName: 'Vértice',
    document: '77888999000133',
    segment: 'Consultoria',
    city: 'São Paulo',
    state: 'SP',
    status: 'active' as const,
    source: 'site',
    owner: 'gestor',
    contact: {
      name: 'Marina Duarte',
      jobTitle: 'Sócia',
      email: 'marina@verticeconsultoria.com.br',
    },
  },
  {
    key: 'petiko',
    name: 'Petiko Comércio de Produtos Pet',
    tradeName: 'Petiko',
    document: '22333444000155',
    segment: 'Varejo pet',
    city: 'Curitiba',
    state: 'PR',
    status: 'active' as const,
    source: 'instagram',
    owner: 'comercial',
    contact: { name: 'Bruno Antunes', jobTitle: 'Fundador', email: 'bruno@petiko.com.br' },
  },
  {
    key: 'lumen',
    name: 'Lumen Arquitetura e Interiores',
    tradeName: 'Lumen',
    document: '55666777000144',
    segment: 'Arquitetura',
    city: 'Florianópolis',
    state: 'SC',
    status: 'prospect' as const,
    source: 'indicacao',
    owner: 'comercial',
    contact: {
      name: 'Helena Corrêa',
      jobTitle: 'Arquiteta responsável',
      email: 'helena@lumenarq.com.br',
    },
  },
  {
    key: 'tecnoagro',
    name: 'TecnoAgro Soluções Agrícolas',
    tradeName: 'TecnoAgro',
    document: '99000111000166',
    segment: 'Agronegócio',
    city: 'Ribeirão Preto',
    state: 'SP',
    status: 'prospect' as const,
    source: 'evento',
    owner: 'gestor',
    contact: {
      name: 'Sérgio Kimura',
      jobTitle: 'Diretor comercial',
      email: 'sergio@tecnoagro.com.br',
    },
  },
]

async function seedClients(
  db: Database,
  team: DemoUser[],
  sourceIds: Map<string, string>,
): Promise<DemoClient[]> {
  const result: DemoClient[] = []

  for (const entry of CLIENTS) {
    const code = await nextCode('client', db)
    const owner = pick(team, entry.owner)

    const [client] = await db
      .insert(clients)
      .values({
        code,
        name: entry.name,
        tradeName: entry.tradeName,
        document: entry.document,
        email: entry.contact.email,
        phone: '11987654321',
        website: `https://www.${entry.key}.com.br`,
        segment: entry.segment,
        status: entry.status,
        sourceId: sourceIds.get(entry.source) ?? null,
        ownerId: owner.id,
        addressCity: entry.city,
        addressState: entry.state,
        lastContactAt: new Date(),
      })
      .returning({ id: clients.id, name: clients.name })

    if (!client) continue

    const [contact] = await db
      .insert(contacts)
      .values({
        clientId: client.id,
        name: entry.contact.name,
        jobTitle: entry.contact.jobTitle,
        email: entry.contact.email,
        phone: '11987654321',
        isPrimary: true,
        canApprove: true,
      })
      .returning({ id: contacts.id })

    if (!contact) continue

    result.push({
      id: client.id,
      name: client.name,
      key: entry.key,
      primaryContactId: contact.id,
    })
  }

  return result
}

function findClient(list: DemoClient[], key: string): DemoClient {
  const found = list.find((client) => client.key === key)
  if (!found) throw new Error(`Cliente de demonstração "${key}" não encontrado.`)
  return found
}

// ── Leads ────────────────────────────────────────────────────────────────────

async function seedLeads(
  db: Database,
  team: DemoUser[],
  sourceIds: Map<string, string>,
  serviceTypeIds: Map<string, string>,
) {
  const comercial = pick(team, 'comercial')

  const entries = [
    {
      name: 'Fernanda Quintela',
      companyName: 'Quintela Advocacia',
      email: 'fernanda@quintelaadv.com.br',
      source: 'site',
      service: 'website',
      status: 'new' as const,
      message: 'Precisamos reformular o site do escritório. O atual tem 7 anos.',
    },
    {
      name: 'Marcos Vinícius Alves',
      companyName: 'MV Transportes',
      email: 'marcos@mvtransportes.com.br',
      source: 'google',
      service: 'aplicacao-web',
      status: 'contacted' as const,
      message: 'Queremos um sistema para acompanhar as entregas em tempo real.',
    },
    {
      name: 'Renata Bittencourt',
      companyName: 'Bittencourt Joias',
      email: 'renata@bittencourtjoias.com.br',
      source: 'instagram',
      service: 'ecommerce',
      status: 'qualified' as const,
      message: 'Loja física querendo vender online. Cerca de 300 produtos.',
    },
  ]

  for (const entry of entries) {
    const code = await nextCode('lead', db)

    await db.insert(leads).values({
      code,
      name: entry.name,
      companyName: entry.companyName,
      email: entry.email,
      phone: '11912345678',
      sourceId: sourceIds.get(entry.source) ?? null,
      serviceTypeId: serviceTypeIds.get(entry.service) ?? null,
      message: entry.message,
      status: entry.status,
      ownerId: comercial.id,
    })
  }
}

// ── Oportunidades e propostas ────────────────────────────────────────────────

interface DemoOpportunity {
  id: string
  key: string
  clientId: string
  title: string
  value: string
}

async function seedOpportunities(
  db: Database,
  clientList: DemoClient[],
  team: DemoUser[],
  serviceTypeIds: Map<string, string>,
  sourceIds: Map<string, string>,
): Promise<DemoOpportunity[]> {
  const comercial = pick(team, 'comercial')
  const gestor = pick(team, 'gestor')
  const today = todayISO()

  const entries = [
    {
      key: 'aurora-site',
      client: 'aurora',
      title: 'Novo site institucional Aurora',
      service: 'website',
      stage: 'won' as const,
      value: '48000.00',
      owner: comercial,
      wonDaysAgo: 52,
    },
    {
      key: 'petiko-loja',
      client: 'petiko',
      title: 'E-commerce Petiko',
      service: 'ecommerce',
      stage: 'won' as const,
      value: '96000.00',
      owner: comercial,
      wonDaysAgo: 30,
    },
    {
      key: 'nordeste-lp',
      client: 'nordeste',
      title: 'Landing page campanha Safra 2026',
      service: 'landing-page',
      stage: 'won' as const,
      value: '18500.00',
      owner: comercial,
      wonDaysAgo: 74,
    },
    {
      key: 'vertice-portal',
      client: 'vertice',
      title: 'Portal do cliente Vértice',
      service: 'aplicacao-web',
      stage: 'negotiation' as const,
      value: '124000.00',
      owner: gestor,
      nextAction: 'Reunião de fechamento com o time jurídico',
      nextActionIn: 2,
    },
    {
      key: 'lumen-site',
      client: 'lumen',
      title: 'Site portfólio Lumen Arquitetura',
      service: 'website',
      stage: 'proposal_sent' as const,
      value: '36000.00',
      owner: comercial,
      nextAction: 'Follow-up da proposta enviada',
      nextActionIn: -3,
    },
    {
      key: 'tecnoagro-auto',
      client: 'tecnoagro',
      title: 'Automação de propostas comerciais',
      service: 'automacao',
      stage: 'discovery' as const,
      value: '62000.00',
      owner: gestor,
      nextAction: 'Mapear o processo atual com o time de vendas',
      nextActionIn: 5,
    },
    {
      key: 'nordeste-institucional',
      client: 'nordeste',
      title: 'Reformulação do site institucional',
      service: 'website',
      stage: 'qualification' as const,
      value: '54000.00',
      owner: comercial,
      nextAction: 'Entender orçamento disponível',
      nextActionIn: 8,
    },
    {
      key: 'vertice-marca',
      client: 'vertice',
      title: 'Identidade visual Vértice',
      service: 'identidade-visual',
      stage: 'lost' as const,
      value: '28000.00',
      owner: comercial,
      lostReason: 'Optaram por um estúdio especializado em branding.',
    },
  ]

  const result: DemoOpportunity[] = []

  for (const entry of entries) {
    const client = findClient(clientList, entry.client)
    const code = await nextCode('opportunity', db)

    const [opportunity] = await db
      .insert(opportunities)
      .values({
        code,
        title: entry.title,
        clientId: client.id,
        contactId: client.primaryContactId,
        serviceTypeId: serviceTypeIds.get(entry.service) ?? null,
        sourceId: sourceIds.get('indicacao') ?? null,
        stage: entry.stage,
        estimatedValue: entry.value,
        probability: entry.stage === 'negotiation' ? 70 : entry.stage === 'proposal_sent' ? 50 : 25,
        ownerId: entry.owner.id,
        nextAction: 'nextAction' in entry ? entry.nextAction : null,
        nextActionAt:
          'nextActionIn' in entry && entry.nextActionIn !== undefined
            ? addDaysISO(today, entry.nextActionIn)
            : null,
        expectedCloseAt: addDaysISO(today, 30),
        wonAt:
          entry.stage === 'won' && 'wonDaysAgo' in entry
            ? new Date(Date.now() - (entry.wonDaysAgo ?? 0) * 86_400_000)
            : null,
        lostAt: entry.stage === 'lost' ? new Date(Date.now() - 20 * 86_400_000) : null,
        lostReason: 'lostReason' in entry ? entry.lostReason : null,
      })
      .returning({ id: opportunities.id })

    if (!opportunity) continue

    result.push({
      id: opportunity.id,
      key: entry.key,
      clientId: client.id,
      title: entry.title,
      value: entry.value,
    })

    // Proposta para quem já passou da etapa de elaboração.
    if (['proposal_sent', 'negotiation', 'won'].includes(entry.stage)) {
      const proposalCode = await nextCode('proposal', db)

      await db.insert(proposals).values({
        code: proposalCode,
        opportunityId: opportunity.id,
        version: 1,
        title: `Proposta — ${entry.title}`,
        scope: 'Escopo detalhado conforme reunião de diagnóstico e briefing aprovado.',
        totalValue: entry.value,
        paymentTerms: '40% na assinatura, 30% na aprovação do design, 30% na entrega.',
        estimatedDurationDays: 60,
        validUntil: addDaysISO(today, 15),
        status: entry.stage === 'won' ? 'accepted' : 'sent',
        sentAt: new Date(Date.now() - 12 * 86_400_000),
        respondedAt: entry.stage === 'won' ? new Date(Date.now() - 8 * 86_400_000) : null,
        createdBy: entry.owner.id,
      })
    }
  }

  return result
}

// ── Contratos ────────────────────────────────────────────────────────────────

interface DemoContract {
  id: string
  key: string
  clientId: string
  title: string
}

async function seedContracts(
  db: Database,
  clientList: DemoClient[],
  pipeline: DemoOpportunity[],
  serviceTypeIds: Map<string, string>,
  team: DemoUser[],
): Promise<DemoContract[]> {
  const gestor = pick(team, 'gestor')
  const today = todayISO()

  const entries = [
    {
      key: 'aurora',
      opportunityKey: 'aurora-site',
      client: 'aurora',
      title: 'Website institucional — Aurora Clínica',
      service: 'website',
      value: '48000.00',
      status: 'active' as const,
      startOffset: -50,
      endOffset: 22,
      supportDays: 90,
      revisions: 3,
    },
    {
      key: 'petiko',
      opportunityKey: 'petiko-loja',
      client: 'petiko',
      title: 'E-commerce — Petiko',
      service: 'ecommerce',
      value: '96000.00',
      status: 'active' as const,
      startOffset: -28,
      endOffset: 75,
      supportDays: 180,
      revisions: 4,
    },
    {
      key: 'nordeste',
      opportunityKey: 'nordeste-lp',
      client: 'nordeste',
      title: 'Landing page Safra 2026 — Nordeste Alimentos',
      service: 'landing-page',
      value: '18500.00',
      status: 'active' as const,
      startOffset: -72,
      endOffset: 18,
      supportDays: 60,
      revisions: 2,
    },
  ]

  const result: DemoContract[] = []

  for (const entry of entries) {
    const client = findClient(clientList, entry.client)
    const opportunity = pipeline.find((item) => item.key === entry.opportunityKey)
    const code = await nextCode('contract', db)

    const [contract] = await db
      .insert(contracts)
      .values({
        code,
        title: entry.title,
        clientId: client.id,
        opportunityId: opportunity?.id ?? null,
        serviceTypeId: serviceTypeIds.get(entry.service) ?? null,
        status: entry.status,
        scope:
          'Escopo fechado conforme proposta aceita. Alterações fora deste escopo seguem o fluxo de mudança de escopo.',
        deliverables: 'Design aprovado, implementação responsiva, publicação e treinamento.',
        responsibilities:
          'A Kyvon executa. O cliente fornece conteúdo, acessos e retorno de aprovação em até 5 dias úteis.',
        totalValue: entry.value,
        paymentMethod: 'pix',
        paymentTerms: '40% na assinatura, 30% na aprovação do design, 30% na entrega.',
        installments: 3,
        startDate: addDaysISO(today, entry.startOffset),
        endDate: addDaysISO(today, entry.endOffset),
        signedAt: new Date(Date.now() + entry.startOffset * 86_400_000),
        revisionsIncluded: entry.revisions,
        supportDays: entry.supportDays,
        ownerId: gestor.id,
      })
      .returning({ id: contracts.id, title: contracts.title })

    if (!contract) continue

    result.push({ id: contract.id, key: entry.key, clientId: client.id, title: contract.title })
  }

  return result
}

// ── Projetos ─────────────────────────────────────────────────────────────────

interface DemoProject {
  id: string
  key: string
  clientId: string
  name: string
}

async function seedProjects(
  db: Database,
  clientList: DemoClient[],
  contractList: DemoContract[],
  team: DemoUser[],
  admin: { id: string; email: string },
): Promise<DemoProject[]> {
  const today = todayISO()
  const gestor = pick(team, 'gestor')
  const designer = pick(team, 'design')
  const dev = pick(team, 'dev')
  const marketing = pick(team, 'marketing')

  const templates = await db
    .select({ id: projectTemplates.id, key: projectTemplates.key })
    .from(projectTemplates)

  const templateIdByKey = new Map(templates.map((row) => [row.key, row.id]))

  const entries = [
    {
      key: 'aurora',
      contract: 'aurora',
      client: 'aurora',
      name: 'Website institucional Aurora Clínica',
      template: 'website-institucional',
      owner: gestor,
      members: [designer, dev, marketing],
      startOffset: -50,
      dueOffset: 12,
      /** Avanço: quantas tarefas ficam concluídas, em ordem. */
      completed: 12,
      status: 'in_progress' as const,
    },
    {
      key: 'petiko',
      contract: 'petiko',
      client: 'petiko',
      name: 'E-commerce Petiko',
      template: 'ecommerce',
      owner: gestor,
      members: [designer, dev],
      startOffset: -28,
      dueOffset: 70,
      completed: 3,
      status: 'waiting_client' as const,
    },
    {
      key: 'nordeste',
      contract: 'nordeste',
      client: 'nordeste',
      name: 'Landing page Safra 2026',
      template: 'landing-page',
      owner: marketing,
      members: [designer, dev],
      startOffset: -72,
      dueOffset: -6,
      completed: 7,
      status: 'blocked' as const,
    },
  ]

  const result: DemoProject[] = []

  for (const entry of entries) {
    const client = findClient(clientList, entry.client)
    const contract = contractList.find((item) => item.key === entry.contract)

    const created = await createProject(
      {
        name: entry.name,
        clientId: client.id,
        contractId: contract?.id ?? null,
        templateId: templateIdByKey.get(entry.template) ?? null,
        ownerId: entry.owner.id,
        startDate: addDaysISO(today, entry.startOffset),
        dueDate: addDaysISO(today, entry.dueOffset),
        memberIds: entry.members.map((member) => member.id),
      },
      admin,
    )

    await advanceProject(db, created.id, entry.completed, entry.status, team)

    result.push({ id: created.id, key: entry.key, clientId: client.id, name: entry.name })
  }

  return result
}

/**
 * Faz o projeto parecer em andamento: conclui as primeiras tarefas, distribui
 * responsáveis, deixa uma atrasada e — quando for o caso — registra o bloqueio.
 */
async function advanceProject(
  db: Database,
  projectId: string,
  completedCount: number,
  status: 'in_progress' | 'waiting_client' | 'blocked',
  team: DemoUser[],
) {
  const today = todayISO()
  const projectTasks = await db
    .select({ id: tasks.id, stageId: tasks.stageId, type: tasks.type })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.position)

  const assignable = [
    pick(team, 'design'),
    pick(team, 'dev'),
    pick(team, 'marketing'),
    pick(team, 'gestor'),
  ]

  for (const [index, task] of projectTasks.entries()) {
    const assignee = assignable[index % assignable.length]
    const done = index < completedCount
    const isNext = index === completedCount

    await db
      .update(tasks)
      .set({
        assigneeId: assignee?.id ?? null,
        status: done ? 'done' : isNext ? 'in_progress' : 'todo',
        completedAt: done ? new Date(Date.now() - (completedCount - index) * 86_400_000) : null,
        // Uma tarefa vencida por projeto: é o que valida a tela de atrasos.
        dueDate: isNext ? addDaysISO(today, -2) : undefined,
      })
      .where(eq(tasks.id, task.id))
  }

  // Etapas cujas tarefas terminaram viram concluídas; a da vez fica em andamento.
  const stages = await db
    .select({ id: projectStages.id })
    .from(projectStages)
    .where(eq(projectStages.projectId, projectId))
    .orderBy(projectStages.position)

  const completedStageIds = new Set(
    projectTasks.slice(0, completedCount).map((task) => task.stageId),
  )
  const currentStageId = projectTasks[completedCount]?.stageId ?? stages[0]?.id ?? null

  for (const stage of stages) {
    const isDone = completedStageIds.has(stage.id) && stage.id !== currentStageId
    await db
      .update(projectStages)
      .set({
        status: isDone ? 'done' : stage.id === currentStageId ? 'in_progress' : 'pending',
        completedAt: isDone ? new Date() : null,
        startedAt: isDone || stage.id === currentStageId ? new Date() : null,
      })
      .where(eq(projectStages.id, stage.id))
  }

  const blocked = status === 'blocked'

  await db
    .update(projects)
    .set({
      status,
      currentStageId,
      blockedReason: blocked
        ? 'Cliente não liberou o acesso ao servidor de hospedagem para o deploy.'
        : null,
      blockedSince: blocked ? new Date(Date.now() - 4 * 86_400_000) : null,
      blockedOwnerId: blocked ? pick(team, 'gestor').id : null,
    })
    .where(eq(projects.id, projectId))

  await recalculateProgress(projectId, db)
}

// ── Aprovações ───────────────────────────────────────────────────────────────

async function seedApprovals(
  db: Database,
  projectList: DemoProject[],
  clientList: DemoClient[],
  team: DemoUser[],
) {
  const designer = pick(team, 'design')
  const gestor = pick(team, 'gestor')
  const today = todayISO()

  const aurora = projectList.find((project) => project.key === 'aurora')
  const petiko = projectList.find((project) => project.key === 'petiko')
  if (!aurora || !petiko) return

  // Aurora: v1 recebeu ajustes, v2 foi aprovada — o histórico das duas fica.
  const auroraCode = await nextCode('approval', db)
  const [auroraApproval] = await db
    .insert(approvals)
    .values({
      code: auroraCode,
      title: 'Design das páginas internas',
      description: 'Telas de Serviços, Equipe e Contato em desktop e mobile.',
      projectId: aurora.id,
      clientId: aurora.clientId,
      status: 'approved',
      currentVersion: 2,
      requestedBy: designer.id,
      approverUserId: gestor.id,
      approverContactId: findClient(clientList, 'aurora').primaryContactId,
      dueDate: addDaysISO(today, -10),
      decidedAt: new Date(Date.now() - 6 * 86_400_000),
    })
    .returning({ id: approvals.id })

  if (auroraApproval) {
    await db.insert(approvalVersions).values([
      {
        approvalId: auroraApproval.id,
        version: 1,
        notes: 'Primeira rodada das telas internas.',
        status: 'changes_requested',
        submittedBy: designer.id,
        submittedAt: new Date(Date.now() - 14 * 86_400_000),
        decisionComment:
          'Ajustar a hierarquia da página de Serviços e aumentar o contraste dos botões.',
        decidedBy: gestor.id,
        decidedAt: new Date(Date.now() - 12 * 86_400_000),
      },
      {
        approvalId: auroraApproval.id,
        version: 2,
        notes: 'Hierarquia revista e contraste corrigido conforme retorno.',
        status: 'approved',
        submittedBy: designer.id,
        submittedAt: new Date(Date.now() - 8 * 86_400_000),
        decisionComment: 'Aprovado. Pode seguir para desenvolvimento.',
        decidedBy: gestor.id,
        decidedAt: new Date(Date.now() - 6 * 86_400_000),
      },
    ])
  }

  // Petiko: aguardando análise e já fora do prazo — aparece em "precisa de atenção".
  const petikoCode = await nextCode('approval', db)
  const [petikoApproval] = await db
    .insert(approvals)
    .values({
      code: petikoCode,
      title: 'Arquitetura da loja e fluxo de checkout',
      description: 'Categorias, filtros e as quatro telas do checkout.',
      projectId: petiko.id,
      clientId: petiko.clientId,
      status: 'pending',
      currentVersion: 1,
      requestedBy: designer.id,
      approverUserId: gestor.id,
      approverContactId: findClient(clientList, 'petiko').primaryContactId,
      dueDate: addDaysISO(today, -3),
    })
    .returning({ id: approvals.id })

  if (petikoApproval) {
    await db.insert(approvalVersions).values({
      approvalId: petikoApproval.id,
      version: 1,
      notes: 'Proposta inicial de arquitetura.',
      status: 'pending',
      submittedBy: designer.id,
      submittedAt: new Date(Date.now() - 7 * 86_400_000),
    })
  }
}

// ── Mudança de escopo ────────────────────────────────────────────────────────

async function seedScopeChange(
  db: Database,
  projectList: DemoProject[],
  contractList: DemoContract[],
  team: DemoUser[],
) {
  const petiko = projectList.find((project) => project.key === 'petiko')
  const contract = contractList.find((item) => item.key === 'petiko')
  if (!petiko) return

  const code = await nextCode('scope_change', db)

  await db.insert(scopeChanges).values({
    code,
    title: 'Integração com marketplace',
    description:
      'O cliente pediu sincronização de catálogo e estoque com o Mercado Livre, item não previsto no contrato.',
    projectId: petiko.id,
    contractId: contract?.id ?? null,
    origin: 'client',
    status: 'awaiting_approval',
    impactDescription:
      'Exige um conector novo, mapeamento de categorias e rotina de sincronização de estoque a cada 15 minutos.',
    estimatedHours: '64.00',
    deadlineImpactDays: 14,
    financialImpact: '19200.00',
    requestedBy: pick(team, 'gestor').id,
    analyzedBy: pick(team, 'dev').id,
  })
}

// ── Suporte ──────────────────────────────────────────────────────────────────

async function seedSupport(
  db: Database,
  clientList: DemoClient[],
  projectList: DemoProject[],
  contractList: DemoContract[],
  team: DemoUser[],
) {
  const suporte = pick(team, 'suporte')
  const dev = pick(team, 'dev')

  const nordeste = projectList.find((project) => project.key === 'nordeste')
  const aurora = projectList.find((project) => project.key === 'aurora')

  const entries = [
    {
      client: 'nordeste',
      project: nordeste,
      contract: contractList.find((item) => item.key === 'nordeste'),
      title: 'Formulário da landing não envia no Safari',
      description:
        'No Safari do iPhone o botão de enviar não responde. No Chrome funciona normalmente.',
      category: 'bug' as const,
      priority: 'high' as const,
      status: 'in_progress' as const,
      assignee: dev,
      dueInHours: -6,
    },
    {
      client: 'aurora',
      project: aurora,
      contract: contractList.find((item) => item.key === 'aurora'),
      title: 'Como alterar o texto da página inicial?',
      description: 'A equipe da clínica quer atualizar a chamada principal sem depender da Kyvon.',
      category: 'question' as const,
      priority: 'low' as const,
      status: 'resolved' as const,
      assignee: suporte,
      dueInHours: 60,
    },
    {
      client: 'aurora',
      project: aurora,
      contract: contractList.find((item) => item.key === 'aurora'),
      title: 'Incluir agendamento online no site',
      description:
        'A clínica quer integrar o sistema de agendamento que já usa internamente ao site.',
      category: 'new_demand' as const,
      priority: 'medium' as const,
      status: 'open' as const,
      assignee: suporte,
      dueInHours: 20,
    },
  ]

  for (const entry of entries) {
    const client = findClient(clientList, entry.client)
    const code = await nextCode('support_ticket', db)

    await db.insert(supportTickets).values({
      code,
      title: entry.title,
      description: entry.description,
      clientId: client.id,
      projectId: entry.project?.id ?? null,
      contractId: entry.contract?.id ?? null,
      requesterContactId: client.primaryContactId,
      category: entry.category,
      priority: entry.priority,
      status: entry.status,
      assigneeId: entry.assignee.id,
      dueAt: new Date(Date.now() + entry.dueInHours * 3_600_000),
      firstResponseAt: entry.status === 'open' ? null : new Date(Date.now() - 3_600_000),
      resolvedAt: entry.status === 'resolved' ? new Date(Date.now() - 7_200_000) : null,
      resolution:
        entry.status === 'resolved'
          ? 'Enviado tutorial em vídeo e concedido acesso de editor ao CMS.'
          : null,
    })
  }
}

// ── Marketing ────────────────────────────────────────────────────────────────

async function seedMarketing(db: Database, team: DemoUser[]) {
  const marketing = pick(team, 'marketing')
  const today = todayISO()

  const [campaign] = await db
    .insert(marketingCampaigns)
    .values({
      name: 'Autoridade em produto digital — 1º semestre',
      objective:
        'Posicionar a Kyvon como referência em produto digital para empresas de médio porte.',
      status: 'active',
      startDate: addDaysISO(today, -60),
      endDate: addDaysISO(today, 120),
      budget: '15000.00',
      ownerId: marketing.id,
    })
    .returning({ id: marketingCampaigns.id })

  const entries = [
    {
      title: 'Como escolher entre site institucional e landing page',
      format: 'article' as const,
      channel: 'blog' as const,
      status: 'published' as const,
      dueOffset: -20,
      publishedOffset: -18,
    },
    {
      title: 'Bastidores: o processo de descoberta da Kyvon',
      format: 'carousel' as const,
      channel: 'instagram' as const,
      status: 'scheduled' as const,
      dueOffset: 1,
    },
    {
      title: '5 sinais de que seu e-commerce precisa de manutenção',
      format: 'post' as const,
      channel: 'linkedin' as const,
      status: 'review' as const,
      dueOffset: 3,
    },
    {
      title: 'Case Aurora Clínica — do briefing ao lançamento',
      format: 'case_study' as const,
      channel: 'site' as const,
      status: 'production' as const,
      dueOffset: 10,
    },
    {
      title: 'Newsletter de março: o que entregamos',
      format: 'newsletter' as const,
      channel: 'email' as const,
      status: 'idea' as const,
      dueOffset: 18,
    },
  ]

  for (const entry of entries) {
    const code = await nextCode('marketing_content', db)

    await db.insert(marketingContents).values({
      code,
      title: entry.title,
      format: entry.format,
      channel: entry.channel,
      status: entry.status,
      campaignId: campaign?.id ?? null,
      ownerId: marketing.id,
      dueDate: addDaysISO(today, entry.dueOffset),
      scheduledAt: entry.status === 'scheduled' ? new Date(Date.now() + 86_400_000) : null,
      publishedAt:
        entry.publishedOffset !== undefined
          ? new Date(Date.now() + entry.publishedOffset * 86_400_000)
          : null,
      publishedUrl:
        entry.status === 'published' ? 'https://kyvon.com.br/blog/site-ou-landing' : null,
      briefing: 'Tom didático, foco em decisão de negócio, sem jargão técnico.',
    })
  }
}
