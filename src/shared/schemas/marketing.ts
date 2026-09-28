import { z } from 'zod'

import { optionalMoney } from './money'

/**
 * Schemas de marketing: campanhas, conteúdos e cases.
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

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional()
  .refine((value) => !value || z.uuid().safeParse(value).success, 'Identificador inválido.')

const optionalDate = optionalString(10).refine(
  (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
  'Data inválida.',
)

/** URL pública: só http(s) — `javascript:` e afins nunca viram link na tela. */
const publicUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), 'Informe a URL completa, com https://.')

const optionalPublicUrl = z
  .string()
  .trim()
  .max(300)
  .transform((value) => (value ? value : undefined))
  .optional()
  .refine(
    (value) => !value || /^https?:\/\/[^\s]+$/i.test(value),
    'Informe a URL completa, com https://.',
  )

export const contentStatusValues = [
  'idea',
  'production',
  'review',
  'approved',
  'scheduled',
  'published',
] as const
export const contentFormatValues = [
  'post',
  'carousel',
  'reel',
  'video',
  'article',
  'newsletter',
  'ad',
  'landing_page',
  'case_study',
] as const
export const contentChannelValues = [
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
] as const
export const campaignStatusValues = [
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
] as const

// ── Campanhas ────────────────────────────────────────────────────────────────

export const campaignSchema = z
  .object({
    name: z.string().trim().min(2, 'Dê um nome à campanha.').max(160),
    objective: optionalString(4000),
    status: z.enum(campaignStatusValues).default('planned'),
    startDate: optionalDate,
    endDate: optionalDate,
    budget: optionalMoney,
    ownerId: optionalUuid,
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: 'O fim precisa ser depois do início.',
    path: ['endDate'],
  })

export type CampaignInput = z.infer<typeof campaignSchema>

// ── Conteúdos ────────────────────────────────────────────────────────────────

export const contentSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título.').max(200),
  format: z.enum(contentFormatValues),
  channel: z.enum(contentChannelValues),
  campaignId: optionalUuid,
  ownerId: optionalUuid,
  dueDate: optionalDate,
  briefing: optionalString(8000),
  copy: optionalString(20000),
  referencesNotes: optionalString(8000),
})

export type ContentInput = z.infer<typeof contentSchema>

/** `datetime-local` do navegador: "2026-09-30T14:00". Interpretado no fuso do app. */
const localDateTime = z
  .string()
  .trim()
  .refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value), 'Informe data e hora.')

export const moveContentSchema = z
  .object({
    contentId: z.uuid(),
    status: z.enum(contentStatusValues),
    scheduledAt: localDateTime.optional().or(z.literal('').transform(() => undefined)),
    publishedUrl: optionalPublicUrl,
  })
  .refine((data) => data.status !== 'scheduled' || Boolean(data.scheduledAt), {
    message: 'Informe quando o conteúdo vai ao ar.',
    path: ['scheduledAt'],
  })
  .refine((data) => data.status !== 'published' || Boolean(data.publishedUrl), {
    message: 'Informe o link do conteúdo publicado.',
    path: ['publishedUrl'],
  })

export type MoveContentInput = z.infer<typeof moveContentSchema>

export const contentListFilterSchema = z.object({
  q: optionalString(100),
  status: z.enum(contentStatusValues).optional(),
  channel: z.enum(contentChannelValues).optional(),
  campaignId: optionalUuid,
  ownerId: optionalUuid,
})

export type ContentListFilter = z.infer<typeof contentListFilterSchema>

// ── Cases ────────────────────────────────────────────────────────────────────

export const createCaseSchema = z.object({
  projectId: z.uuid('Selecione o projeto.'),
  title: z.string().trim().min(2, 'Informe o título do case.').max(200),
  ownerId: optionalUuid,
})

export type CreateCaseInput = z.infer<typeof createCaseSchema>

export const caseContentSchema = z.object({
  title: z.string().trim().min(2).max(200),
  summary: optionalString(4000),
  challenge: optionalString(8000),
  solution: optionalString(8000),
  results: optionalString(8000),
  ownerId: optionalUuid,
})

export type CaseContentInput = z.infer<typeof caseContentSchema>

/** Registro da resposta do cliente ao pedido de uso do projeto como case. */
export const caseAuthorizationSchema = z
  .object({
    caseId: z.uuid(),
    decision: z.enum(['authorized', 'denied']),
    contactId: optionalUuid,
    notes: optionalString(4000),
  })
  .refine((data) => data.decision === 'denied' || Boolean(data.contactId), {
    message: 'Indique qual contato do cliente autorizou.',
    path: ['contactId'],
  })
  .refine((data) => Boolean(data.notes), {
    message: 'Registre como a resposta foi dada (e-mail, reunião, documento).',
    path: ['notes'],
  })

export type CaseAuthorizationInput = z.infer<typeof caseAuthorizationSchema>

export const publishCaseSchema = z.object({
  caseId: z.uuid(),
  publishedUrl: publicUrl,
})
