import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { sql } from 'drizzle-orm'

import { closeDb, db, executeRows } from '../src/server/db/client'
import { getEnv } from '../src/server/env'
import { loadEnvFiles } from './_load-env'

/**
 * Destrói e recria o schema do banco.
 *
 * Bloqueado em produção — sem exceção e sem flag de escape. Um comando que
 * apaga tudo não deve ter uma porta dos fundos no repositório.
 */
async function main() {
  loadEnvFiles()
  const env = getEnv()

  if (env.NODE_ENV === 'production') {
    throw new Error('db:reset é proibido em produção.')
  }

  // Com PGlite basta apagar o diretório: mais rápido e mais completo do que
  // derrubar o schema objeto por objeto.
  if (!env.DATABASE_URL) {
    const dataDir = resolve(process.cwd(), env.PGLITE_DATA_DIR)
    await rm(dataDir, { recursive: true, force: true })
    console.warn(`[reset] diretório do PGlite removido: ${dataDir}`)
    console.warn('[reset] rode `npm run db:migrate` e `npm run db:seed` em seguida')
    return
  }

  try {
    const tables = await executeRows<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      db,
    )

    if (tables.length > 0) {
      await db.execute(sql.raw(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`))
      console.warn(`[reset] ${tables.length} tabelas removidas`)
    }

    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS drizzle CASCADE;`))
    console.warn('[reset] concluído — rode `npm run db:migrate` e `npm run db:seed`')
  } finally {
    await closeDb()
  }
}

main().catch((error: unknown) => {
  console.error('[reset] falhou:', error)
  process.exitCode = 1
})
