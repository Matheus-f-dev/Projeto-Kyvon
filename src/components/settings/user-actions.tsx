'use client'

import { KeyRound, UserCheck, UserX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog'
import { resetUserPasswordAction, setUserStatusAction } from '@/server/modules/admin/actions'

import { TemporaryPasswordNotice } from './user-form-dialog'

export function UserStatusButton({
  userId,
  name,
  status,
}: {
  userId: string
  name: string
  status: 'active' | 'invited' | 'suspended'
}) {
  if (status === 'suspended') {
    return (
      <ConfirmButton
        label="Reativar"
        icon={<UserCheck />}
        title={`Reativar ${name}?`}
        description="A pessoa volta a entrar com a senha atual e recupera as permissões do perfil."
        confirmLabel="Reativar"
        action={() => setUserStatusAction(userId, 'active')}
      />
    )
  }

  return (
    <ConfirmButton
      label="Suspender"
      icon={<UserX />}
      variant="danger-ghost"
      title={`Suspender ${name}?`}
      description="As sessões abertas são encerradas e o login fica bloqueado. Tarefas e histórico permanecem."
      confirmLabel="Suspender"
      action={() => setUserStatusAction(userId, 'suspended')}
    />
  )
}

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const onConfirm = () =>
    startTransition(async () => {
      const result = await resetUserPasswordAction(userId)
      if (result.status === 'error' || !result.data) {
        toast.error(result.message ?? 'Não foi possível redefinir a senha.')
        return
      }
      setPassword(result.data.temporaryPassword)
      router.refresh()
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setPassword(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" icon={<KeyRound />}>
          Redefinir senha
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        {password ? (
          <>
            <DialogHeader title="Senha redefinida" />
            <DialogBody>
              <TemporaryPasswordNotice password={password} />
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Concluir
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader
              title={`Redefinir a senha de ${name}?`}
              description="Uma senha temporária substitui a atual e todas as sessões da pessoa são encerradas."
            />
            <DialogBody />
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" loading={pending} onClick={onConfirm}>
                Redefinir
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
