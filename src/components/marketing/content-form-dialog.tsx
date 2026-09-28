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
import { createContentAction, updateContentAction } from '@/server/modules/marketing/actions'
import { CONTENT_CHANNEL, CONTENT_FORMAT } from '@/shared/domain'
import {
  contentChannelValues,
  contentFormatValues,
  type ContentInput,
} from '@/shared/schemas/marketing'

export type ContentFormDefaults = Partial<ContentInput> & { id: string }

/**
 * Criar ou editar conteúdo.
 *
 * Criação pede o mínimo para a ideia não se perder — título, formato, canal.
 * Briefing, texto e referências entram quando o conteúdo ganha corpo.
 */
export function ContentFormDialog({
  campaigns,
  owners,
  defaultValues,
  trigger,
  defaultOpen = false,
}: {
  campaigns: { id: string; name: string }[]
  owners: { id: string; name: string }[]
  defaultValues?: ContentFormDefaults
  trigger?: ReactNode
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEdit = Boolean(defaultValues)
  const [open, setOpen] = useState(defaultOpen)

  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result: ActionState<unknown> = isEdit
        ? await updateContentAction(defaultValues!.id, previous, formData)
        : await createContentAction(previous, formData)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Salvo.')
        setOpen(false)
        const created = result.data as { id?: string } | undefined
        if (created?.id) {
          const params = new URLSearchParams(searchParams.toString())
          params.delete('novo')
          params.set('conteudo', created.id)
          router.push(`${pathname}?${params.toString()}`, { scroll: false })
        } else {
          router.refresh()
        }
      }
      return result
    },
    idleState as ActionState<unknown>,
  )
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="md" icon={<Plus />}>
            Novo conteúdo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader title={isEdit ? 'Editar conteúdo' : 'Novo conteúdo'} />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

            <Field label="Título" required error={errors?.title?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  defaultValue={defaultValues?.title}
                  required
                  autoFocus
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Formato" required error={errors?.format?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="format"
                    defaultValue={defaultValues?.format ?? 'post'}
                  >
                    {contentFormatValues.map((value) => (
                      <option key={value} value={value}>
                        {CONTENT_FORMAT[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Canal" required error={errors?.channel?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="channel"
                    defaultValue={defaultValues?.channel ?? 'instagram'}
                  >
                    {contentChannelValues.map((value) => (
                      <option key={value} value={value}>
                        {CONTENT_CHANNEL[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Campanha" error={errors?.campaignId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="campaignId"
                    defaultValue={defaultValues?.campaignId ?? ''}
                  >
                    <option value="">Sem campanha</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Responsável" error={errors?.ownerId?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="ownerId"
                    defaultValue={defaultValues?.ownerId ?? ''}
                  >
                    <option value="">Sem responsável</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field
                label="Pronto até"
                hint="Prazo de produção — não a data de publicação."
                error={errors?.dueDate?.[0]}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    name="dueDate"
                    defaultValue={defaultValues?.dueDate ?? ''}
                  />
                )}
              </Field>
            </div>

            <Field label="Briefing" error={errors?.briefing?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="briefing"
                  rows={3}
                  defaultValue={defaultValues?.briefing ?? ''}
                  placeholder="Objetivo, público, tom, chamada para ação."
                />
              )}
            </Field>
            {isEdit && (
              <>
                <Field label="Texto" error={errors?.copy?.[0]}>
                  {(props) => (
                    <Textarea
                      {...props}
                      name="copy"
                      rows={6}
                      defaultValue={defaultValues?.copy ?? ''}
                    />
                  )}
                </Field>
                <Field label="Referências" error={errors?.referencesNotes?.[0]}>
                  {(props) => (
                    <Textarea
                      {...props}
                      name="referencesNotes"
                      rows={3}
                      defaultValue={defaultValues?.referencesNotes ?? ''}
                      placeholder="Links, perfis, exemplos."
                    />
                  )}
                </Field>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{isEdit ? 'Salvar' : 'Criar'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
