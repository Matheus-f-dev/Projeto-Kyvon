import { z } from 'zod'

import { optionalMoney } from './money'

/**
 * Schemas do comercial: leads, oportunidades e propostas.
 *
 * Todo helper de campo opcional termina em `.optional()` — nunca começa com
 * ele. Ver a nota em `clients.ts` sobre por que a ordem importa para o tipo
 * inferido ficar com chave genuinamente opcional (`chave?: T`).
 */

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value : undefined))
    .optional()

const digitsOnly = (value: string) => value.replace(/\D/g, '')

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional()
  .refine((value) => !value || z.uuid().safeParse(value).success, 'Identificador inválido.')

const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional()
  .refine((value) => !value || z.email().safeParse(value).success, 'E-mail inválido.')

const optionalDate = optionalString(10)

// ── Leads ────────────────────────────────────────────────────────────────────

export const leadStatusValues = ['new', 'contacted', 'qualified', 'converted', 'discarded'] as const

export const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  companyName: optionalString(160),
  email: optionalEmail,
  phone: z
    .string()
    .trim()
    .transform((value) => (value ? digitsOnly(value) : undefined))
    .optional(),
  sourceId: optionalUuid,
  serviceTypeId: optionalUuid,
  message: optionalString(4000),
  notes: optionalString(4000),
  ownerId: optionalUuid,
})

export type LeadInput = z.infer<typeof leadSchema>

export const discardLeadSchema = z.object({
  leadId: z.uuid(),
  reason: z.string().trim().min(3, 'Informe o motivo do descarte.').max(500),
})

export const convertLeadSchema = z.object({
  leadId: z.uuid(),
  opportunityTitle: z.string().trim().min(2, 'Informe o título da oportunidade.').max(180),
  estimatedValue: optionalMoney,
  serviceTypeId: optionalUuid,
  ownerId: optionalUuid,
})

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>

// ── Oportunidades ────────────────────────────────────────────────────────────

export const opportunityStageValues = [
  'new_contact',
  'qualification',
  'discovery',
  'proposal_draft',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
] as const

export const opportunitySchema = z.object({
  title: z.string().trim().min(2, 'Informe o título.').max(180),
  clientId: z.uuid('Selecione o cliente.'),
  contactId: optionalUuid,
  serviceTypeId: optionalUuid,
  sourceId: optionalUuid,
  ownerId: optionalUuid,
  estimatedValue: optionalMoney,
  probability: z.coerce.number().int().min(0).max(100).optional(),
  nextAction: optionalString(200),
  nextActionAt: optionalDate,
  expectedCloseAt: optionalDate,
  description: optionalString(4000),
  notes: optionalString(4000),
})

export type OpportunityInput = z.infer<typeof opportunitySchema>

export const moveOpportunitySchema = z.object({
  opportunityId: z.uuid(),
  stage: z.enum(opportunityStageValues),
  position: z.coerce.number().int().min(0).optional(),
})

export const markLostSchema = z.object({
  opportunityId: z.uuid(),
  reason: z.string().trim().min(3, 'Informe o motivo da perda.').max(500),
})

// ── Propostas ────────────────────────────────────────────────────────────────

export const proposalStatusValues = [
  'draft',
  'sent',
  'under_review',
  'accepted',
  'rejected',
  'expired',
] as const

export const proposalSchema = z.object({
  opportunityId: z.uuid(),
  title: z.string().trim().min(2, 'Informe o título.').max(180),
  scope: optionalString(8000),
  deliverables: optionalString(4000),
  totalValue: optionalMoney,
  paymentTerms: optionalString(2000),
  estimatedDurationDays: z.coerce.number().int().min(1).max(3650).optional(),
  validUntil: optionalDate,
  notes: optionalString(2000),
})

export type ProposalInput = z.infer<typeof proposalSchema>

export const rejectProposalSchema = z.object({
  proposalId: z.uuid(),
  reason: z.string().trim().min(3, 'Informe o motivo da recusa.').max(500),
})
