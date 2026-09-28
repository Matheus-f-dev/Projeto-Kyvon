'use client'

import { Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState, type ReactNode } from 'react'
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
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { idleState, type ActionState } from '@/server/action-state'
import { createScopeChangeAction } from '@/server/modules/scope/actions'
import { SCOPE_CHANGE_ORIGIN } from '@/shared/domain'
import { scopeOriginValues } from '@/shared/schemas/scope'

/**
 * Registrar mudança de escopo.
 *
 * Só o pedido — o que foi solicitado e por quem. A análise de impacto vem
 * depois, no drawer, muitas vezes por outra pessoa. Registrar cedo, mesmo sem
 * saber o impacto, é o que evita a mudança entrar "por fora".
 */
export function ScopeChangeFormDialog({
  projectId,
  trigger,
  defaultOpen = false,
}: {
  projectId: string
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(defaultOpen)

  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result = await createScopeChangeAction(previous, formData)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Registrada.')
        setOpen(false)
        const params = new URLSearchParams(searchParams.toString())
        params.delete('novaMudanca')
        if (result.data?.id) params.set('escopo', result.data.id)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      }
      return result as ActionState<unknown>
    },
    idleState as ActionState<unknown>,
  )
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="md" icon={<Plus />}>
            Registrar mudança
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader
          title="Registrar mudança de escopo"
          description="O escopo do contrato não muda. A mudança fica registrada, é analisada e decidida."
        />
        <form action={formAction} className="contents">
          <input type="hidden" name="projectId" value={projectId} />
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <Field label="Resumo" required error={errors?.title?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  required
                  autoFocus
                  placeholder="Ex.: Integração com marketplace"
                />
              )}
            </Field>

            <Field label="Origem" required error={errors?.origin?.[0]}>
              {(props) => (
                <NativeSelect {...props} name="origin" defaultValue="client">
                  {scopeOriginValues.map((value) => (
                    <option key={value} value={value}>
                      {SCOPE_CHANGE_ORIGIN[value].label}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field
              label="O que foi pedido"
              required
              hint="Quem pediu, quando e por qual canal ajuda na hora de decidir."
              error={errors?.description?.[0]}
            >
              {(props) => <Textarea {...props} name="description" rows={5} required />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Registrar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
