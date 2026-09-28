import { z } from 'zod'

import { optionalMoney, optionalSignedMoney } from './money'

/**
 * Schemas de contratos e aditivos.
 *
 * Todo helper de campo opcional termina em `.optional()` — nunca começa com
 * ele. Ver a nota em `clients.ts` sobre por que a ordem importa para o tipo
 * inferido ficar com chave genuinamente opcional (`chave?: T`).
 */

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value : undefined))
    .optional()

const optionalDate = optionalTrimmed(10)

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional()
  .refine((value) => !value || z.uuid().safeParse(value).success, 'Identificador inválido.')

export const paymentMethodValues = [
  'pix',
  'bank_transfer',
  'boleto',
  'credit_card',
  'other',
] as const

export const contractSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título.').max(180),
  scope: optionalTrimmed(8000),
  deliverables: optionalTrimmed(4000),
  responsibilities: optionalTrimmed(4000),
  exclusions: optionalTrimmed(2000),
  totalValue: optionalMoney,
  paymentMethod: z.enum(paymentMethodValues).optional(),
  paymentTerms: optionalTrimmed(2000),
  installments: z.coerce.number().int().min(1).max(60).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  revisionsIncluded: z.coerce.number().int().min(0).max(50).optional(),
  supportDays: z.coerce.number().int().min(0).max(3650).optional(),
  ownerId: optionalUuid,
  notes: optionalTrimmed(4000),
})

export type ContractInput = z.infer<typeof contractSchema>

/** Criação direta (sem oportunidade de origem): o cliente vem do formulário. */
export const createContractSchema = contractSchema.extend({
  clientId: z.uuid('Selecione o cliente.'),
})

export const contractStatusValues = [
  'draft',
  'awaiting_signature',
  'active',
  'suspended',
  'closed',
  'cancelled',
] as const

export const changeContractStatusSchema = z.object({
  contractId: z.uuid(),
  status: z.enum(contractStatusValues),
  cancellationReason: optionalTrimmed(500),
})

export const addendumTypeValues = ['scope', 'value', 'deadline', 'other'] as const

export const addendumSchema = z
  .object({
    contractId: z.uuid(),
    type: z.enum(addendumTypeValues),
    title: z.string().trim().min(2, 'Informe o título.').max(180),
    description: optionalTrimmed(4000),
    valueDelta: optionalSignedMoney,
    newEndDate: optionalDate,
    additionalSupportDays: z.coerce.number().int().min(0).max(3650).optional(),
  })
  // Um aditivo de valor sem valor, ou de prazo sem data, não altera nada —
  // seria só ruído no histórico do contrato.
  .refine((data) => data.type !== 'value' || Boolean(data.valueDelta), {
    message: 'Informe a variação de valor.',
    path: ['valueDelta'],
  })
  .refine((data) => data.type !== 'deadline' || Boolean(data.newEndDate), {
    message: 'Informe o novo término.',
    path: ['newEndDate'],
  })

export type AddendumInput = z.infer<typeof addendumSchema>
