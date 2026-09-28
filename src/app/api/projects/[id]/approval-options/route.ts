import { z } from 'zod'

import { requirePermission } from '@/server/auth/context'
import { NotFoundError } from '@/server/errors'
import { handler, jsonOk } from '@/server/http'
import {
  getProjectClientId,
  listApproverContacts,
  listProjectTaskOptions,
} from '@/server/modules/approvals/queries'

export const dynamic = 'force-dynamic'

/**
 * Opções que dependem do projeto ao pedir uma aprovação: as tarefas dele e os
 * contatos do cliente autorizados a aprovar.
 */
export const GET = handler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    await requirePermission('approvals.write')
    const parsed = z.uuid().safeParse((await context.params).id)
    if (!parsed.success) throw new NotFoundError('Projeto')

    const clientId = await getProjectClientId(parsed.data)
    if (!clientId) throw new NotFoundError('Projeto')

    const [tasks, contacts] = await Promise.all([
      listProjectTaskOptions(parsed.data),
      listApproverContacts(clientId),
    ])
    return jsonOk({ tasks, contacts })
  },
)
