/**
 * Erros de domínio.
 *
 * O objetivo é separar o que é falha esperada de negócio — e que precisa virar
 * mensagem legível na tela — do que é defeito, que precisa virar log e alerta.
 * Só as classes daqui devem atravessar a fronteira até a interface.
 */

export type AppErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'unprocessable'

export class AppError extends Error {
  readonly code: AppErrorCode
  /** Detalhes por campo, no formato aceito pelos formulários. */
  readonly fieldErrors?: Record<string, string[]>

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string[]>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    if (fieldErrors) this.fieldErrors = fieldErrors
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'É necessário entrar para continuar.') {
    super('unauthorized', message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para esta ação.') {
    super('forbidden', message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Registro') {
    super('not_found', `${entity} não encontrado.`)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Verifique os dados informados.', fieldErrors?: Record<string, string[]>) {
    super('validation', message, fieldErrors)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message)
    this.name = 'ConflictError'
  }
}

/** Regra de negócio violada — a requisição é válida, mas o estado não permite. */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super('unprocessable', message)
    this.name = 'BusinessRuleError'
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number

  constructor(
    retryAfterSeconds: number,
    message = 'Muitas tentativas. Tente novamente em instantes.',
  ) {
    super('rate_limited', message)
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Mensagem segura para exibir ao usuário.
 * Erros inesperados nunca vazam stack trace nem detalhe interno.
 */
export function toUserMessage(error: unknown): string {
  if (isAppError(error)) return error.message
  return 'Algo deu errado. Tente novamente — se persistir, avise o time.'
}
