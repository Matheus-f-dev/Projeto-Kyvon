'use client'

import { Archive } from 'lucide-react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { archiveClientAction } from '@/server/modules/clients/actions'

/**
 * Arquivar é a única forma de "excluir" um cliente (regra 10 do produto: o
 * registro nunca desaparece). Por ser uma ação relevante, exige confirmação.
 */
export function ArchiveClientButton({
  clientId,
  clientName,
}: {
  clientId: string
  clientName: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const onConfirm = () => {
    startTransition(async () => {
      const result = await archiveClientAction(clientId)
      if (result.status === 'error') {
        toast.error(result.message)
        return
      }
      toast.success(result.message ?? 'Cliente arquivado.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="danger-ghost" size="sm" icon={<Archive />}>
          Arquivar
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader
          title="Arquivar cliente"
          description={`${clientName} sairá das listagens ativas. O histórico é preservado e pode ser reaberto depois.`}
        />
        <DialogBody />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            Arquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
