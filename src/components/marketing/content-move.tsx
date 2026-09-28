'use client'

import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input } from '@/components/ui/input'
import { idleState, type ActionState } from '@/server/action-state'
import { moveContentAction } from '@/server/modules/marketing/actions'
import { CONTENT_STATUS, CONTENT_TRANSITIONS, type ContentStatus } from '@/shared/domain'

/**
 * "Mover para" de um conteúdo. Passos simples vão direto; agendar e publicar
 * abrem um diálogo curto, porque o servidor exige horário e link.
 * Sem `marketing.publish`, "Publicado" nem aparece como opção.
 */
export function ContentMoveMenu({
  contentId,
  status,
  canPublish,
  scheduledValue,
  variant = 'menu',
}: {
  contentId: string
  status: ContentStatus
  canPublish: boolean
  /** Valor atual para `datetime-local`, se já houver agendamento. */
  scheduledValue?: string
  /** `menu`: ícone compacto (card); `button`: botão com rótulo (drawer). */
  variant?: 'menu' | 'button'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<'scheduled' | 'published' | null>(null)

  const targets = CONTENT_TRANSITIONS[status].filter(
    (target) => target !== 'published' || canPublish,
  )
  if (targets.length === 0) return null

  const moveNow = (target: ContentStatus) => {
    const formData = new FormData()
    formData.set('contentId', contentId)
    formData.set('status', target)
    startTransition(async () => {
      const result = await moveContentAction(undefined, formData)
      if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível mover.')
        return
      }
      toast.success(`Movido para ${CONTENT_STATUS[target].label}.`)
      router.refresh()
    })
  }

  const choose = (target: ContentStatus) => {
    if (target === 'scheduled' || target === 'published') setDialog(target)
    else moveNow(target)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'menu' ? (
            <Button variant="ghost" size="xs" iconOnly aria-label="Mover para" loading={pending}>
              <ArrowRight />
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={<ArrowRight />} loading={pending}>
              Mover para
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Mover para</DropdownMenuLabel>
          {targets.map((target) => (
            <DropdownMenuItem key={target} onSelect={() => choose(target)}>
              {CONTENT_STATUS[target].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog && (
        <MoveDialog
          contentId={contentId}
          target={dialog}
          scheduledValue={scheduledValue}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

function MoveDialog({
  contentId,
  target,
  scheduledValue,
  onClose,
}: {
  contentId: string
  target: 'scheduled' | 'published'
  scheduledValue?: string
  onClose: () => void
}) {
  const router = useRouter()
  const scheduling = target === 'scheduled'

  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result = await moveContentAction(previous, formData)
      if (result.status === 'success') {
        toast.success(scheduling ? 'Agendado.' : 'Publicado.')
        onClose()
        router.refresh()
      }
      return result as ActionState<unknown>
    },
    idleState as ActionState<unknown>,
  )
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader
          title={scheduling ? 'Agendar publicação' : 'Registrar publicação'}
          description={
            scheduling
              ? 'Horário de Brasília. O conteúdo aparece no calendário neste dia.'
              : 'O link fica no histórico do conteúdo. Publicado não volta de etapa.'
          }
        />
        <form action={formAction} className="contents">
          <input type="hidden" name="contentId" value={contentId} />
          <input type="hidden" name="status" value={target} />
          <DialogBody>
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
            {scheduling ? (
              <Field label="Vai ao ar em" required error={errors?.scheduledAt?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    type="datetime-local"
                    name="scheduledAt"
                    defaultValue={scheduledValue}
                    required
                    autoFocus
                  />
                )}
              </Field>
            ) : (
              <Field label="Link publicado" required error={errors?.publishedUrl?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    type="url"
                    name="publishedUrl"
                    placeholder="https://"
                    required
                    autoFocus
                  />
                )}
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Voltar
            </Button>
            <SubmitButton>{scheduling ? 'Agendar' : 'Publicar'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
