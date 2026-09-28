import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Hash de senha com scrypt (ADR-003).
 *
 * scrypt é memory-hard — encarecer o ataque exige memória, não só clock, o que
 * neutraliza boa parte da vantagem de GPU. Vem no runtime do Node, então não há
 * dependência nativa para compilar (relevante: a máquina de desenvolvimento é
 * Windows, sem toolchain de build).
 *
 * Formato armazenado, com o algoritmo e os parâmetros embutidos:
 *
 *     scrypt$N$r$p$<salt base64>$<hash base64>
 *
 * Guardar os parâmetros junto do hash permite endurecê-los no futuro sem
 * invalidar as senhas existentes: `needsRehash()` detecta o que está defasado e
 * o login regrava com os parâmetros novos.
 */

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/** Custo atual. ~33 MB e poucas dezenas de ms por verificação. */
const CURRENT_PARAMS = { N: 32768, r: 8, p: 1 } as const

const KEY_LENGTH = 64
const SALT_LENGTH = 16
/** O padrão do Node (32 MB) não cobre N=32768, r=8. */
const MAX_MEM = 96 * 1024 * 1024

interface ParsedHash {
  N: number
  r: number
  p: number
  salt: Buffer
  hash: Buffer
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const { N, r, p } = CURRENT_PARAMS
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: MAX_MEM,
  })

  return ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$')
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 6) return null

  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = parts
  if (algorithm !== 'scrypt' || !rawN || !rawR || !rawP || !rawSalt || !rawHash) return null

  const N = Number.parseInt(rawN, 10)
  const r = Number.parseInt(rawR, 10)
  const p = Number.parseInt(rawP, 10)
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null

  try {
    return { N, r, p, salt: Buffer.from(rawSalt, 'base64'), hash: Buffer.from(rawHash, 'base64') }
  } catch {
    return null
  }
}

/**
 * Compara a senha informada com o hash armazenado.
 *
 * Nunca lança: uma linha corrompida no banco resulta em `false`, não em erro
 * 500 que vazaria a diferença entre "senha errada" e "registro inválido".
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false

  const parsed = parseHash(stored)
  if (!parsed) return false

  try {
    const derived = await scryptAsync(password.normalize('NFKC'), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: MAX_MEM,
    })

    if (derived.length !== parsed.hash.length) return false
    return timingSafeEqual(derived, parsed.hash)
  } catch {
    return false
  }
}

/** True quando o hash foi gerado com parâmetros mais fracos que os atuais. */
export function needsRehash(stored: string | null): boolean {
  if (!stored) return false
  const parsed = parseHash(stored)
  if (!parsed) return true

  return (
    parsed.N < CURRENT_PARAMS.N ||
    parsed.r < CURRENT_PARAMS.r ||
    parsed.p < CURRENT_PARAMS.p ||
    parsed.hash.length < KEY_LENGTH
  )
}
