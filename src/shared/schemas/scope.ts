import { z } from 'zod'

import { optionalSignedMoney } from './money'

/**
 * Schemas de mudança de escopo.
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

export const scopeOriginValues = ['client', 'internal', 'technical'] as const

export const createScopeChangeSchema = z.object({
  projectId: z.uuid('Selecione o projeto.'),
  title: z.string().trim().min(2, 'Resuma a mudança em poucas palavras.').max(200),
  description: z.string().trim().min(5, 'Descreva o que foi pedido.').max(8000),
  origin: z.enum(scopeOriginValues),
})

export type CreateScopeChangeInput = z.infer<typeof createScopeChangeSchema>

const hours = z
  .string()
  .trim()
  .transform((value, context) => {
    if (!value) return undefined
    const parsed = Number(value.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99999) {
      context.addIssue({ code: 'custom', message: 'Informe as horas como número, ex.: 12,5.' })
      return z.NEVER
    }
    return parsed.toFixed(2)
  })
  .optional()

const days = z
  .string()
  .trim()
  .transform((value, context) => {
    if (!value) return undefined
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < -365 || parsed > 365) {
      context.addIssue({ code: 'custom', message: 'Dias inteiros, entre -365 e 365.' })
      return z.NEVER
    }
    return parsed
  })
  .optional()

/**
 * Análise de impacto. Horas e prazo são obrigatórios — "zero" é uma resposta
 * válida, "não sei" não é. O valor é opcional porque quem analisa pode não ter
 * acesso a valores financeiros; nesse caso alguém com acesso completa o campo
 * enquanto a mudança está em análise.
 */
export const scopeAnalysisSchema = z.object({
  impactDescription: z.string().trim().min(5, 'Descreva o impacto.').max(8000),
  estimatedHours: hours.refine((value) => value !== undefined, 'Informe as horas (0 se nenhuma).'),
  deadlineImpactDays: days.refine(
    (value) => value !== undefined,
    'Informe o impacto no prazo (0 se nenhum).',
  ),
  financialImpact: optionalSignedMoney,
})

export type ScopeAnalysisInput = z.infer<typeof scopeAnalysisSchema>

export const decideScopeChangeSchema = z
  .object({
    scopeChangeId: z.uuid(),
    decision: z.enum(['approved', 'rejected']),
    comment: optionalString(4000),
    /** Aplica o impacto de prazo ao prazo do projeto, na mesma operação. */
    applyDeadline: z
      .string()
      .optional()
      .transform((value) => value === 'on' || value === 'true'),
  })
  .refine((data) => data.decision === 'approved' || Boolean(data.comment), {
    message: 'Explique o motivo da recusa.',
    path: ['comment'],
  })

export type DecideScopeChangeInput = z.infer<typeof decideScopeChangeSchema>
