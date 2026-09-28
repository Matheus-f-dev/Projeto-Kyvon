import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Carrega os arquivos `.env` para scripts de linha de comando.
 *
 * O Next.js faz isso sozinho na aplicação; `tsx` não. Usa `process.loadEnvFile`
 * (nativo desde o Node 20.12) para não precisar de dotenv.
 *
 * Ordem de precedência: quem é carregado primeiro vence, porque
 * `loadEnvFile` não sobrescreve variáveis já definidas.
 */
const ENV_FILES = ['.env.local', '.env']

export function loadEnvFiles(cwd = process.cwd()): void {
  for (const file of ENV_FILES) {
    const path = resolve(cwd, file)
    if (!existsSync(path)) continue
    try {
      process.loadEnvFile(path)
    } catch (error) {
      console.warn(`[env] não foi possível ler ${file}:`, error)
    }
  }
}
