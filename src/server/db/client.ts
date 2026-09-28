import { mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import type { SQL } from 'drizzle-orm'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { getEnv } from '../env'
import * as schema from './schema'

/**
 * Conexão com o banco (ADR-002).
 *
 * `DATABASE_URL` vazia → PGlite, o PostgreSQL compilado para WASM que roda
 * dentro do processo. Preenchida → PostgreSQL real. O schema, as migrations e
 * o código de consulta são exatamente os mesmos nos dois casos.
 */

export type Database = PostgresJsDatabase<typeof schema>

type DriverKind = 'pglite' | 'postgres'

export interface Connection {
  db: Database
  driver: DriverKind
  close: () => Promise<void>
}

/**
 * O Next.js recarrega módulos a cada edição em desenvolvimento. Sem este cache
 * global, cada recompilação abriria uma conexão nova — e o PGlite, que é
 * single-connection e trava o diretório de dados, falharia na segunda.
 */
const globalForDb = globalThis as typeof globalThis & {
  __kyvonConnection?: Connection
}

/**
 * Cria uma conexão nova e independente do singleton.
 * Usada por scripts (migrate, seed) e pela suíte de testes, que precisam
 * abrir e fechar o banco de forma determinística.
 */
export function createConnection(options: { url?: string } = {}): Connection {
  const env = getEnv()
  const url = options.url ?? env.DATABASE_URL

  if (url) {
    const client = postgres(url, {
      max: env.NODE_ENV === 'production' ? 10 : 3,
      idle_timeout: 20,
      connect_timeout: 10,
      // Poolers em modo transação (Supabase na porta 6543, PgBouncer) não
      // suportam prepared statements nomeados: a próxima query pode cair em
      // outra conexão do servidor. Desligar custa pouco e funciona em qualquer
      // topologia. SSL vem da própria URL (`?sslmode=require`).
      prepare: false,
      // Evita que um erro de conexão derrube o processo inteiro.
      onnotice: () => {},
    })

    return {
      db: drizzlePostgres(client, { schema }),
      driver: 'postgres',
      close: () => client.end({ timeout: 5 }),
    }
  }

  // O PGlite chama `mkdirSync` sem `recursive`, então o diretório pai precisa
  // existir antes de instanciar. Vale só para caminho de disco: `memory://` e
  // `idb://` são esquemas, e criar uma pasta chamada "memory:" falharia no Windows.
  if (!/^[a-z]+:\/\//i.test(env.PGLITE_DATA_DIR)) {
    mkdirSync(env.PGLITE_DATA_DIR, { recursive: true })
  }

  const client = new PGlite(env.PGLITE_DATA_DIR)
  const db = drizzlePglite(client, { schema })

  return {
    // O adaptador PGlite implementa a mesma interface do postgres-js para tudo
    // que usamos (select/insert/update/delete/transaction/query). Unificar o
    // tipo aqui evita espalhar uniões por toda a aplicação.
    db: db as unknown as Database,
    driver: 'pglite',
    close: () => client.close(),
  }
}

function getConnection(): Connection {
  globalForDb.__kyvonConnection ??= createConnection()
  return globalForDb.__kyvonConnection
}

/**
 * Instância única do Drizzle, inicializada na primeira consulta.
 *
 * O proxy existe para adiar a criação da conexão até o primeiro uso real — o
 * `next build` importa módulos de servidor para coletar rotas e não deve, por
 * isso, subir um banco. Métodos são vinculados ao objeto real (e não ao proxy)
 * para preservar `this` e os campos privados do Drizzle.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getConnection().db as unknown as Record<string | symbol, unknown>
    const value = real[prop]
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export function getDriver(): DriverKind {
  return getConnection().driver
}

/**
 * Executa SQL bruto e devolve as linhas.
 *
 * Existe porque os dois drivers discordam no retorno de `db.execute`: o
 * postgres-js devolve um array de linhas, o PGlite devolve
 * `{ rows, fields, rowCount }`. Esta é a única diferença de comportamento
 * observável entre eles, e fica confinada aqui.
 *
 * **Não use `db.execute` diretamente na aplicação** — use esta função ou,
 * de preferência, o query builder do Drizzle, que já é uniforme.
 */
export async function executeRows<T extends Record<string, unknown>>(
  query: SQL,
  database: Database = db,
): Promise<T[]> {
  const result: unknown = await database.execute(query)

  if (Array.isArray(result)) return result as T[]

  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows
  }

  return []
}

/** Encerra a conexão. Usado por scripts e pela suíte de testes. */
export async function closeDb(): Promise<void> {
  const connection = globalForDb.__kyvonConnection
  if (!connection) return
  globalForDb.__kyvonConnection = undefined
  await connection.close()
}
