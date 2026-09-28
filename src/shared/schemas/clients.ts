import { z } from 'zod'

/**
 * Schemas de clientes e contatos, compartilhados entre formulário e servidor.
 *
 * Todo helper de campo opcional termina em `.optional()` — nunca começa com
 * ele. `.optional().transform(fn)` deixa a chave *obrigatória* no tipo
 * inferido (com valor `T | undefined`); `.transform(fn).optional()` é o que
 * realmente produz uma chave opcional (`chave?: T`), o que importa sempre que
 * alguém monta um destes objetos à mão — testes, seeds, chamadas diretas ao
 * service — sem passar pelo `parseInput`.
 */

/** String aparada, com pós-processamento opcional (ex.: só dígitos). */
const optionalString = (max: number, postProcess?: (value: string) => string) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => {
      if (!value) return undefined
      return postProcess ? postProcess(value) : value
    })
    .optional()

const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional()
  .refine((value) => !value || z.email().safeParse(value).success, 'E-mail inválido.')

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional()
  .refine((value) => !value || z.uuid().safeParse(value).success, 'Identificador inválido.')

/** Remove tudo que não é dígito — CNPJ/CPF e telefone chegam com máscara do formulário. */
const digitsOnly = (value: string) => value.replace(/\D/g, '')

export const clientStatusValues = ['lead', 'prospect', 'active', 'inactive', 'archived'] as const

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe a razão social.').max(160),
  tradeName: optionalString(160),
  document: optionalString(20, digitsOnly).refine(
    (value) => !value || value.length === 11 || value.length === 14,
    'CNPJ ou CPF inválido.',
  ),
  email: optionalEmail,
  phone: optionalString(40, digitsOnly),
  website: optionalString(200),
  segment: optionalString(80),
  status: z.enum(clientStatusValues).default('prospect'),
  sourceId: optionalUuid,
  ownerId: optionalUuid,
  addressCity: optionalString(80),
  addressState: optionalString(2),
  notes: optionalString(4000),
})

export type ClientInput = z.infer<typeof clientSchema>

export const contactSchema = z.object({
  clientId: z.uuid(),
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  jobTitle: optionalString(80),
  email: optionalEmail,
  phone: optionalString(40, digitsOnly),
  isPrimary: z.coerce.boolean().default(false),
  canApprove: z.coerce.boolean().default(false),
  notes: optionalString(2000),
})

export type ContactInput = z.infer<typeof contactSchema>

export const clientListFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(clientStatusValues).optional(),
  ownerId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
})

export type ClientListFilter = z.infer<typeof clientListFilterSchema>
