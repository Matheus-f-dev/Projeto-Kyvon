import { requirePermission } from '@/server/auth/context'
import { NotFoundError } from '@/server/errors'
import { handler, jsonOk } from '@/server/http'
import { listTicketClientOptions } from '@/server/modules/support/queries'
import { isUuid } from '@/shared/ids'

export const dynamic = 'force-dynamic'

/** Projetos e contatos de um cliente — alimenta o formulário de chamado. */
export const GET = handler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('support.write')
  const { id } = await context.params
  if (!isUuid(id)) throw new NotFoundError('Cliente')
  return jsonOk(await listTicketClientOptions(id))
})
