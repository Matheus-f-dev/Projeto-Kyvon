import { describe, expect, it } from 'vitest'

import { validateEnv } from '@/server/env'

/**
 * Ambiente: a aplicação recusa subir com configuração que só falharia depois,
 * no primeiro uso real.
 */

const issuesOf = (source: Record<string, string | undefined>) => {
  const result = validateEnv(source)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

const supabaseStorage = {
  STORAGE_DRIVER: 'supabase',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}

describe('Vercel', () => {
  it('recusa o storage local, porque o disco das funções é somente leitura', () => {
    expect(issuesOf({ NODE_ENV: 'development', VERCEL: '1' })).toContain('STORAGE_DRIVER')
  })

  it('recusa limite de upload acima do teto de corpo da Vercel', () => {
    expect(issuesOf({ NODE_ENV: 'development', VERCEL: '1', ...supabaseStorage })).toContain(
      'STORAGE_MAX_FILE_SIZE_MB',
    )
    expect(
      issuesOf({
        NODE_ENV: 'development',
        VERCEL: '1',
        ...supabaseStorage,
        STORAGE_MAX_FILE_SIZE_MB: '4',
      }),
    ).toEqual([])
  })

  it('fora da Vercel, storage local e 25 MB continuam válidos', () => {
    expect(issuesOf({ NODE_ENV: 'development' })).toEqual([])
  })
})

describe('produção', () => {
  it('exige banco, segredo real e seed de demonstração desligado', () => {
    const issues = issuesOf({ NODE_ENV: 'production' })
    expect(issues).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'AUTH_SECRET', 'ALLOW_DEMO_SEED']),
    )
  })
})
