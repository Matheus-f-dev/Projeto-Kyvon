import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { migrate } from 'drizzle-orm/pglite/migrator'

/**
 * Prepara o banco de teste uma única vez por execução.
 *
 * Banco novo a cada rodada: um teste que passa só porque o anterior deixou
 * dados para trás não está testando nada. O diretório é apagado antes de
 * migrar, e a conexão é fechada ao final para os workers poderem abri-la.
 */
export default async function globalSetup() {
  const dataDir = '.data/test-pglite'

  // `NODE_ENV` é readonly no @types/node; a conversão mantém a atribuição
  // confinada ao preparo de teste, sem afrouxar o tipo no resto do projeto.
  const env = process.env as Record<string, string>
  env.NODE_ENV = 'test'
  env.DATABASE_URL = ''
  env.PGLITE_DATA_DIR = dataDir
  env.AUTH_SECRET = 'segredo-de-teste-determinístico-para-hmac-0000'
  env.ALLOW_DEMO_SEED = 'true'

  await rm(resolve(process.cwd(), dataDir), { recursive: true, force: true })

  // Importado depois das variáveis de ambiente: o módulo lê a configuração na
  // primeira conexão, e importá-lo antes congelaria os valores errados.
  const { db, closeDb } = await import('../src/server/db/client')
  const { seedEssential } = await import('../src/server/db/seed/essential')

  await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') })
  await seedEssential(db)
  await closeDb()
}
