/**
 * Rate limiting.
 *
 * Implementação em memória com janela deslizante. Suficiente e correta para um
 * processo único — que é a topologia da V1. A interface `RateLimiter` existe
 * para que trocar por Redis, quando houver mais de uma instância, não toque em
 * nenhum chamador.
 *
 * **Limite conhecido:** com N instâncias, o limite efetivo vira N × o
 * configurado. Documentado em `docs/architecture.md`, seção 6.
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimiter {
  check: (key: string) => Promise<RateLimitResult>
  reset: (key: string) => Promise<void>
}

export interface RateLimitOptions {
  /** Tentativas permitidas dentro da janela. */
  limit: number
  /** Tamanho da janela em segundos. */
  windowSeconds: number
}

const buckets = new Map<string, number[]>()

/** Impede o Map de crescer indefinidamente com chaves que nunca mais voltam. */
let lastSweep = Date.now()
const SWEEP_INTERVAL_MS = 60_000

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, timestamps] of buckets) {
    const alive = timestamps.filter((time) => now - time < windowMs)
    if (alive.length === 0) buckets.delete(key)
    else buckets.set(key, alive)
  }
}

export function createRateLimiter({ limit, windowSeconds }: RateLimitOptions): RateLimiter {
  const windowMs = windowSeconds * 1000

  return {
    async check(key: string): Promise<RateLimitResult> {
      const now = Date.now()
      sweep(now, windowMs)

      const previous = buckets.get(key) ?? []
      const recent = previous.filter((time) => now - time < windowMs)

      if (recent.length >= limit) {
        const oldest = recent[0] ?? now
        const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
        buckets.set(key, recent)
        return { allowed: false, remaining: 0, retryAfterSeconds }
      }

      recent.push(now)
      buckets.set(key, recent)

      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 }
    },

    async reset(key: string): Promise<void> {
      buckets.delete(key)
    },
  }
}

/**
 * Limites nomeados.
 *
 * O login é limitado por e-mail **e** por IP: só por IP, um escritório inteiro
 * atrás de um NAT se bloqueia junto; só por e-mail, um atacante varre contas
 * livremente trocando o alvo.
 */
export const loginByEmailLimiter = createRateLimiter({ limit: 5, windowSeconds: 15 * 60 })
export const loginByIpLimiter = createRateLimiter({ limit: 20, windowSeconds: 15 * 60 })
export const mutationLimiter = createRateLimiter({ limit: 120, windowSeconds: 60 })
export const searchLimiter = createRateLimiter({ limit: 60, windowSeconds: 60 })
export const uploadLimiter = createRateLimiter({ limit: 30, windowSeconds: 60 })

/** Apenas para testes: zera todo o estado acumulado. */
export function __resetAllRateLimits(): void {
  buckets.clear()
}
