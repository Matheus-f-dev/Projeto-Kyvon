'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { ActionState } from '@/server/action-state'

import { Button, type ButtonProps } from './button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from './dialog'
import { Field } from './field'
import { Textarea } from './input'

/**
 * Botão de ação com confirmação.
 *
 * Para a ação que só precisa de "tem certeza?" (marcar como ganha, reabrir,
 * enviar proposta, converter em contrato). Chama a Server Action diretamente
 * — sem `<form>` — porque não há campo nenhum além do que já está no
 * fechamento da função.
 */
export function ConfirmButton({
  label,
  icon,
  variant = 'secondary',
  title,
  description,
  confirmLabel = 'Confirmar',
  action,
  onSuccess,
}: {
  label: ReactNode
  icon?: ReactNode
  variant?: ButtonProps['variant']
  title: string
  description?: string
  confirmLabel?: string
  action: () => Promise<ActionState>
  onSuccess?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const onConfirm = () => {
    startTransition(async () => {
      const result = await action()
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível concluir a ação.')
        return
      }
      toast.success(result.message ?? 'Feito.')
      setOpen(false)
      onSuccess?.()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" icon={icon}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={title} description={description} />
        <DialogBody />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Botão de ação que exige um motivo em texto (marcar como perdida, recusar
 * proposta, descartar lead, cancelar contrato). O motivo é auditável — vai
 * para o log e para o feed de atividade de quem chama a action.
 */
export function ReasonButton({
  label,
  icon,
  variant = 'danger-ghost',
  title,
  description,
  reasonLabel = 'Motivo',
  confirmLabel = 'Confirmar',
  action,
  onSuccess,
}: {
  label: ReactNode
  icon?: ReactNode
  variant?: ButtonProps['variant']
  title: string
  description?: string
  reasonLabel?: string
  confirmLabel?: string
  action: (reason: string) => Promise<ActionState>
  onSuccess?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const onConfirm = () => {
    if (reason.trim().length < 3) {
      setError('Informe o motivo.')
      return
    }

    startTransition(async () => {
      const result = await action(reason.trim())
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível concluir a ação.')
        return
      }
      toast.success(result.message ?? 'Feito.')
      setOpen(false)
      setReason('')
      onSuccess?.()
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setReason('')
          setError(undefined)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" icon={icon}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={title} description={description} />
        <DialogBody>
          <Field label={reasonLabel} required error={error}>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setError(undefined)
                }}
                autoFocus
              />
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
