'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { changeTaskStatusAction } from '@/server/modules/tasks/actions'
import type { TaskStatus } from '@/shared/domain'

/**
 * Mudança de status de tarefa, compartilhada pelo quadro e pelo drawer.
 *
 * Bloquear nunca é um clique só: abre um diálogo que exige o motivo e quem
 * vai resolver (regra 5 do produto). Os outros status mudam direto, com o
 * erro de regra de negócio — dependência aberta, por exemplo — mostrado em
 * toast com a mensagem do servidor.
 */
export function useTaskStatusChange() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const change = (
    taskId: string,
    status: TaskStatus,
    block?: { reason: string; ownerId: string },
    onDone?: () => void,
  ) => {
    const formData = new FormData()
    formData.set('taskId', taskId)
    formData.set('status', status)
    if (block) {
      formData.set('blockedReason', block.reason)
      formData.set('blockedOwnerId', block.ownerId)
    }

    startTransition(async () => {
      const result = await changeTaskStatusAction(formData)
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível mudar o status.')
        return
      }
      onDone?.()
      router.refresh()
    })
  }

  return { change, pending }
}

export function BlockTaskDialog({
  taskId,
  taskTitle,
  users,
  currentUserId,
  open,
  onOpenChange,
}: {
  taskId: string
  taskTitle: string
  users: { id: string; name: string }[]
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { change, pending } = useTaskStatusChange()
  const [reason, setReason] = useState('')
  const [ownerId, setOwnerId] = useState(currentUserId)
  const [error, setError] = useState<string | undefined>()

  const submit = () => {
    if (reason.trim().length < 3) {
      setError('Descreva o que está impedindo a tarefa.')
      return
    }
    change(taskId, 'blocked', { reason: reason.trim(), ownerId }, () => {
      onOpenChange(false)
      setReason('')
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title="Bloquear tarefa"
          description={`${taskTitle} — o bloqueio fica visível no projeto e no dashboard até ser resolvido.`}
        />
        <DialogBody className="flex flex-col gap-4">
          <Field label="O que está impedindo?" required error={error}>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setError(undefined)
                }}
                placeholder="Ex.: cliente não liberou o acesso ao servidor."
                autoFocus
              />
            )}
          </Field>
          <Field
            label="Quem vai resolver?"
            required
            hint="Recebe uma notificação e vê o bloqueio no Meu trabalho."
          >
            {(props) => (
              <NativeSelect
                {...props}
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={pending} onClick={submit}>
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
