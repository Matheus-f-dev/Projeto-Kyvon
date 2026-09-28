import { NextResponse } from 'next/server'

import { isAppError, RateLimitError, type AppErrorCode } from './errors'

/**
 * Respostas HTTP dos Route Handlers.
 *
 * Um único lugar traduz erro de domínio em status — assim nenhuma rota inventa
 * o próprio formato, e stack trace nunca vaza para o cliente.
 */

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init)
}

export function jsonError(error: unknown): NextResponse {
  if (isAppError(error)) {
    const status = STATUS_BY_CODE[error.code]
    const headers: Record<string, string> = {}

    if (error instanceof RateLimitError) {
      headers['Retry-After'] = String(error.retryAfterSeconds)
    }

    return NextResponse.json(
      {
        error: { code: error.code, message: error.message, fields: error.fieldErrors },
      },
      { status, headers },
    )
  }

  // Erro inesperado: registra no servidor, devolve mensagem genérica.
  console.error('[api] erro não tratado:', error)

  return NextResponse.json(
    { error: { code: 'internal', message: 'Erro interno. Tente novamente.' } },
    { status: 500 },
  )
}

/** Envolve um handler para que qualquer erro vire resposta JSON consistente. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args)
    } catch (error) {
      return jsonError(error)
    }
  }
}

/** Identificador do cliente para rate limiting. */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  return request.headers.get('x-real-ip') ?? 'desconhecido'
}
