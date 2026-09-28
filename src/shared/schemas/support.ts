import { z } from 'zod'

/**
 * Schemas de suporte.
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

export const supportStatusValues = [
  'open',
  'in_progress',
  'waiting_client',
  'resolved',
  'closed',
  'cancelled',
] as const
export const supportCategoryValues = ['bug', 'question', 'adjustment', 'new_demand', 'request'] as const
export const supportPriorityValues = ['low', 'medium', 'high', 'critical'] as const

const ticketFields = {
  title: z.string().trim().min(3, 'Resuma o chamado.').max(200),
  description: z.string().trim().min(5, 'Descreva o que o cliente relatou.').max(8000),
  projectId: optionalUuid,
  requesterContactId: optionalUuid,
  category: z.enum(supportCategoryValues),
  priority: z.enum(supportPriorityValues).default('medium'),
  assigneeId: optionalUuid,
}

export const createTicketSchema = z.object({
  clientId: z.uuid('Selecione o cliente.'),
  ...ticketFields,
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>

export const updateTicketSchema = z.object(ticketFields)

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>

export const changeTicketStatusSchema = z
  .object({
    ticketId: z.uuid(),
    status: z.enum(supportStatusValues),
    resolution: optionalString(8000),
  })
  .refine((data) => data.status !== 'resolved' || Boolean(data.resolution), {
    message: 'Descreva a solução — é o que o próximo atendimento vai ler.',
    path: ['resolution'],
  })
  .refine((data) => data.status !== 'cancelled' || Boolean(data.resolution), {
    message: 'Informe o motivo do cancelamento.',
    path: ['resolution'],
  })

export type ChangeTicketStatusInput = z.infer<typeof changeTicketStatusSchema>

export const ticketCommentSchema = z.object({
  ticketId: z.uuid(),
  body: z.string().trim().min(1, 'Escreva a mensagem.').max(8000),
  /** Resposta dada ao cliente (conta como primeira resposta), e não nota interna. */
  toClient: z
    .string()
    .optional()
    .transform((value) => value === 'on' || value === 'true'),
})

export type TicketCommentInput = z.infer<typeof ticketCommentSchema>

export const ticketListFilterSchema = z.object({
  q: optionalString(100),
  status: z.enum(supportStatusValues).optional(),
  priority: z.enum(supportPriorityValues).optional(),
  category: z.enum(supportCategoryValues).optional(),
  /** `abertos` (padrão), `meus`, `atrasados`, `todos`. */
  filtro: z.enum(['abertos', 'meus', 'atrasados', 'todos']).optional(),
  page: z.coerce.number().int().positive().optional(),
})

export type TicketListFilter = z.infer<typeof ticketListFilterSchema>
