import { z } from 'zod'

/**
 * Schemas de projetos.
 *
 * Helpers opcionais terminam em `.optional()` — ver a nota em `clients.ts`
 * sobre a ordem `.transform().optional()`.
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

const optionalDate = optionalString(10)

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do projeto.').max(180),
    clientId: z.uuid('Selecione o cliente.'),
    contractId: optionalUuid,
    templateId: optionalUuid,
    ownerId: optionalUuid,
    startDate: optionalDate,
    dueDate: optionalDate,
    description: optionalString(4000),
  })
  .refine((data) => !data.startDate || !data.dueDate || data.dueDate >= data.startDate, {
    message: 'O prazo não pode ser anterior ao início.',
    path: ['dueDate'],
  })

export type CreateProjectFormInput = z.infer<typeof createProjectSchema>

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do projeto.').max(180),
    ownerId: optionalUuid,
    startDate: optionalDate,
    dueDate: optionalDate,
    description: optionalString(4000),
  })
  .refine((data) => !data.startDate || !data.dueDate || data.dueDate >= data.startDate, {
    message: 'O prazo não pode ser anterior ao início.',
    path: ['dueDate'],
  })

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const projectStatusValues = [
  'planning',
  'in_progress',
  'waiting_client',
  'blocked',
  'paused',
  'completed',
  'cancelled',
] as const

export const changeProjectStatusSchema = z.object({
  projectId: z.uuid(),
  status: z.enum(projectStatusValues),
  blockedReason: optionalString(1000),
  blockedOwnerId: optionalUuid,
  cancellationReason: optionalString(1000),
})
