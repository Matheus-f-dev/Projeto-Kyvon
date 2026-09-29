import { z } from 'zod'

/**
 * Validação de ambiente no boot.
 *
 * A aplicação recusa subir com configuração inválida em vez de falhar em runtime
 * no meio de uma requisição. Regras mais duras valem só em produção — em
 * desenvolvimento os defaults precisam funcionar sem nenhum arquivo `.env`.
 */

/** Trata string vazia como ausente: `FOO=` no .env não deve virar `''`. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : undefined
  })

const requiredString = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim()
      return trimmed && trimmed.length > 0 ? trimmed : fallback
    })

const booleanFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim().toLowerCase()
      if (!trimmed) return fallback
      return trimmed === 'true' || trimmed === '1' || trimmed === 'yes'
    })

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: optionalString,
  /**
   * Conexão usada só pelas migrations. No Supabase, a aplicação usa o pooler em
   * modo transação (porta 6543) e as migrations precisam da conexão direta ou do
   * pooler em modo sessão (porta 5432). Vazia → usa `DATABASE_URL`.
   */
  DATABASE_MIGRATION_URL: optionalString,
  PGLITE_DATA_DIR: requiredString('.data/pglite'),

  AUTH_SECRET: requiredString('kyvon-dev-secret-nao-use-em-producao-0000000000'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),

  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  STORAGE_LOCAL_DIR: requiredString('storage/uploads'),
  STORAGE_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().max(200).default(25),

  /** Supabase Storage. A service role key é segredo de servidor — nunca `NEXT_PUBLIC_`. */
  SUPABASE_URL: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: requiredString('kyvon-files'),

  APP_URL: requiredString('http://localhost:3000'),
  APP_TIMEZONE: requiredString('America/Sao_Paulo'),

  ALLOW_DEMO_SEED: booleanFromEnv(true),

  /** Definida pela própria Vercel em todo build e função (`1`). */
  VERCEL: optionalString,
})

const envSchema = baseSchema.superRefine((env, ctx) => {
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message })

  // Vale em qualquer ambiente: um driver sem credenciais só falharia no
  // primeiro upload, longe de quem configurou.
  if (env.STORAGE_DRIVER === 'supabase') {
    const missing = (['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const).filter(
      (key) => !env[key],
    )
    if (missing.length > 0) {
      fail('STORAGE_DRIVER', `STORAGE_DRIVER=supabase exige: ${missing.join(', ')}.`)
    }
  }

  // Na Vercel o sistema de arquivos das funções é somente leitura e o corpo da
  // requisição tem teto de 4,5 MB (ADR-010). Sem estas travas, o primeiro
  // upload falharia longe de quem configurou.
  if (env.VERCEL) {
    if (env.STORAGE_DRIVER !== 'supabase') {
      fail('STORAGE_DRIVER', 'Na Vercel o disco é somente leitura: use STORAGE_DRIVER=supabase.')
    }
    if (env.STORAGE_MAX_FILE_SIZE_MB > 4) {
      fail(
        'STORAGE_MAX_FILE_SIZE_MB',
        'Na Vercel o corpo da requisição é limitado a 4,5 MB: defina no máximo 4.',
      )
    }
  }

  if (env.NODE_ENV !== 'production') return

  // Em produção o Postgres embarcado não serve: é single-connection e vive no
  // sistema de arquivos do processo.
  if (!env.DATABASE_URL) {
    fail('DATABASE_URL', 'Obrigatória em produção (PGlite é apenas para dev/test).')
  }

  if (env.AUTH_SECRET.length < 32) {
    fail('AUTH_SECRET', 'Precisa de no mínimo 32 caracteres em produção.')
  }

  if (env.AUTH_SECRET.includes('dev-secret') || env.AUTH_SECRET.startsWith('troque-este')) {
    fail('AUTH_SECRET', 'Ainda é o valor de exemplo. Gere um segredo real.')
  }

  if (env.ALLOW_DEMO_SEED) {
    fail('ALLOW_DEMO_SEED', 'Precisa ser false em produção.')
  }
})

export type Env = z.infer<typeof baseSchema>

/** Valida um conjunto de variáveis sem cache — usado no boot e nos testes. */
export function validateEnv(source: Record<string, string | undefined>) {
  return envSchema.safeParse(source)
}

function loadEnv(): Env {
  const parsed = validateEnv(process.env)

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  · ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Configuração de ambiente inválida:\n${details}`)
  }

  return parsed.data
}

let cached: Env | undefined

export function getEnv(): Env {
  cached ??= loadEnv()
  return cached
}

export const isProduction = () => getEnv().NODE_ENV === 'production'
export const isTest = () => getEnv().NODE_ENV === 'test'
