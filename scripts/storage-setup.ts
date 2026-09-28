import { getEnv } from '../src/server/env'
import { loadEnvFiles } from './_load-env'

/**
 * Prepara o storage configurado.
 *
 * Supabase: cria o bucket **privado** se ainda não existir e recusa seguir se
 * ele existir como público — um bucket público serviria os arquivos por URL
 * direta, sem passar pela checagem de permissão do backend.
 * Local: não há o que preparar; o diretório é criado no primeiro upload.
 */
async function main() {
  loadEnvFiles()
  const env = getEnv()

  if (env.STORAGE_DRIVER !== 'supabase') {
    console.warn(
      `[storage] driver=${env.STORAGE_DRIVER}: nada a preparar (${env.STORAGE_LOCAL_DIR}).`,
    )
    return
  }

  const base = `${(env.SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1`
  const headers = {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    'Content-Type': 'application/json',
  }
  const bucket = env.SUPABASE_STORAGE_BUCKET

  const existing = await fetch(`${base}/bucket/${encodeURIComponent(bucket)}`, { headers })
  if (existing.ok) {
    const info = (await existing.json()) as { public?: boolean }
    if (info.public) {
      throw new Error(
        `O bucket "${bucket}" é público. Torne-o privado no painel do Supabase antes de usar — os arquivos ficariam acessíveis sem login.`,
      )
    }
    console.warn(`[storage] bucket "${bucket}" já existe e é privado.`)
    return
  }

  const created = await fetch(`${base}/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false,
      file_size_limit: env.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024,
    }),
  })
  if (!created.ok) {
    throw new Error(`Não foi possível criar o bucket (${created.status}): ${await created.text()}`)
  }
  console.warn(`[storage] bucket privado "${bucket}" criado.`)
}

main().catch((error: unknown) => {
  console.error('[storage] falhou:', error)
  process.exitCode = 1
})
