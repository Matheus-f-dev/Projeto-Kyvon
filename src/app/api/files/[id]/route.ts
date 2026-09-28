import { z } from 'zod'
import type { NextRequest } from 'next/server'

import { requireAuth } from '@/server/auth/context'
import { NotFoundError } from '@/server/errors'
import { handler, jsonOk } from '@/server/http'
import { deleteFile, readFileForDownload } from '@/server/modules/files/service'

export const dynamic = 'force-dynamic'

const idSchema = z.uuid()

type Params = { params: Promise<{ id: string }> }

async function parseId(params: Params['params']): Promise<string> {
  const { id } = await params
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) throw new NotFoundError('Arquivo')
  return parsed.data
}

/**
 * Download. A permissão é conferida sobre a entidade vinculada a cada pedido —
 * não existe URL pública nem assinada de longa duração.
 *
 * `?inline=1` abre no navegador, mas só para imagem raster e PDF. Qualquer
 * outro tipo (SVG incluído, que pode carregar script) sai sempre como anexo.
 */
export const GET = handler(async (request: NextRequest, { params }: Params) => {
  const context = await requireAuth()
  const id = await parseId(params)
  const file = await readFileForDownload(context, id)

  const inline = request.nextUrl.searchParams.get('inline') === '1' && file.kind?.inline === true
  const isPdf = file.mimeType === 'application/pdf'

  const headers = new Headers({
    'Content-Type': inline ? file.mimeType : 'application/octet-stream',
    'Content-Length': String(file.bytes.byteLength),
    'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', file.name),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  // O visualizador de PDF do navegador não roda sob `sandbox`; os demais tipos
  // ficam isolados mesmo se alguém abrir a URL diretamente.
  if (!(inline && isPdf)) {
    headers.set(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    )
  }

  return new Response(file.bytes as BodyInit, { status: 200, headers }) as never
})

export const DELETE = handler(async (_request: NextRequest, { params }: Params) => {
  const context = await requireAuth()
  const id = await parseId(params)
  await deleteFile(context, id)
  return jsonOk({ ok: true })
})

/** RFC 6266 + RFC 5987: nome ASCII de reserva e o nome real em UTF-8. */
function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const fallback = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
