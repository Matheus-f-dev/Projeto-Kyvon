import type { BadgeTone } from '@/components/ui/badge'

/**
 * Vocabulário de domínio para a interface.
 *
 * Fonte única do rótulo e da cor de cada status. Sem isto, "waiting_client"
 * vira "Aguardando cliente" numa tela e "Com o cliente" em outra, e o mesmo
 * status aparece âmbar aqui e cinza ali.
 *
 * A cor segue uma convenção estável em todos os módulos:
 *   cinza   → parado/neutro      azul  → em andamento
 *   âmbar   → depende de terceiro  vermelho → problema/atraso
 *   verde   → concluído com sucesso  roxo → aguardando decisão
 */

export interface StatusMeta {
  label: string
  tone: BadgeTone
  /** Texto curto que explica o que este estado significa na prática. */
  hint?: string
}

function meta<T extends string>(map: Record<T, StatusMeta>) {
  return map
}

// ── Projetos ─────────────────────────────────────────────────────────────────

export const PROJECT_STATUS = meta({
  planning: { label: 'Planejamento', tone: 'neutral', hint: 'Ainda não começou a execução' },
  in_progress: { label: 'Em andamento', tone: 'info', hint: 'Equipe trabalhando' },
  waiting_client: {
    label: 'Aguardando cliente',
    tone: 'warning',
    hint: 'Parado esperando retorno do cliente',
  },
  blocked: {
    label: 'Bloqueado',
    tone: 'danger',
    hint: 'Impedido por algo que precisa ser resolvido',
  },
  paused: { label: 'Pausado', tone: 'neutral', hint: 'Suspenso por decisão interna' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
})

export type ProjectStatus = keyof typeof PROJECT_STATUS

/**
 * Transições de status do projeto.
 *
 * Os status de execução se alternam livremente — a realidade de um projeto
 * vai e volta entre "em andamento" e "aguardando cliente". Concluído pode ser
 * reaberto (ajuste pós-entrega); cancelado é terminal.
 */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planning: ['in_progress', 'waiting_client', 'blocked', 'paused', 'cancelled'],
  in_progress: ['planning', 'waiting_client', 'blocked', 'paused', 'completed', 'cancelled'],
  waiting_client: ['in_progress', 'blocked', 'paused', 'completed', 'cancelled'],
  blocked: ['in_progress', 'waiting_client', 'paused', 'cancelled'],
  paused: ['in_progress', 'waiting_client', 'blocked', 'cancelled'],
  completed: ['in_progress'],
  cancelled: [],
}

/** Status que contam como projeto vivo no dashboard. */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  'planning',
  'in_progress',
  'waiting_client',
  'blocked',
  'paused',
]

export const STAGE_STATUS = meta({
  pending: { label: 'Pendente', tone: 'neutral' },
  in_progress: { label: 'Em andamento', tone: 'info' },
  done: { label: 'Concluída', tone: 'success' },
  skipped: { label: 'Pulada', tone: 'neutral' },
})

// ── Tarefas ──────────────────────────────────────────────────────────────────

export const TASK_STATUS = meta({
  todo: { label: 'A fazer', tone: 'neutral' },
  in_progress: { label: 'Em andamento', tone: 'info' },
  in_review: { label: 'Em revisão', tone: 'accent' },
  in_testing: { label: 'Em testes', tone: 'accent' },
  blocked: { label: 'Bloqueada', tone: 'danger' },
  done: { label: 'Concluída', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
})

export type TaskStatus = keyof typeof TASK_STATUS

/** Ordem das colunas do kanban de tarefas. */
export const TASK_BOARD_COLUMNS: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'in_testing',
  'done',
]

export const OPEN_TASK_STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'in_testing',
  'blocked',
]

export const TASK_PRIORITY = meta({
  low: { label: 'Baixa', tone: 'neutral' },
  medium: { label: 'Média', tone: 'info' },
  high: { label: 'Alta', tone: 'warning' },
  urgent: { label: 'Urgente', tone: 'danger' },
})

export type TaskPriority = keyof typeof TASK_PRIORITY

export const TASK_TYPE = meta({
  generic: { label: 'Geral', tone: 'neutral' },
  discovery: { label: 'Descoberta', tone: 'neutral' },
  design: { label: 'Design', tone: 'accent' },
  content: { label: 'Conteúdo', tone: 'info' },
  development: { label: 'Desenvolvimento', tone: 'brand' },
  bug: { label: 'Bug', tone: 'danger' },
  review: { label: 'Revisão', tone: 'accent' },
  qa: { label: 'QA', tone: 'warning' },
  deploy: { label: 'Deploy', tone: 'success' },
  meeting: { label: 'Reunião', tone: 'neutral' },
})

export type TaskType = keyof typeof TASK_TYPE

/** Tipos que aparecem na visão de desenvolvimento. */
export const DEV_TASK_TYPES: TaskType[] = ['development', 'bug', 'review', 'qa', 'deploy']

// ── Comercial ────────────────────────────────────────────────────────────────

export const OPPORTUNITY_STAGE = meta({
  new_contact: { label: 'Novo contato', tone: 'neutral' },
  qualification: { label: 'Qualificação', tone: 'neutral' },
  discovery: { label: 'Diagnóstico', tone: 'info' },
  proposal_draft: { label: 'Proposta em elaboração', tone: 'info' },
  proposal_sent: { label: 'Proposta enviada', tone: 'accent' },
  negotiation: { label: 'Negociação', tone: 'warning' },
  won: { label: 'Ganha', tone: 'success' },
  lost: { label: 'Perdida', tone: 'danger' },
})

export type OpportunityStage = keyof typeof OPPORTUNITY_STAGE

/** Colunas do pipeline, na ordem. Ganha/perdida ficam fora do quadro. */
export const PIPELINE_STAGES: OpportunityStage[] = [
  'new_contact',
  'qualification',
  'discovery',
  'proposal_draft',
  'proposal_sent',
  'negotiation',
]

export const OPEN_OPPORTUNITY_STAGES = PIPELINE_STAGES

export const LEAD_STATUS = meta({
  new: { label: 'Novo', tone: 'brand' },
  contacted: { label: 'Contatado', tone: 'info' },
  qualified: { label: 'Qualificado', tone: 'accent' },
  converted: { label: 'Convertido', tone: 'success' },
  discarded: { label: 'Descartado', tone: 'neutral' },
})

export const PROPOSAL_STATUS = meta({
  draft: { label: 'Rascunho', tone: 'neutral' },
  sent: { label: 'Enviada', tone: 'info' },
  under_review: { label: 'Em análise', tone: 'accent' },
  accepted: { label: 'Aceita', tone: 'success' },
  rejected: { label: 'Recusada', tone: 'danger' },
  expired: { label: 'Expirada', tone: 'neutral' },
})

export const CLIENT_STATUS = meta({
  lead: { label: 'Lead', tone: 'neutral' },
  prospect: { label: 'Prospect', tone: 'info' },
  active: { label: 'Ativo', tone: 'success' },
  inactive: { label: 'Inativo', tone: 'neutral' },
  archived: { label: 'Arquivado', tone: 'neutral' },
})

// ── Contratos ────────────────────────────────────────────────────────────────

export const CONTRACT_STATUS = meta({
  draft: { label: 'Rascunho', tone: 'neutral' },
  awaiting_signature: { label: 'Aguardando assinatura', tone: 'warning' },
  active: { label: 'Ativo', tone: 'success' },
  suspended: { label: 'Suspenso', tone: 'warning' },
  closed: { label: 'Encerrado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
})

export type ContractStatus = keyof typeof CONTRACT_STATUS

/**
 * Transições permitidas de status de contrato.
 *
 * Encerrado e cancelado são terminais: o registro permanece para sempre
 * (regra 10 do produto), mas não volta a produzir efeito. Retomar um trabalho
 * encerrado é um contrato novo — ou um aditivo, se ainda estiver ativo.
 */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['awaiting_signature', 'active', 'cancelled'],
  awaiting_signature: ['draft', 'active', 'cancelled'],
  active: ['suspended', 'closed', 'cancelled'],
  suspended: ['active', 'closed', 'cancelled'],
  closed: [],
  cancelled: [],
}

/** Rótulo do verbo de cada transição, para o botão que a dispara. */
export const CONTRACT_TRANSITION_LABEL: Record<ContractStatus, string> = {
  draft: 'Voltar para rascunho',
  awaiting_signature: 'Enviar para assinatura',
  active: 'Ativar',
  suspended: 'Suspender',
  closed: 'Encerrar',
  cancelled: 'Cancelar contrato',
}

export const ADDENDUM_TYPE = meta({
  scope: { label: 'Escopo', tone: 'info' },
  value: { label: 'Valor', tone: 'warning' },
  deadline: { label: 'Prazo', tone: 'accent' },
  other: { label: 'Outro', tone: 'neutral' },
})

export const ADDENDUM_STATUS = meta({
  draft: { label: 'Rascunho', tone: 'neutral' },
  awaiting_signature: { label: 'Aguardando assinatura', tone: 'warning' },
  active: { label: 'Ativo', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
})

export const PAYMENT_METHOD = meta({
  pix: { label: 'Pix', tone: 'neutral' },
  bank_transfer: { label: 'Transferência', tone: 'neutral' },
  boleto: { label: 'Boleto', tone: 'neutral' },
  credit_card: { label: 'Cartão de crédito', tone: 'neutral' },
  other: { label: 'Outro', tone: 'neutral' },
})

// ── Aprovações e escopo ──────────────────────────────────────────────────────

export const APPROVAL_STATUS = meta({
  pending: { label: 'Aguardando análise', tone: 'warning' },
  changes_requested: { label: 'Ajustes solicitados', tone: 'accent' },
  approved: { label: 'Aprovado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
})

export type ApprovalStatus = keyof typeof APPROVAL_STATUS

/** Aprovações que ainda exigem ação de alguém. */
export const OPEN_APPROVAL_STATUSES: ApprovalStatus[] = ['pending', 'changes_requested']

export const SCOPE_CHANGE_STATUS = meta({
  requested: { label: 'Solicitada', tone: 'neutral' },
  under_analysis: { label: 'Em análise', tone: 'info' },
  awaiting_approval: { label: 'Aguardando aprovação', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'success' },
  rejected: { label: 'Recusada', tone: 'danger' },
  implemented: { label: 'Implementada', tone: 'success' },
})

export type ScopeChangeStatus = keyof typeof SCOPE_CHANGE_STATUS

/**
 * Caminho de uma mudança de escopo. Aprovar exige análise feita
 * (`awaiting_approval`); recusar vale em qualquer etapa aberta. `rejected` e
 * `implemented` são finais.
 */
export const SCOPE_CHANGE_TRANSITIONS: Record<ScopeChangeStatus, ScopeChangeStatus[]> = {
  requested: ['under_analysis', 'rejected'],
  under_analysis: ['awaiting_approval', 'rejected'],
  awaiting_approval: ['under_analysis', 'approved', 'rejected'],
  approved: ['implemented'],
  rejected: [],
  implemented: [],
}

/** Mudanças que ainda pedem ação de alguém. */
export const OPEN_SCOPE_CHANGE_STATUSES: ScopeChangeStatus[] = [
  'requested',
  'under_analysis',
  'awaiting_approval',
]

export const SCOPE_CHANGE_ORIGIN = meta({
  client: { label: 'Cliente', tone: 'info' },
  internal: { label: 'Interna', tone: 'neutral' },
  technical: { label: 'Técnica', tone: 'accent' },
})

// ── Suporte ──────────────────────────────────────────────────────────────────

export const SUPPORT_STATUS = meta({
  open: { label: 'Aberto', tone: 'brand' },
  in_progress: { label: 'Em atendimento', tone: 'info' },
  waiting_client: { label: 'Aguardando cliente', tone: 'warning' },
  resolved: { label: 'Resolvido', tone: 'success' },
  closed: { label: 'Fechado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
})

export type SupportStatus = keyof typeof SUPPORT_STATUS

export const OPEN_SUPPORT_STATUSES: SupportStatus[] = ['open', 'in_progress', 'waiting_client']

/**
 * Caminho de um chamado. `resolved` pode reabrir (o cliente voltou a reclamar);
 * `closed` e `cancelled` são finais — um problema novo é um chamado novo.
 */
export const SUPPORT_TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  open: ['in_progress', 'waiting_client', 'resolved', 'cancelled'],
  in_progress: ['waiting_client', 'resolved', 'cancelled'],
  waiting_client: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
}

export const SUPPORT_CATEGORY = meta({
  bug: { label: 'Bug', tone: 'danger' },
  question: { label: 'Dúvida', tone: 'info' },
  adjustment: { label: 'Ajuste', tone: 'accent' },
  new_demand: { label: 'Nova demanda', tone: 'brand' },
  request: { label: 'Solicitação', tone: 'neutral' },
})

export const SUPPORT_PRIORITY = meta({
  low: { label: 'Baixa', tone: 'neutral' },
  medium: { label: 'Média', tone: 'info' },
  high: { label: 'Alta', tone: 'warning' },
  critical: { label: 'Crítica', tone: 'danger' },
})

export type SupportPriority = keyof typeof SUPPORT_PRIORITY

/**
 * Prazo de primeira resposta por prioridade, em horas.
 * SLA simples e interno — sem calendário de dias úteis na V1.
 */
export const SUPPORT_SLA_HOURS: Record<SupportPriority, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
}

// ── Marketing ────────────────────────────────────────────────────────────────

export const CONTENT_STATUS = meta({
  idea: { label: 'Ideia', tone: 'neutral' },
  production: { label: 'Produção', tone: 'info' },
  review: { label: 'Revisão', tone: 'accent' },
  approved: { label: 'Aprovado', tone: 'success' },
  scheduled: { label: 'Agendado', tone: 'warning' },
  published: { label: 'Publicado', tone: 'success' },
})

export type ContentStatus = keyof typeof CONTENT_STATUS

export const CONTENT_BOARD_COLUMNS: ContentStatus[] = [
  'idea',
  'production',
  'review',
  'approved',
  'scheduled',
  'published',
]

/**
 * Conteúdo anda para frente e para trás livremente até ser publicado —
 * revisão devolve para produção, agendamento pode ser desfeito. Publicado é
 * final: o que está no ar é histórico.
 */
export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  idea: ['production'],
  production: ['idea', 'review'],
  review: ['production', 'approved'],
  approved: ['review', 'scheduled', 'published'],
  scheduled: ['approved', 'published'],
  published: [],
}

export const CONTENT_FORMAT = meta({
  post: { label: 'Post', tone: 'neutral' },
  carousel: { label: 'Carrossel', tone: 'neutral' },
  reel: { label: 'Reels', tone: 'accent' },
  video: { label: 'Vídeo', tone: 'accent' },
  article: { label: 'Artigo', tone: 'info' },
  newsletter: { label: 'Newsletter', tone: 'info' },
  ad: { label: 'Anúncio', tone: 'warning' },
  landing_page: { label: 'Landing page', tone: 'brand' },
  case_study: { label: 'Case', tone: 'success' },
})

export const CONTENT_CHANNEL = meta({
  instagram: { label: 'Instagram', tone: 'accent' },
  linkedin: { label: 'LinkedIn', tone: 'info' },
  facebook: { label: 'Facebook', tone: 'info' },
  youtube: { label: 'YouTube', tone: 'danger' },
  tiktok: { label: 'TikTok', tone: 'neutral' },
  blog: { label: 'Blog', tone: 'neutral' },
  email: { label: 'E-mail', tone: 'neutral' },
  google_ads: { label: 'Google Ads', tone: 'warning' },
  meta_ads: { label: 'Meta Ads', tone: 'warning' },
  site: { label: 'Site', tone: 'brand' },
})

export const CAMPAIGN_STATUS = meta({
  planned: { label: 'Planejada', tone: 'neutral' },
  active: { label: 'Ativa', tone: 'success' },
  paused: { label: 'Pausada', tone: 'warning' },
  completed: { label: 'Concluída', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
})

export const CASE_STATUS = meta({
  pending_authorization: { label: 'Aguardando autorização', tone: 'warning' },
  authorized: { label: 'Autorizado', tone: 'info' },
  denied: { label: 'Não autorizado', tone: 'danger' },
  in_production: { label: 'Em produção', tone: 'info' },
  review: { label: 'Em revisão', tone: 'accent' },
  published: { label: 'Publicado', tone: 'success' },
})

export type CaseStatus = keyof typeof CASE_STATUS

/**
 * Case só sai de "Aguardando autorização" com a autorização do cliente
 * registrada. "Não autorizado" pode voltar a ser pedido (o cliente mudou de
 * ideia); "Publicado" é final.
 */
export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  pending_authorization: ['authorized', 'denied'],
  denied: ['pending_authorization'],
  authorized: ['in_production'],
  in_production: ['review'],
  review: ['in_production', 'published'],
  published: [],
}

// ── Identidade ───────────────────────────────────────────────────────────────

export const USER_STATUS = meta({
  active: { label: 'Ativo', tone: 'success' },
  invited: { label: 'Convidado', tone: 'warning' },
  suspended: { label: 'Suspenso', tone: 'danger' },
})

// ── Administração ────────────────────────────────────────────────────────────

export const AUDIT_ACTION = meta({
  create: { label: 'Criação', tone: 'success' },
  update: { label: 'Alteração', tone: 'info' },
  delete: { label: 'Exclusão', tone: 'danger' },
  login: { label: 'Login', tone: 'neutral' },
  logout: { label: 'Logout', tone: 'neutral' },
  login_failed: { label: 'Login recusado', tone: 'warning' },
  permission_change: { label: 'Permissão', tone: 'accent' },
  export: { label: 'Exportação', tone: 'neutral' },
})

/** Rótulo das entidades referenciadas por auditoria, atividade e notificação. */
export const ENTITY_TYPE_LABEL: Record<string, string> = {
  user: 'Usuário',
  role: 'Perfil',
  session: 'Sessão',
  client: 'Cliente',
  contact: 'Contato',
  lead: 'Lead',
  opportunity: 'Oportunidade',
  proposal: 'Proposta',
  contract: 'Contrato',
  contract_addendum: 'Aditivo',
  project: 'Projeto',
  project_stage: 'Etapa',
  project_template: 'Template',
  task: 'Tarefa',
  task_comment: 'Comentário',
  approval: 'Aprovação',
  approval_version: 'Versão de aprovação',
  scope_change: 'Mudança de escopo',
  support_ticket: 'Chamado',
  marketing_campaign: 'Campanha',
  marketing_content: 'Conteúdo',
  case: 'Case',
  file: 'Arquivo',
  setting: 'Configuração',
}

/** Rótulo dos módulos do catálogo de permissões (`PERMISSIONS[].module`). */
export const PERMISSION_MODULE_LABEL: Record<string, string> = {
  clients: 'Clientes',
  crm: 'Comercial',
  contracts: 'Contratos',
  projects: 'Projetos',
  tasks: 'Tarefas',
  approvals: 'Aprovações',
  scope: 'Mudança de escopo',
  marketing: 'Marketing',
  support: 'Suporte',
  files: 'Arquivos',
  reports: 'Relatórios',
  admin: 'Administração',
}

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Busca segura no mapa de status.
 * Um valor desconhecido (ex.: enum novo ainda sem rótulo) vira um selo neutro
 * com o valor cru, em vez de quebrar a tela.
 */
export function statusMeta<T extends string>(
  map: Record<T, StatusMeta>,
  value: T | null | undefined,
): StatusMeta {
  if (!value) return { label: '—', tone: 'neutral' }
  return map[value] ?? { label: String(value), tone: 'neutral' }
}
