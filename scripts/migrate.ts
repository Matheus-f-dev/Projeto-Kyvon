import { resolve } from 'node:path'

import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'

import { closeDb, createConnection, db, getDriver } from '../src/server/db/client'
import { getEnv } from '../src/server/env'
import { loadEnvFiles } from './_load-env'

/**
 * Aplica as migrations pendentes.
 *
 * Mesmo conjunto de arquivos SQL nos dois drivers (ADR-002) — só o migrator
 * muda, porque cada um fala com um transporte diferente.
 */
async function main() {
  loadEnvFiles()

  const driver = getDriver()
  const migrationsFolder = resolve(process.cwd(), 'drizzle')

  console.warn(`[migrate] driver=${driver} pasta=${migrationsFolder}`)

  try {
    if (driver === 'pglite') {
      await migratePglite(db as never, { migrationsFolder })
    } else {
      // No Supabase a aplicação fala com o pooler em modo transação; DDL e o
      // lock do migrator pedem a conexão direta (DATABASE_MIGRATION_URL).
      const migrationUrl = getEnv().DATABASE_MIGRATION_URL
      if (migrationUrl) {
        const connection = createConnection({ url: migrationUrl })
        try {
          await migratePostgres(connection.db, { migrationsFolder })
        } finally {
          await connection.close()
        }
      } else {
        await migratePostgres(db, { migrationsFolder })
      }
    }
    console.warn('[migrate] concluído')
  } finally {
    await closeDb()
  }
}

main().catch((error: unknown) => {
  console.error('[migrate] falhou:', error)
  process.exitCode = 1
})
