import { closeDb, db, getDriver } from '../src/server/db/client'
import { seedEssential } from '../src/server/db/seed/essential'
import { getEnv } from '../src/server/env'
import { loadEnvFiles } from './_load-env'

/**
 * Popula o banco.
 *
 *   npm run db:seed          → apenas o essencial (seguro em produção)
 *   npm run db:seed -- --demo → essencial + dados de demonstração
 *
 * O modo demo exige `ALLOW_DEMO_SEED=true`, e o validador de ambiente recusa
 * subir em produção com essa variável ligada. Dado fictício não chega em
 * produção por acidente.
 */
async function main() {
  loadEnvFiles()

  const wantsDemo = process.argv.includes('--demo')
  const env = getEnv()

  if (wantsDemo && env.NODE_ENV === 'production') {
    throw new Error('Seed de demonstração é proibido em produção.')
  }

  if (wantsDemo && !env.ALLOW_DEMO_SEED) {
    throw new Error('Seed de demonstração requer ALLOW_DEMO_SEED=true.')
  }

  console.warn(`[seed] driver=${getDriver()}`)

  try {
    const result = await seedEssential(db)
    console.warn('[seed] essencial aplicado (perfis, permissões, catálogos, templates)')

    if (result.createdAdmin && result.adminPassword) {
      console.warn(
        [
          '',
          '  ┌─────────────────────────────────────────────────────────┐',
          '  │  Usuário administrador criado                           │',
          '  ├─────────────────────────────────────────────────────────┤',
          `  │  E-mail: ${result.adminEmail.padEnd(46)} │`,
          `  │  Senha:  ${result.adminPassword.padEnd(46)} │`,
          '  ├─────────────────────────────────────────────────────────┤',
          '  │  Anote agora: esta senha não será exibida de novo.      │',
          '  └─────────────────────────────────────────────────────────┘',
          '',
        ].join('\n'),
      )
    } else {
      console.warn('[seed] já existem usuários — administrador não foi recriado')
    }

    if (wantsDemo) {
      const { seedDemo } = await import('../src/server/db/seed/demo')
      const summary = await seedDemo(db)
      console.warn(`[seed] demonstração aplicada: ${summary}`)
    }

    console.warn('[seed] concluído')
  } finally {
    await closeDb()
  }
}

main().catch((error: unknown) => {
  console.error('[seed] falhou:', error)
  process.exitCode = 1
})
