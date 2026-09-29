import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getEnv } from '../env'

/**
 * Storage de binários (ADR-008, ADR-010).
 *
 * O banco guarda só metadados e a chave; o conteúdo vive aqui. Dois drivers
 * com o mesmo contrato: `local` (disco, desenvolvimento) e `supabase` (bucket
 * privado via API REST, produção). Nenhum deles serve arquivo por URL direta —
 * todo download passa pela checagem de permissão do backend.
 */

export type StorageDriverName = 'local' | 'supabase'

export interface StorageDriver {
  name: StorageDriverName
  /** Grava um objeto novo. Chaves são únicas; não sobrescreve. */
  put(key: string, data: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

/**
 * Chaves são relativas e sem `..`: um nome manipulado nunca alcança arquivos
 * fora da área do storage.
 */
function assertSafeKey(key: string): string {
  const normalized = key.replace(/\\/g, '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new Error(`Chave de storage inválida: ${key}`)
  }
  return normalized
}

export function createLocalDriver(baseDir: string): StorageDriver {
  const root = path.resolve(baseDir)

  const resolve = (key: string) => {
    const full = path.resolve(root, assertSafeKey(key))
    if (!full.startsWith(root + path.sep)) throw new Error(`Chave de storage inválida: ${key}`)
    return full
  }

  return {
    name: 'local',
    async put(key, data) {
      const full = resolve(key)
      await mkdir(path.dirname(full), { recursive: true })
      // `wx` falha se já existir: colisão de chave nunca sobrescreve silenciosamente.
      await writeFile(full, data, { flag: 'wx' })
    },
    async get(key) {
      return new Uint8Array(await readFile(resolve(key)))
    },
    async delete(key) {
      await rm(resolve(key), { force: true })
    },
    async exists(key) {
      try {
        await stat(resolve(key))
        return true
      } catch {
        return false
      }
    },
  }
}

export interface SupabaseDriverOptions {
  url: string
  serviceRoleKey: string
  bucket: string
  fetchImpl?: typeof fetch
}

export function createSupabaseDriver(options: SupabaseDriverOptions): StorageDriver {
  const base = `${options.url.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(options.bucket)}`
  const doFetch = options.fetchImpl ?? fetch
  const auth = {
    Authorization: `Bearer ${options.serviceRoleKey}`,
    apikey: options.serviceRoleKey,
  }
  const objectUrl = (key: string) =>
    `${base}/${assertSafeKey(key).split('/').map(encodeURIComponent).join('/')}`

  async function ensureOk(response: Response, action: string): Promise<Response> {
    if (!response.ok) {
      throw new Error(`Storage (${action}) falhou com ${response.status}: ${await response.text()}`)
    }
    return response
  }

  return {
    name: 'supabase',
    async put(key, data) {
      const url = objectUrl(key)
      await ensureOk(
        await doFetch(url, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' },
          body: data as BodyInit,
        }),
        'upload',
      )
    },
    async get(key) {
      const response = await ensureOk(await doFetch(objectUrl(key), { headers: auth }), 'download')
      return new Uint8Array(await response.arrayBuffer())
    },
    async delete(key) {
      const safe = assertSafeKey(key)
      await ensureOk(
        await doFetch(base, {
          method: 'DELETE',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [safe] }),
        }),
        'exclusão',
      )
    },
    async exists(key) {
      const response = await doFetch(objectUrl(key), { method: 'HEAD', headers: auth })
      return response.ok
    },
  }
}

const globalForStorage = globalThis as typeof globalThis & {
  __kyvonStorage?: StorageDriver
  __kyvonStorageOverride?: StorageDriver
}

export function getStorage(): StorageDriver {
  if (globalForStorage.__kyvonStorageOverride) return globalForStorage.__kyvonStorageOverride
  if (!globalForStorage.__kyvonStorage) {
    const env = getEnv()
    globalForStorage.__kyvonStorage =
      env.STORAGE_DRIVER === 'supabase'
        ? createSupabaseDriver({
            url: env.SUPABASE_URL ?? '',
            serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
            bucket: env.SUPABASE_STORAGE_BUCKET,
          })
        : createLocalDriver(env.STORAGE_LOCAL_DIR)
  }
  return globalForStorage.__kyvonStorage
}

/** Substitui o driver nos testes. `undefined` restaura o configurado. */
export function __setStorageForTests(driver: StorageDriver | undefined): void {
  globalForStorage.__kyvonStorageOverride = driver
}
