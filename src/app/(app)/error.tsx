'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'

import { PageContainer } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ErrorState } from '@/components/ui/states'

/**
 * Erro dentro da área autenticada.
 *
 * Diferente da fronteira global: aqui a sidebar e o cabeçalho continuam de pé,
 * então a pessoa pode navegar para outro módulo em vez de ficar presa.
 */
export default function AppSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app] erro na renderização da página:', error)
  }, [error])

  return (
    <PageContainer>
      <Panel>
        <ErrorState
          title="Não foi possível carregar esta tela"
          description={
            error.digest
              ? `Tente novamente. Se persistir, avise o time com o código ${error.digest}.`
              : 'Tente novamente em instantes. Se persistir, avise o time.'
          }
          action={
            <Button variant="primary" size="md" icon={<RefreshCw />} onClick={reset}>
              Tentar novamente
            </Button>
          }
        />
      </Panel>
    </PageContainer>
  )
}
