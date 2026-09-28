import { z } from 'zod'

/**
 * Schemas de aprovações.
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

export const approvalStatusValues = [
  'pending',
  'changes_requested',
  'approved',
  'cancelled',
] as const

const approvalFields = {
  title: z.string().trim().min(2, 'Informe o que está sendo aprovado.').max(200),
  description: optionalString(4000),
  taskId: optionalUuid,
  approverUserId: optionalUuid,
  approverContactId: optionalUuid,
  dueDate: optionalDate,
}

/** Precisa haver alguém para decidir: uma pessoa da equipe ou um contato do cliente. */
const hasApprover = (data: { approverUserId?: string; approverContactId?: string }) =>
  Boolean(data.approverUserId || data.approverContactId)

const approverMessage = {
  message: 'Indique quem aprova: alguém da equipe ou um contato do cliente.',
  path: ['approverUserId'],
}

export const createApprovalSchema = z
  .object({
    projectId: z.uuid('Selecione o projeto.'),
    ...approvalFields,
    /** Observações da v1: o que está sendo enviado, onde olhar. */
    notes: optionalString(4000),
  })
  .refine(hasApprover, approverMessage)

export type CreateApprovalInput = z.infer<typeof createApprovalSchema>

export const updateApprovalSchema = z.object(approvalFields).refine(hasApprover, approverMessage)

export type UpdateApprovalInput = z.infer<typeof updateApprovalSchema>

export const decideApprovalSchema = z
  .object({
    approvalId: z.uuid(),
    /** Versão que a pessoa estava vendo — protege contra decidir sobre a versão errada. */
    version: z.coerce.number().int().positive(),
    decision: z.enum(['approved', 'changes_requested']),
    comment: optionalString(4000),
  })
  .refine((data) => data.decision === 'approved' || Boolean(data.comment), {
    message: 'Descreva os ajustes solicitados.',
    path: ['comment'],
  })

export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>

export const newVersionSchema = z.object({
  approvalId: z.uuid(),
  notes: z.string().trim().min(2, 'Descreva o que mudou nesta versão.').max(4000),
})

export type NewVersionInput = z.infer<typeof newVersionSchema>

export const approvalListFilterSchema = z.object({
  q: optionalString(100),
  status: z.enum(approvalStatusValues).optional(),
  /** `abertas` (padrão), `minhas` (aguardando minha decisão), `todas`. */
  filtro: z.enum(['abertas', 'minhas', 'todas']).optional(),
  projectId: optionalUuid,
  page: z.coerce.number().int().positive().optional(),
})

export type ApprovalListFilter = z.infer<typeof approvalListFilterSchema>
