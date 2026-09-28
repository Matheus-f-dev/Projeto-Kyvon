import { requirePermission } from '@/server/auth/context'
import { handler, jsonOk } from '@/server/http'
import { listClientContactOptions } from '@/server/modules/crm/queries'

export const dynamic = 'force-dynamic'

/** Contatos de um cliente — alimenta o seletor de "Contato" ao criar oportunidade. */
export const GET = handler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    await requirePermission('clients.read')
    const { id } = await context.params

    const contacts = await listClientContactOptions(id)
    return jsonOk({ contacts })
  },
)
