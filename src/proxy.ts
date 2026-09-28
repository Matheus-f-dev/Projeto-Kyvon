import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE } from '@/shared/auth-cookie'

/**
 * Proxy (o antigo middleware — convenção renomeada no Next 16).
 *
 * Faz duas coisas, ambas baratas: manda quem não tem cookie para o login e
 * barra requisição mutante de outra origem.
 *
 * **Não** faz autorização de recurso nem valida a sessão no banco. Roda em
 * todas as rotas e não deve tocar o banco; além disso, cookie presente não
 * significa sessão válida. A verificação real acontece em `requireAuth()` /
 * `requirePermission()`, dentro do servidor.
 */

const PUBLIC_PATHS = ['/login', '/api/health']

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── CSRF: defesa em profundidade sobre o SameSite=lax do cookie ──────────
  if (MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.get('origin')

    if (origin) {
      const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
      let originHost: string | null = null

      try {
        originHost = new URL(origin).host
      } catch {
        originHost = null
      }

      if (!originHost || !host || originHost !== host) {
        return new NextResponse('Origem não permitida.', { status: 403 })
      }
    }
  }

  if (isPublic(pathname)) return NextResponse.next()

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)

  if (!hasSession) {
    // Requisição de API responde 401; navegação vai para o login preservando o destino.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Sessão expirada.' } },
        { status: 401 },
      )
    }

    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirectTo', pathname + request.nextUrl.search)
    }

    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /**
     * Tudo, menos assets estáticos e arquivos com extensão.
     * Rodar em `_next/static` só desperdiçaria invocação.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[^/]+$).*)',
  ],
}
