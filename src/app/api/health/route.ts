import { sql } from 'drizzle-orm'

import { db, executeRows, getDriver } from '@/server/db/client'
import { getEnv } from '@/server/env'

export const dynamic = 'force-dynamic'

/**
 * Health check.
 *
 * Verifica o que de fato precisa estar de pé — a aplicação responde **e** o
 * banco aceita consulta. Um health check que só devolve 200 sem tocar as
 * dependências mente para o orquestrador.
 *
 * Público de propósito (load balancers não autenticam), por isso não expõe
 * versão, host nem nada que ajude a mapear a infraestrutura.
 */
export async function GET() {
  const startedAt = Date.now()

  let database: 'up' | 'down' = 'down'
  let databaseLatencyMs: number | null = null

  try {
    const checkStart = Date.now()
    await executeRows(sql`SELECT 1`, db)
    databaseLatencyMs = Date.now() - checkStart
    database = 'up'
  } catch (error) {
    console.error('[health] banco indisponível:', error)
  }

  const healthy = database === 'up'

  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        database: { status: database, latencyMs: databaseLatencyMs, driver: getDriver() },
      },
      environment: getEnv().NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      tookMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
