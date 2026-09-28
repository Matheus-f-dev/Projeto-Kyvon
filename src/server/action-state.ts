import { ZodError, type ZodType } from 'zod'

import { isAppError, toUserMessage, ValidationError } from './errors'

/**
 * Contrato das Server Actions.
 *
 * Toda action devolve o mesmo formato, para que o formulário do outro lado
 * saiba exibir erro de campo, erro geral e sucesso sem inventar convenção
 * própria a cada tela.
 *
 * Erro **nunca** é lançado para o cliente: uma exceção que atravessa a
 * fronteira vira "Server Components render error" em produção, sem mensagem.
 */

export interface ActionState<TData = undefined> {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  data?: TData
}

export const idleState: ActionState = { status: 'idle' }

export function successState<T>(data?: T, message?: string): ActionState<T> {
  return { status: 'success', ...(data !== undefined && { data }), ...(message && { message }) }
}

export function errorState(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionState<never> {
  return { status: 'error', message, ...(fieldErrors && { fieldErrors }) }
}

/** Converte os erros do Zod no formato de erro por campo. */
export function toFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root'
    const existing = fields[path]
    if (existing) existing.push(issue.message)
    else fields[path] = [issue.message]
  }

  return fields
}

/** Valida dados de formulário, lançando `ValidationError` com erros por campo. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)

  if (!result.success) {
    throw new ValidationError('Verifique os dados informados.', toFieldErrors(result.error))
  }

  return result.data
}

/** `FormData` → objeto simples, já sem os campos internos do React. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('$ACTION')) continue

    const current = output[key]
    if (current === undefined) {
      output[key] = value
    } else if (Array.isArray(current)) {
      current.push(value)
    } else {
      output[key] = [current, value]
    }
  }

  return output
}

/**
 * Envolve o corpo de uma action, traduzindo exceções em estado de erro.
 *
 * `redirect()` e `notFound()` do Next funcionam lançando — precisam passar
 * adiante, não virar mensagem de erro na tela.
 */
export async function runAction<T = undefined>(
  fn: () => Promise<ActionState<T>>,
): Promise<ActionState<T>> {
  try {
    return await fn()
  } catch (error) {
    if (isRedirectOrNotFound(error)) throw error

    if (error instanceof ZodError) {
      return errorState('Verifique os dados informados.', toFieldErrors(error))
    }

    if (isAppError(error)) {
      return errorState(error.message, error.fieldErrors)
    }

    console.error('[action] erro não tratado:', error)
    return errorState(toUserMessage(error))
  }
}

function isRedirectOrNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const digest = (error as { digest?: unknown }).digest
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')
  )
}
