import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Enums de domínio.
 *
 * Só vira enum o que **dirige regra de negócio** (ADR-006). Catálogos editáveis
 * pela Kyvon — tipos de serviço, origens de lead, templates — são tabelas.
 */

// ── Identidade ───────────────────────────────────────────────────────────────
export const userStatusEnum = pgEnum('user_status', ['active', 'invited', 'suspended'])

export const permissionEffectEnum = pgEnum('permission_effect', ['allow', 'deny'])

// ── CRM ──────────────────────────────────────────────────────────────────────
export const clientStatusEnum = pgEnum('client_status', [
  'lead',
  'prospect',
  'active',
  'inactive',
  'archived',
])

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'qualified',
  'converted',
  'discarded',
])

/** As 8 etapas do pipeline comercial, na ordem. */
export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'new_contact',
  'qualification',
  'discovery',
  'proposal_draft',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
])

export const proposalStatusEnum = pgEnum('proposal_status', [
  'draft',
  'sent',
  'under_review',
  'accepted',
  'rejected',
  'expired',
])

// ── Contratos ────────────────────────────────────────────────────────────────
export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'awaiting_signature',
  'active',
  'suspended',
  'closed',
  'cancelled',
])

export const addendumTypeEnum = pgEnum('addendum_type', ['scope', 'value', 'deadline', 'other'])

export const addendumStatusEnum = pgEnum('addendum_status', [
  'draft',
  'awaiting_signature',
  'active',
  'cancelled',
])

export const paymentMethodEnum = pgEnum('payment_method', [
  'pix',
  'bank_transfer',
  'boleto',
  'credit_card',
  'other',
])

// ── Projetos ─────────────────────────────────────────────────────────────────
/** Situação operacional AGORA. Independente da etapa (ADR-004). */
export const projectStatusEnum = pgEnum('project_status', [
  'planning',
  'in_progress',
  'waiting_client',
  'blocked',
  'paused',
  'completed',
  'cancelled',
])

export const stageStatusEnum = pgEnum('stage_status', ['pending', 'in_progress', 'done', 'skipped'])

// ── Tarefas ──────────────────────────────────────────────────────────────────
export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'in_review',
  'in_testing',
  'blocked',
  'done',
  'cancelled',
])

export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent'])

export const taskTypeEnum = pgEnum('task_type', [
  'generic',
  'discovery',
  'design',
  'content',
  'development',
  'bug',
  'review',
  'qa',
  'deploy',
  'meeting',
])

export const taskDependencyTypeEnum = pgEnum('task_dependency_type', ['blocks', 'relates'])

// ── Aprovações ───────────────────────────────────────────────────────────────
export const approvalStatusEnum = pgEnum('approval_status', [
  'pending',
  'changes_requested',
  'approved',
  'cancelled',
])

// ── Mudança de escopo ────────────────────────────────────────────────────────
export const scopeChangeOriginEnum = pgEnum('scope_change_origin', [
  'client',
  'internal',
  'technical',
])

export const scopeChangeStatusEnum = pgEnum('scope_change_status', [
  'requested',
  'under_analysis',
  'awaiting_approval',
  'approved',
  'rejected',
  'implemented',
])

// ── Suporte ──────────────────────────────────────────────────────────────────
export const supportCategoryEnum = pgEnum('support_category', [
  'bug',
  'question',
  'adjustment',
  'new_demand',
  'request',
])

export const supportPriorityEnum = pgEnum('support_priority', ['low', 'medium', 'high', 'critical'])

export const supportStatusEnum = pgEnum('support_status', [
  'open',
  'in_progress',
  'waiting_client',
  'resolved',
  'closed',
  'cancelled',
])

// ── Marketing ────────────────────────────────────────────────────────────────
export const campaignStatusEnum = pgEnum('campaign_status', [
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
])

export const contentStatusEnum = pgEnum('content_status', [
  'idea',
  'production',
  'review',
  'approved',
  'scheduled',
  'published',
])

export const contentFormatEnum = pgEnum('content_format', [
  'post',
  'carousel',
  'reel',
  'video',
  'article',
  'newsletter',
  'ad',
  'landing_page',
  'case_study',
])

export const contentChannelEnum = pgEnum('content_channel', [
  'instagram',
  'linkedin',
  'facebook',
  'youtube',
  'tiktok',
  'blog',
  'email',
  'google_ads',
  'meta_ads',
  'site',
])

export const caseStatusEnum = pgEnum('case_status', [
  'pending_authorization',
  'authorized',
  'denied',
  'in_production',
  'review',
  'published',
])

// ── Plataforma ───────────────────────────────────────────────────────────────

/**
 * Usado apenas nas três tabelas com referência polimórfica — notifications,
 * activities e audit_logs (ADR-007). Nunca como substituto de FK.
 */
export const entityTypeEnum = pgEnum('entity_type', [
  'user',
  'role',
  'session',
  'client',
  'contact',
  'lead',
  'opportunity',
  'proposal',
  'contract',
  'contract_addendum',
  'project',
  'project_stage',
  'project_template',
  'task',
  'task_comment',
  'approval',
  'approval_version',
  'scope_change',
  'support_ticket',
  'marketing_campaign',
  'marketing_content',
  'case',
  'file',
  'setting',
])

export const activityVerbEnum = pgEnum('activity_verb', [
  'created',
  'updated',
  'status_changed',
  'stage_changed',
  'assigned',
  'commented',
  'completed',
  'reopened',
  'blocked',
  'unblocked',
  'approved',
  'changes_requested',
  'converted',
  'uploaded',
  'archived',
  'deleted',
])

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'login_failed',
  'permission_change',
  'export',
])

export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'task_due_soon',
  'task_overdue',
  'task_blocked',
  'task_commented',
  'approval_requested',
  'approval_decided',
  'project_assigned',
  'project_blocked',
  'project_status_changed',
  'contract_expiring',
  'support_period_expiring',
  'support_assigned',
  'scope_change_requested',
  'scope_change_decided',
  'opportunity_assigned',
  'opportunity_next_action',
  'mention',
])
