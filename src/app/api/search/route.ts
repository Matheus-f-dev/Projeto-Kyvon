import type { NextRequest } from 'next/server'

import { requireAuth } from '@/server/auth/context'
import { clientIdentifier, handler, jsonOk } from '@/server/http'
import { RateLimitError } from '@/server/errors'
import { globalSearch } from '@/server/modules/search/queries'
import { searchLimiter } from '@/server/security/rate-limit'

export const dynamic = 'force-dynamic'

/** Busca global do Ctrl+K. O debounce fica no cliente; aqui só o limite. */
export const GET = handler(async (request: NextRequest) => {
  const context = await requireAuth()

  const limit = await searchLimiter.check(`search:${context.user.id}:${clientIdentifier(request)}`)
  if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds)

  const query = request.nextUrl.searchParams.get('q') ?? ''
  const groups = await globalSearch(context, query)

  return jsonOk({ query, groups })
})
