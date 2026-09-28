import type { NextRequest } from 'next/server'

import { requirePermission } from '@/server/auth/context'
import { handler, jsonOk } from '@/server/http'
import { listClientOptions } from '@/server/modules/clients/queries'

export const dynamic = 'force-dynamic'

/** Opções de cliente para o seletor pesquisável de formulários. */
export const GET = handler(async (request: NextRequest) => {
  await requirePermission('clients.read')

  const query = request.nextUrl.searchParams.get('q') ?? undefined
  const clients = await listClientOptions(query)
  const options = clients.map((client) => ({
    id: client.id,
    label: client.name,
    sublabel: client.code,
  }))

  return jsonOk({ options })
})
