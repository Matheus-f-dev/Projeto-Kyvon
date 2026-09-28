/**
 * Catálogo canônico de permissões.
 *
 * Fonte única para o seed, para a verificação no servidor e para o `can()` da
 * interface. Adicionar uma permissão aqui e rodar o seed é o único passo
 * necessário — não há lista duplicada em outro lugar.
 *
 * Modelo e matriz de perfis em `docs/permissions.md`.
 */

export const PERMISSION_KEYS = [
  // Clientes
  'clients.read',
  'clients.write',
  'clients.delete',
  // Comercial
  'crm.read',
  'crm.write',
  'crm.values.read',
  'crm.convert',
  // Contratos
  'contracts.read',
  'contracts.write',
  'contracts.values.read',
  'contracts.documents.read',
  'contracts.delete',
  // Projetos
  'projects.read',
  'projects.write',
  'projects.delete',
  'projects.templates.manage',
  // Tarefas
  'tasks.read',
  'tasks.write',
  'tasks.assign',
  'tasks.delete',
  // Aprovações
  'approvals.read',
  'approvals.write',
  'approvals.decide',
  // Mudança de escopo
  'scope.read',
  'scope.write',
  'scope.decide',
  // Marketing
  'marketing.read',
  'marketing.write',
  'marketing.publish',
  'cases.read',
  'cases.write',
  // Suporte
  'support.read',
  'support.write',
  'support.assign',
  // Arquivos
  'files.read',
  'files.write',
  'files.delete',
  // Relatórios
  'reports.read',
  'reports.financial.read',
  // Administração
  'users.read',
  'users.write',
  'roles.manage',
  'settings.manage',
  'audit.read',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export interface PermissionDefinition {
  key: PermissionKey
  module: string
  label: string
  description: string
  /** Valores financeiros, documentos contratuais e poder de decisão. */
  isSensitive: boolean
}

export const PERMISSIONS: readonly PermissionDefinition[] = [
  {
    key: 'clients.read',
    module: 'clients',
    label: 'Ver clientes',
    description: 'Acessar clientes, contatos e a timeline de relacionamento.',
    isSensitive: false,
  },
  {
    key: 'clients.write',
    module: 'clients',
    label: 'Editar clientes',
    description: 'Criar e alterar clientes e contatos.',
    isSensitive: false,
  },
  {
    key: 'clients.delete',
    module: 'clients',
    label: 'Arquivar clientes',
    description: 'Arquivar um cliente, removendo-o das listagens ativas.',
    isSensitive: false,
  },

  {
    key: 'crm.read',
    module: 'crm',
    label: 'Ver comercial',
    description: 'Acessar leads, oportunidades, pipeline e propostas.',
    isSensitive: false,
  },
  {
    key: 'crm.write',
    module: 'crm',
    label: 'Editar comercial',
    description: 'Criar e mover oportunidades, leads e propostas.',
    isSensitive: false,
  },
  {
    key: 'crm.values.read',
    module: 'crm',
    label: 'Ver valores comerciais',
    description: 'Ver valores estimados de oportunidades e de propostas.',
    isSensitive: true,
  },
  {
    key: 'crm.convert',
    module: 'crm',
    label: 'Converter em contrato',
    description: 'Transformar uma oportunidade ganha em contrato.',
    isSensitive: true,
  },

  {
    key: 'contracts.read',
    module: 'contracts',
    label: 'Ver contratos',
    description: 'Acessar contratos, sem valores e sem documentos.',
    isSensitive: false,
  },
  {
    key: 'contracts.write',
    module: 'contracts',
    label: 'Editar contratos',
    description: 'Criar e alterar contratos e aditivos.',
    isSensitive: true,
  },
  {
    key: 'contracts.values.read',
    module: 'contracts',
    label: 'Ver valores de contrato',
    description: 'Ver valor, forma de pagamento e condições financeiras.',
    isSensitive: true,
  },
  {
    key: 'contracts.documents.read',
    module: 'contracts',
    label: 'Ver documentos contratuais',
    description: 'Baixar o contrato assinado e anexos jurídicos.',
    isSensitive: true,
  },
  {
    key: 'contracts.delete',
    module: 'contracts',
    label: 'Cancelar contratos',
    description: 'Cancelar um contrato. O registro é preservado no histórico.',
    isSensitive: true,
  },

  {
    key: 'projects.read',
    module: 'projects',
    label: 'Ver projetos',
    description: 'Acessar projetos, etapas e progresso.',
    isSensitive: false,
  },
  {
    key: 'projects.write',
    module: 'projects',
    label: 'Editar projetos',
    description: 'Criar e alterar projetos, etapas e equipe.',
    isSensitive: false,
  },
  {
    key: 'projects.delete',
    module: 'projects',
    label: 'Gerir todos os projetos',
    description: 'Cancelar projetos e editar qualquer projeto, mesmo sem fazer parte da equipe.',
    isSensitive: false,
  },
  {
    key: 'projects.templates.manage',
    module: 'projects',
    label: 'Gerenciar templates',
    description: 'Criar e editar templates de projeto.',
    isSensitive: false,
  },

  {
    key: 'tasks.read',
    module: 'tasks',
    label: 'Ver tarefas',
    description: 'Acessar tarefas dos projetos.',
    isSensitive: false,
  },
  {
    key: 'tasks.write',
    module: 'tasks',
    label: 'Editar tarefas',
    description: 'Criar, comentar e mover tarefas.',
    isSensitive: false,
  },
  {
    key: 'tasks.assign',
    module: 'tasks',
    label: 'Atribuir tarefas',
    description: 'Definir o responsável por uma tarefa.',
    isSensitive: false,
  },
  {
    key: 'tasks.delete',
    module: 'tasks',
    label: 'Gerir todas as tarefas',
    description: 'Excluir tarefas e editar qualquer tarefa, mesmo fora dos projetos em que atua.',
    isSensitive: false,
  },

  {
    key: 'approvals.read',
    module: 'approvals',
    label: 'Ver aprovações',
    description: 'Acessar aprovações e o histórico de versões.',
    isSensitive: false,
  },
  {
    key: 'approvals.write',
    module: 'approvals',
    label: 'Solicitar aprovações',
    description: 'Abrir aprovação e enviar nova versão de material.',
    isSensitive: false,
  },
  {
    key: 'approvals.decide',
    module: 'approvals',
    label: 'Decidir aprovações',
    description: 'Aprovar um material ou solicitar ajustes.',
    isSensitive: true,
  },

  {
    key: 'scope.read',
    module: 'scope',
    label: 'Ver mudanças de escopo',
    description: 'Acessar solicitações de mudança de escopo.',
    isSensitive: false,
  },
  {
    key: 'scope.write',
    module: 'scope',
    label: 'Solicitar mudança de escopo',
    description: 'Registrar uma solicitação e sua análise de impacto.',
    isSensitive: false,
  },
  {
    key: 'scope.decide',
    module: 'scope',
    label: 'Decidir mudança de escopo',
    description: 'Aprovar ou recusar uma mudança de escopo.',
    isSensitive: true,
  },

  {
    key: 'marketing.read',
    module: 'marketing',
    label: 'Ver marketing',
    description: 'Acessar campanhas, conteúdos e calendário editorial.',
    isSensitive: false,
  },
  {
    key: 'marketing.write',
    module: 'marketing',
    label: 'Editar marketing',
    description: 'Criar e alterar campanhas e conteúdos.',
    isSensitive: false,
  },
  {
    key: 'marketing.publish',
    module: 'marketing',
    label: 'Publicar conteúdo',
    description: 'Marcar um conteúdo como publicado e registrar a URL.',
    isSensitive: false,
  },
  {
    key: 'cases.read',
    module: 'marketing',
    label: 'Ver cases',
    description: 'Acessar os cases de portfólio.',
    isSensitive: false,
  },
  {
    key: 'cases.write',
    module: 'marketing',
    label: 'Editar cases',
    description: 'Criar cases e registrar a autorização do cliente.',
    isSensitive: false,
  },

  {
    key: 'support.read',
    module: 'support',
    label: 'Ver chamados',
    description: 'Acessar os chamados de suporte.',
    isSensitive: false,
  },
  {
    key: 'support.write',
    module: 'support',
    label: 'Editar chamados',
    description: 'Abrir, responder e resolver chamados.',
    isSensitive: false,
  },
  {
    key: 'support.assign',
    module: 'support',
    label: 'Atribuir chamados',
    description: 'Definir o responsável por um chamado.',
    isSensitive: false,
  },

  {
    key: 'files.read',
    module: 'files',
    label: 'Ver arquivos',
    description: 'Listar e baixar arquivos das entidades permitidas.',
    isSensitive: false,
  },
  {
    key: 'files.write',
    module: 'files',
    label: 'Enviar arquivos',
    description: 'Fazer upload e vincular arquivos.',
    isSensitive: false,
  },
  {
    key: 'files.delete',
    module: 'files',
    label: 'Excluir arquivos',
    description: 'Remover um arquivo do sistema.',
    isSensitive: false,
  },

  {
    key: 'reports.read',
    module: 'reports',
    label: 'Ver relatórios',
    description: 'Acessar os painéis gerenciais.',
    isSensitive: false,
  },
  {
    key: 'reports.financial.read',
    module: 'reports',
    label: 'Ver relatórios financeiros',
    description: 'Ver indicadores que incluem valores.',
    isSensitive: true,
  },

  {
    key: 'users.read',
    module: 'admin',
    label: 'Ver usuários',
    description: 'Listar os usuários do sistema.',
    isSensitive: false,
  },
  {
    key: 'users.write',
    module: 'admin',
    label: 'Gerenciar usuários',
    description: 'Convidar, editar e suspender usuários.',
    isSensitive: true,
  },
  {
    key: 'roles.manage',
    module: 'admin',
    label: 'Gerenciar perfis',
    description: 'Editar perfis e suas permissões.',
    isSensitive: true,
  },
  {
    key: 'settings.manage',
    module: 'admin',
    label: 'Gerenciar configurações',
    description: 'Editar dados da empresa, catálogos e integrações.',
    isSensitive: true,
  },
  {
    key: 'audit.read',
    module: 'admin',
    label: 'Ver auditoria',
    description: 'Consultar o log de auditoria.',
    isSensitive: true,
  },
]

// ── Perfis ───────────────────────────────────────────────────────────────────

export const ROLE_KEYS = [
  'admin',
  'gestor',
  'comercial',
  'marketing',
  'design',
  'dev',
  'suporte',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

export interface RoleDefinition {
  key: RoleKey
  name: string
  description: string
  permissions: readonly PermissionKey[]
}

const EVERYONE: readonly PermissionKey[] = [
  'clients.read',
  'projects.read',
  'tasks.read',
  'tasks.write',
  'approvals.read',
  'files.read',
  'files.write',
]

export const ROLES: readonly RoleDefinition[] = [
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Acesso total, incluindo configurações, perfis e auditoria.',
    // ADMIN recebe tudo explicitamente — não por um atalho no código.
    // Assim a matriz de permissões continua legível e auditável.
    permissions: PERMISSION_KEYS,
  },
  {
    key: 'gestor',
    name: 'Gestor',
    description: 'Visão completa da operação e poder de decisão, sem administrar o sistema.',
    permissions: [
      ...EVERYONE,
      'clients.write',
      'clients.delete',
      'crm.read',
      'crm.write',
      'crm.values.read',
      'crm.convert',
      'contracts.read',
      'contracts.write',
      'contracts.values.read',
      'contracts.documents.read',
      'contracts.delete',
      'projects.write',
      'projects.delete',
      'projects.templates.manage',
      'tasks.assign',
      'tasks.delete',
      'approvals.write',
      'approvals.decide',
      'scope.read',
      'scope.write',
      'scope.decide',
      'marketing.read',
      'marketing.write',
      'marketing.publish',
      'cases.read',
      'cases.write',
      'support.read',
      'support.write',
      'support.assign',
      'files.delete',
      'reports.read',
      'reports.financial.read',
      'users.read',
      'audit.read',
    ],
  },
  {
    key: 'comercial',
    name: 'Comercial',
    description: 'Conduz o pipeline, propostas e a conversão em contrato.',
    permissions: [
      ...EVERYONE,
      'clients.write',
      'crm.read',
      'crm.write',
      'crm.values.read',
      'crm.convert',
      'contracts.read',
      'contracts.values.read',
      'approvals.write',
      'scope.read',
      'scope.write',
      'cases.read',
      'support.read',
      'reports.read',
    ],
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'Produz o conteúdo e o portfólio da própria Kyvon.',
    permissions: [
      ...EVERYONE,
      'crm.read',
      'tasks.assign',
      'approvals.write',
      'marketing.read',
      'marketing.write',
      'marketing.publish',
      'cases.read',
      'cases.write',
      'reports.read',
    ],
  },
  {
    key: 'design',
    name: 'Design',
    description: 'Executa as etapas de design e envia material para aprovação.',
    permissions: [
      ...EVERYONE,
      'contracts.read',
      'projects.write',
      'tasks.assign',
      'approvals.write',
      'scope.read',
      'scope.write',
      'marketing.read',
      'cases.read',
    ],
  },
  {
    key: 'dev',
    name: 'Desenvolvimento',
    description: 'Executa as etapas técnicas, bugs, QA e deploy.',
    permissions: [
      ...EVERYONE,
      'contracts.read',
      'projects.write',
      'tasks.assign',
      'approvals.write',
      'scope.read',
      'scope.write',
      'support.read',
      'support.write',
    ],
  },
  {
    key: 'suporte',
    name: 'Suporte',
    description: 'Atende os chamados pós-lançamento e encaminha novas demandas.',
    permissions: [
      ...EVERYONE,
      'clients.write',
      'crm.read',
      'contracts.read',
      'tasks.assign',
      'scope.read',
      'scope.write',
      'support.read',
      'support.write',
      'support.assign',
      'reports.read',
    ],
  },
]

// ── Utilitários ──────────────────────────────────────────────────────────────

const permissionByKey = new Map(PERMISSIONS.map((p) => [p.key, p]))

export function getPermission(key: PermissionKey): PermissionDefinition | undefined {
  return permissionByKey.get(key)
}

export function isSensitive(key: PermissionKey): boolean {
  return permissionByKey.get(key)?.isSensitive ?? false
}

/** Agrupa o catálogo por módulo — usado na tela de edição de perfis. */
export function permissionsByModule(): Map<string, PermissionDefinition[]> {
  const grouped = new Map<string, PermissionDefinition[]>()
  for (const permission of PERMISSIONS) {
    const list = grouped.get(permission.module)
    if (list) list.push(permission)
    else grouped.set(permission.module, [permission])
  }
  return grouped
}
