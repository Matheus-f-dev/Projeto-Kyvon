'use client'

import { Ban, CheckCircle2, Rocket } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmButton, ReasonButton } from '@/components/ui/confirm-button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field } from '@/components/ui/field'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { changeProjectStatusAction, registerLaunchAction } from '@/server/modules/projects/actions'
import { PROJECT_STATUS, PROJECT_TRANSITIONS, type ProjectStatus } from '@/shared/domain'

/**
 * Ações de status do projeto.
 *
 * As transições oferecidas são exatamente as da matriz que o service impõe.
 * Status e etapa são independentes (ADR-004): mudar o status aqui nunca mexe
 * na etapa corrente.
 */
export function ProjectStatusActions({
  projectId,
  projectName,
  status,
  launched,
  openApprovals,
  users,
  currentUserId,
  canCancel,
}: {
  projectId: string
  projectName: string
  status: ProjectStatus
  launched: boolean
  openApprovals: number
  users: { id: string; name: string }[]
  currentUserId: string
  canCancel: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [blockOpen, setBlockOpen] = useState(false)

  const transitions = PROJECT_TRANSITIONS[status]

  const submit = (next: ProjectStatus, extra: Record<string, string> = {}) => {
    const formData = new FormData()
    formData.set('projectId', projectId)
    formData.set('status', next)
    for (const [key, value] of Object.entries(extra)) formData.set(key, value)
    return changeProjectStatusAction(formData)
  }

  const quick = (next: ProjectStatus) => {
    startTransition(async () => {
      const result = await submit(next)
      if (result.status === 'error') toast.error(result.message)
      else {
        toast.success(`Projeto ${PROJECT_STATUS[next].label.toLowerCase()}.`)
        router.refresh()
      }
    })
  }

  // Transições "simples" vão para um menu; as que têm consequência maior
  // (bloquear, concluir, cancelar) ganham botão e confirmação próprios.
  const simple = transitions.filter(
    (next) => next !== 'blocked' && next !== 'completed' && next !== 'cancelled',
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {simple.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" loading={pending}>
              Mudar status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {simple.map((next) => (
              <DropdownMenuItem key={next} onSelect={() => quick(next)}>
                {PROJECT_STATUS[next].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {transitions.includes('blocked') && (
        <Button variant="danger-ghost" size="sm" icon={<Ban />} onClick={() => setBlockOpen(true)}>
          Bloquear
        </Button>
      )}

      {transitions.includes('completed') && (
        <ConfirmButton
          label="Concluir projeto"
          icon={<CheckCircle2 />}
          title="Concluir projeto"
          description={
            openApprovals > 0
              ? `Há ${openApprovals} aprovação(ões) em aberto — a conclusão será recusada até que sejam resolvidas.`
              : 'Marca o projeto como concluído. Ele pode ser reaberto depois, se necessário.'
          }
          confirmLabel="Concluir"
          action={() => submit('completed')}
        />
      )}

      {!launched && (status === 'in_progress' || status === 'completed') && (
        <ConfirmButton
          label="Registrar lançamento"
          icon={<Rocket />}
          title="Registrar lançamento"
          description="Marca a data de lançamento e inicia a contagem do período de suporte do contrato."
          confirmLabel="Registrar"
          action={() => registerLaunchAction(projectId)}
        />
      )}

      {canCancel && transitions.includes('cancelled') && (
        <ReasonButton
          label="Cancelar"
          title="Cancelar projeto"
          description="Cancelamento é definitivo. O projeto e todo o histórico continuam consultáveis."
          reasonLabel="Motivo do cancelamento"
          confirmLabel="Cancelar projeto"
          action={(reason) => submit('cancelled', { cancellationReason: reason })}
        />
      )}

      <BlockProjectDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        projectName={projectName}
        users={users}
        currentUserId={currentUserId}
        onSubmit={(reason, ownerId) =>
          submit('blocked', { blockedReason: reason, blockedOwnerId: ownerId })
        }
      />
    </div>
  )
}

function BlockProjectDialog({
  open,
  onOpenChange,
  projectName,
  users,
  currentUserId,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  users: { id: string; name: string }[]
  currentUserId: string
  onSubmit: (reason: string, ownerId: string) => Promise<{ status: string; message?: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [ownerId, setOwnerId] = useState(currentUserId)
  const [error, setError] = useState<string | undefined>()

  const confirm = () => {
    if (reason.trim().length < 3) {
      setError('Descreva o que está impedindo o projeto.')
      return
    }
    startTransition(async () => {
      const result = await onSubmit(reason.trim(), ownerId)
      if (result.status === 'error') {
        toast.error(result.message)
        return
      }
      toast.success('Projeto bloqueado.')
      onOpenChange(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title="Bloquear projeto"
          description={`${projectName} aparecerá no topo do dashboard até o bloqueio ser resolvido.`}
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
                autoFocus
              />
            )}
          </Field>
          <Field label="Quem vai resolver?" required>
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
          <Button variant="danger" loading={pending} onClick={confirm}>
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
