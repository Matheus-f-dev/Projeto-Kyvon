'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Fronteira de erro da aplicação.
 *
 * Mostra uma mensagem legível e um caminho de volta, nunca a mensagem crua da
 * exceção — em produção ela pode conter detalhe de infraestrutura. O `digest`
 * é exibido porque é o que liga o que a pessoa viu ao registro no log do
 * servidor, e cabe em um print de mensagem para o time.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app] erro não tratado na renderização:', error)
  }, [error])

  return (
    <main className="bg-sunken flex min-h-dvh items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="bg-danger-soft text-danger-text flex size-11 items-center justify-center rounded-full">
          <AlertTriangle className="size-5" aria-hidden />
        </div>

        <div className="flex flex-col gap-1.5">
          <h1 className="text-strong text-xl font-semibold">Algo deu errado</h1>
          <p className="text-muted text-sm leading-relaxed">
            Não foi possível carregar esta tela. Tentar de novo costuma resolver; se persistir,
            avise o time com o código abaixo.
          </p>
        </div>

        <Button variant="primary" size="md" icon={<RefreshCw />} onClick={reset}>
          Tentar novamente
        </Button>

        {error.digest && <p className="text-2xs text-subtle font-mono">código {error.digest}</p>}
      </div>
    </main>
  )
}
