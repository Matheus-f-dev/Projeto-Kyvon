import { z } from 'zod'

/**
 * Schemas de autenticação, compartilhados entre o formulário e o servidor.
 *
 * O mesmo objeto valida nos dois lados: a validação do cliente é conveniência
 * (feedback imediato), a do servidor é a que vale.
 */

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail.')
    .email('E-mail inválido.')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Informe a senha.'),
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * Regra de senha.
 *
 * Comprimento é o que mais importa — por isso o mínimo é 10, e não 8 com
 * exigência de símbolo. A checagem de repetição barra "aaaaaaaaaa", que passa
 * em qualquer regra de comprimento puro.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use ao menos 10 caracteres.')
  .max(200, 'Senha longa demais.')
  .refine((value) => !/^(.)\1+$/.test(value), 'Escolha uma senha menos previsível.')
  .refine((value) => /[a-zA-Z]/.test(value), 'Inclua ao menos uma letra.')
  .refine((value) => /[0-9!@#$%^&*(),.?":{}|<>_-]/.test(value), 'Inclua um número ou símbolo.')

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['newPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
