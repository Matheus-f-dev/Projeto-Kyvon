import { defineConfig } from 'drizzle-kit'

/**
 * Configuração do drizzle-kit (geração de migrations e studio).
 *
 * `generate` não precisa de conexão — lê só o schema. As credenciais abaixo
 * servem a `studio`/`push` e seguem a mesma regra do runtime (ADR-002):
 * sem DATABASE_URL, fala com o PGlite local.
 */

// Prefere a conexão direta: o pooler em modo transação do Supabase não serve para introspecção.
const databaseUrl = process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim()

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  ...(databaseUrl
    ? { dbCredentials: { url: databaseUrl } }
    : {
        driver: 'pglite',
        dbCredentials: { url: process.env.PGLITE_DATA_DIR?.trim() || '.data/pglite' },
      }),
})
