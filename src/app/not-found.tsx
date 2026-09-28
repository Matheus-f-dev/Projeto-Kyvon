import Link from 'next/link'
import { ArrowLeft, Compass } from 'lucide-react'

import { Logo } from '@/components/layout/sidebar'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Página não encontrada' }

/**
 * 404.
 *
 * Fica fora do shell autenticado de propósito: uma rota inexistente pode ser
 * alcançada sem sessão, e montar a sidebar aqui exigiria consultar permissões
 * para uma página que não existe.
 */
export default function NotFound() {
  return (
    <main className="bg-sunken flex min-h-dvh items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="bg-neutral-soft text-subtle flex size-11 items-center justify-center rounded-full">
          <Compass className="size-5" aria-hidden />
        </div>

        <div className="flex flex-col gap-1.5">
          <h1 className="text-strong text-xl font-semibold">Página não encontrada</h1>
          <p className="text-muted text-sm leading-relaxed">
            O endereço acessado não existe ou o registro foi removido. Se você chegou aqui por um
            link interno, vale avisar o time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" size="md" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="size-4" />
              Ir para o dashboard
            </Link>
          </Button>
        </div>

        <Link
          href="/"
          className="text-2xs text-subtle hover:text-muted flex items-center gap-1.5 transition-colors"
        >
          <Logo className="size-4" />
          Kyvon OS
        </Link>
      </div>
    </main>
  )
}
