'use client'

import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { ActionState } from '@/server/action-state'

import { Button, type ButtonProps } from './button'

/**
 * Botão que executa uma Server Action sem formulário nem confirmação — para
 * passos seguros e reversíveis de um fluxo ("Assumir", "Enviar para
 * aprovação"). Mostra o resultado em toast e atualiza a página.
 * Ação destrutiva ou final usa `ConfirmButton`.
 */
export function ActionButton({
  icon,
  children,
  action,
  variant = 'secondary',
  size = 'sm',
}: {
  icon?: ReactNode
  children: ReactNode
  action: () => Promise<ActionState<unknown>>
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant={variant}
      size={size}
      icon={icon}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action()
          if (result.status === 'error') {
            toast.error(result.message ?? 'Não foi possível concluir.')
            return
          }
          toast.success(result.message ?? 'Feito.')
          router.refresh()
        })
      }
    >
      {children}
    </Button>
  )
}
