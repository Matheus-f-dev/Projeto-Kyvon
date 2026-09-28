import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Testes rodam contra um PostgreSQL real (PGlite em disco, recriado a cada
 * execução pelo globalSetup). Testar regra de negócio contra banco falso
 * esconde justamente o que pode quebrar: constraint, transação e cascata.
 *
 * `singleFork` porque o PGlite é single-connection — dois workers disputariam
 * o mesmo diretório de dados.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    // Arquivos em sequência e registro de módulos compartilhado: o PGlite é
    // single-connection, e dois arquivos em paralelo disputariam o diretório.
    fileParallelism: false,
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
})
