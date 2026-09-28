import { z } from 'zod'

/**
 * Schemas de tarefas.
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

const optionalDate = optionalString(10)

const optionalHours = z
  .string()
  .trim()
  .transform((value, context) => {
    if (!value) return undefined
    const parsed = Number(value.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999) {
      context.addIssue({ code: 'custom', message: 'Informe as horas como número, ex.: 2,5.' })
      return z.NEVER
    }
    return parsed.toFixed(2)
  })
  .optional()

export const taskStatusValues = [
  'todo',
  'in_progress',
  'in_review',
  'in_testing',
  'blocked',
  'done',
  'cancelled',
] as const

export const taskPriorityValues = ['low', 'medium', 'high', 'urgent'] as const

export const taskTypeValues = [
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
] as const

const taskFields = {
  title: z.string().trim().min(2, 'Informe o título.').max(200),
  description: optionalString(8000),
  stageId: optionalUuid,
  assigneeId: optionalUuid,
  priority: z.enum(taskPriorityValues).default('medium'),
  type: z.enum(taskTypeValues).default('generic'),
  startDate: optionalDate,
  dueDate: optionalDate,
  estimateHours: optionalHours,
}

const datesInOrder = (data: { startDate?: string; dueDate?: string }) =>
  !data.startDate || !data.dueDate || data.dueDate >= data.startDate

export const createTaskSchema = z
  .object({ projectId: z.uuid('Selecione o projeto.'), ...taskFields })
  .refine(datesInOrder, { message: 'O prazo não pode ser anterior ao início.', path: ['dueDate'] })

export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z
  .object({ ...taskFields, spentHours: optionalHours })
  .refine(datesInOrder, { message: 'O prazo não pode ser anterior ao início.', path: ['dueDate'] })

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

/**
 * Mudança de status. Bloquear exige motivo e responsável pela resolução
 * (regra 5 do produto) — validado aqui e, de novo, no service e no banco.
 */
export const changeTaskStatusSchema = z
  .object({
    taskId: z.uuid(),
    status: z.enum(taskStatusValues),
    blockedReason: optionalString(1000),
    blockedOwnerId: optionalUuid,
  })
  .refine((data) => data.status !== 'blocked' || Boolean(data.blockedReason), {
    message: 'Informe o motivo do bloqueio.',
    path: ['blockedReason'],
  })
  .refine((data) => data.status !== 'blocked' || Boolean(data.blockedOwnerId), {
    message: 'Informe quem vai resolver o bloqueio.',
    path: ['blockedOwnerId'],
  })

export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusSchema>

export const commentSchema = z.object({
  taskId: z.uuid(),
  body: z.string().trim().min(1, 'Escreva o comentário.').max(8000),
})

export const checklistItemSchema = z.object({
  taskId: z.uuid(),
  title: z.string().trim().min(1, 'Descreva o item.').max(200),
})

export const dependencySchema = z.object({
  taskId: z.uuid(),
  dependsOnTaskId: z.uuid('Selecione a tarefa.'),
})

export const devDetailsSchema = z.object({
  taskId: z.uuid(),
  repository: optionalString(200),
  branch: optionalString(120),
  pullRequestUrl: optionalString(300).refine(
    (value) => !value || /^https?:\/\//i.test(value),
    'Use uma URL completa (https://…).',
  ),
  environment: optionalString(40),
  version: optionalString(40),
  release: optionalString(40),
})

export type DevDetailsInput = z.infer<typeof devDetailsSchema>

export const taskListFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(taskStatusValues).optional(),
  priority: z.enum(taskPriorityValues).optional(),
  type: z.enum(taskTypeValues).optional(),
  projectId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  filtro: z.enum(['atrasadas', 'hoje', 'bloqueadas', 'dev']).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

export type TaskListFilter = z.infer<typeof taskListFilterSchema>
