import { z } from 'zod'
import type { NextRequest } from 'next/server'

import { requireAuth } from '@/server/auth/context'
import { AppError, RateLimitError, ValidationError } from '@/server/errors'
import { handler, jsonOk } from '@/server/http'
import { maxUploadBytes, uploadFile } from '@/server/modules/files/service'
import { uploadLimiter } from '@/server/security/rate-limit'
import { FILE_TARGETS } from '@/shared/files'

export const dynamic = 'force-dynamic'

const fieldsSchema = z.object({
  targetType: z.enum(FILE_TARGETS),
  targetId: z.uuid(),
  previousFileId: z.uuid().optional(),
  label: z.string().trim().max(120).optional(),
})

/** Folga para os campos e delimitadores do multipart além do próprio arquivo. */
const MULTIPART_OVERHEAD = 64 * 1024

/**
 * Upload de arquivo (multipart: `file`, `targetType`, `targetId`,
 * `previousFileId?`, `label?`).
 *
 * Route Handler e não Server Action: o limite de corpo das actions é pequeno e
 * global, e aqui o tamanho é conferido pelo cabeçalho antes de ler o corpo.
 * A proteção CSRF (checagem de Origin) é aplicada pelo `proxy.ts`.
 */
export const POST = handler(async (request: NextRequest) => {
  const context = await requireAuth()

  const limit = await uploadLimiter.check(context.user.id)
  if (!limit.allowed)
    throw new RateLimitError(
      limit.retryAfterSeconds,
      'Muitos envios seguidos. Aguarde um instante.',
    )

  const maxBytes = maxUploadBytes()
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes + MULTIPART_OVERHEAD) {
    throw new AppError(
      'validation',
      `O arquivo passa do limite de ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    )
  }

  const form = await request.formData().catch(() => null)
  if (!form) throw new ValidationError('Envio inválido.')

  const file = form.get('file')
  if (!(file instanceof File)) throw new ValidationError('Selecione um arquivo.')

  const fields = fieldsSchema.safeParse({
    targetType: form.get('targetType'),
    targetId: form.get('targetId'),
    previousFileId: form.get('previousFileId') || undefined,
    label: form.get('label') || undefined,
  })
  if (!fields.success) throw new ValidationError('Destino do arquivo inválido.')

  // O corpo pode ter chegado sem Content-Length (chunked): confere de novo.
  if (file.size > maxBytes) {
    throw new ValidationError(
      `O arquivo passa do limite de ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    )
  }

  const uploaded = await uploadFile(context, {
    target: { type: fields.data.targetType, id: fields.data.targetId },
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    previousFileId: fields.data.previousFileId,
    label: fields.data.label,
  })

  return jsonOk({ file: uploaded }, { status: 201 })
})
