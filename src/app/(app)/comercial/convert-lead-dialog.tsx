'use client'

import { ArrowRight } from 'lucide-react'
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
import { Field } from '@/components/ui/field'
import { FormErrorBanner } from '@/components/ui/form-helpers'
import { Input } from '@/components/ui/input'
import { convertLeadAction } from '@/server/modules/crm/actions'

/**
 * Converte lead em cliente + contato + oportunidade (regras 1 e 2 do produto).
 *
 * Pede só o título da oportunidade — cliente, contato e demais dados vêm do
 * próprio lead. É a única entrada de dado que o usuário realmente decide aqui.
 */
export function ConvertLeadDialog({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(`Projeto para ${leadName}`)
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const onSubmit = () => {
    if (title.trim().length < 2) {
      setError('Informe o título da oportunidade.')
      return
    }

    const formData = new FormData()
    formData.set('leadId', leadId)
    formData.set('opportunityTitle', title.trim())

    startTransition(async () => {
      const result = await convertLeadAction(formData)
      if (result.status === 'error') {
        toast.error(result.message)
        return
      }
      toast.success(result.message ?? 'Lead convertido.')
      setOpen(false)
      router.push(`/comercial?oportunidade=${result.data?.opportunityId}`)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" trailingIcon={<ArrowRight />}>
          Converter
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader
          title="Converter lead"
          description={`Cria o cliente, o contato e a oportunidade a partir de ${leadName}.`}
        />
        <DialogBody className="flex flex-col gap-3">
          <FormErrorBanner message={undefined} />
          <Field label="Título da oportunidade" required error={error}>
            {(props) => (
              <Input
                {...props}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
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
          <Button variant="primary" loading={pending} onClick={onSubmit}>
            Converter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
