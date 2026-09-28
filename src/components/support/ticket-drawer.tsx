'use client'

import { AlertTriangle, Briefcase, Check, Clock, Pencil, UserCheck } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useRef, useState } from 'react'
import { toast } from 'sonner'

import { FileList } from '@/components/files/file-list'
import { ActionButton } from '@/components/ui/action-button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@/components/ui/drawer'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Textarea } from '@/components/ui/input'
import { DetailItem, DetailList, EntityCode } from '@/components/ui/misc'
import { StatusBadge } from '@/components/ui/status-badge'
import { CheckboxField } from '@/components/ui/toggle'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { idleState, type ActionState } from '@/server/action-state'
import {
  addTicketCommentAction,
  assignTicketAction,
  changeTicketStatusAction,
  sendTicketToCommercialAction,
} from '@/server/modules/support/actions'
import type { TicketClientOptions, TicketDetail } from '@/server/modules/support/queries'
import { todayISO } from '@/shared/dates'
import {
  SUPPORT_CATEGORY,
  SUPPORT_PRIORITY,
  SUPPORT_STATUS,
  SUPPORT_TRANSITIONS,
  type SupportStatus,
} from '@/shared/domain'

import { TicketFormDialog } from './ticket-form-dialog'

function useCloseHref(): string {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.delete('chamado')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** Rótulo da ação de levar o chamado a cada status, a partir do status atual. */
function transitionLabel(from: SupportStatus, to: SupportStatus): string {
  if (to === 'in_progress')
    return from === 'resolved'
      ? 'Reabrir'
      : from === 'waiting_client'
        ? 'Retomar'
        : 'Iniciar atendimento'
  if (to === 'waiting_client') return 'Aguardar cliente'
  if (to === 'resolved') return 'Resolver'
  if (to === 'closed') return 'Fechar'
  return 'Cancelar'
}

/**
 * Drawer do chamado.
 *
 * O topo responde "até quando preciso responder" e "de quem é"; o meio é o
 * histórico do atendimento (notas internas e respostas ao cliente, separadas);
 * as ações de status só mostram os próximos passos válidos.
 */
export function TicketDrawer({
  ticket,
  agents,
  options,
  permissions,
  currentUserId,
}: {
  ticket: TicketDetail
  agents: { id: string; name: string }[]
  options: TicketClientOptions
  permissions: { canWrite: boolean; canAssign: boolean }
  currentUserId: string
}) {
  const router = useRouter()
  const closeHref = useCloseHref()
  const editable = ticket.status !== 'closed' && ticket.status !== 'cancelled'
  const canWrite = permissions.canWrite && editable
  const next = SUPPORT_TRANSITIONS[ticket.status]

  const supportExpired = Boolean(
    ticket.contract?.supportEndsAt && ticket.contract.supportEndsAt < todayISO(),
  )

  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="lg">
        <DrawerHeader
          meta={
            <>
              <EntityCode code={ticket.code} />
              <span>·</span>
              <Link href={`/clientes/${ticket.client.id}`} className="hover:underline">
                {ticket.client.name}
              </Link>
              {ticket.project && (
                <>
                  <span>·</span>
                  <Link href={`/projetos/${ticket.project.id}`} className="hover:underline">
                    {ticket.project.name}
                  </Link>
                </>
              )}
            </>
          }
          title={ticket.title}
          actions={
            canWrite && (
              <TicketFormDialog
                client={{ id: ticket.client.id, label: ticket.client.name }}
                options={options}
                agents={agents}
                currentUserId={currentUserId}
                canAssign={permissions.canAssign}
                defaultValues={{
                  id: ticket.id,
                  title: ticket.title,
                  description: ticket.description,
                  projectId: ticket.project?.id ?? null,
                  requesterContactId: ticket.requester?.id ?? null,
                  category: ticket.category,
                  priority: ticket.priority,
                  assigneeId: ticket.assignee?.id ?? null,
                }}
                trigger={
                  <Button variant="ghost" size="sm" icon={<Pencil />}>
                    Editar
                  </Button>
                }
              />
            )
          }
        />

        <DrawerBody className="flex flex-col gap-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={SUPPORT_STATUS} value={ticket.status} size="md" />
            <Badge tone={SUPPORT_PRIORITY[ticket.priority].tone} size="sm">
              {SUPPORT_PRIORITY[ticket.priority].label}
            </Badge>
            <Badge tone={SUPPORT_CATEGORY[ticket.category].tone} size="sm">
              {SUPPORT_CATEGORY[ticket.category].label}
            </Badge>
          </div>

          <SlaLine ticket={ticket} />

          {supportExpired && editable && ticket.category !== 'bug' && (
            <div className="border-warning-border bg-warning-soft flex gap-2 rounded-lg border px-4 py-3 text-sm">
              <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" />
              <span>
                O suporte do contrato {ticket.contract?.code} terminou em{' '}
                {formatDate(ticket.contract?.supportEndsAt)}. Pedido que não seja correção de
                defeito costuma ser trabalho novo — avalie enviar ao Comercial.
              </span>
            </div>
          )}

          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {next.map((status) =>
                status === 'resolved' || status === 'cancelled' ? (
                  <ResolutionDialog key={status} ticketId={ticket.id} status={status} />
                ) : (
                  <StatusButton
                    key={status}
                    ticketId={ticket.id}
                    status={status}
                    label={transitionLabel(ticket.status, status)}
                  />
                ),
              )}
              {ticket.assignee?.id !== currentUserId && (
                <ActionButton
                  icon={<UserCheck />}
                  action={() => assignTicketAction(ticket.id, currentUserId)}
                >
                  Assumir
                </ActionButton>
              )}
            </div>
          )}

          <CommercialBlock ticket={ticket} canWrite={canWrite} />

          <DetailList>
            <DetailItem label="Responsável">
              {ticket.assignee ? (
                <span className="flex items-center gap-1.5">
                  <Avatar name={ticket.assignee.name} size="xs" />
                  {ticket.assignee.name}
                </span>
              ) : (
                <span className="text-subtle">Ninguém ainda</span>
              )}
            </DetailItem>
            <DetailItem label="Quem pediu">
              {ticket.requester ? (
                <span className="flex flex-col">
                  <span>{ticket.requester.name}</span>
                  <span className="text-2xs text-muted">
                    {[ticket.requester.email, ticket.requester.phone].filter(Boolean).join(' · ')}
                  </span>
                </span>
              ) : (
                '—'
              )}
            </DetailItem>
            <DetailItem label="Contrato">
              {ticket.contract ? (
                <Link href={`/contratos/${ticket.contract.id}`} className="hover:underline">
                  {ticket.contract.code}
                  {ticket.contract.supportEndsAt && (
                    <span className="text-2xs text-muted block">
                      suporte até {formatDate(ticket.contract.supportEndsAt)}
                    </span>
                  )}
                </Link>
              ) : (
                '—'
              )}
            </DetailItem>
            <DetailItem label="Aberto">
              {ticket.creator?.name ?? '—'}
              <span className="text-2xs text-muted block" title={formatDateTime(ticket.createdAt)}>
                {formatRelative(ticket.createdAt)}
              </span>
            </DetailItem>
          </DetailList>

          <section className="flex flex-col gap-1">
            <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">Relato</h3>
            <p className="text-default text-sm whitespace-pre-line">{ticket.description}</p>
          </section>

          {ticket.resolution && (
            <section className="border-success-border bg-success-soft flex flex-col gap-1 rounded-lg border px-4 py-3">
              <h3 className="text-success-text text-2xs font-semibold tracking-wide uppercase">
                {ticket.status === 'cancelled' ? 'Motivo do cancelamento' : 'Solução'}
              </h3>
              <p className="text-default text-sm whitespace-pre-line">{ticket.resolution}</p>
            </section>
          )}

          <Thread ticket={ticket} canWrite={canWrite} />

          {ticket.files && (
            <FileList {...ticket.files} title="Anexos" description="Prints, vídeos, logs." />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

// ── Prazo ────────────────────────────────────────────────────────────────────

function SlaLine({ ticket }: { ticket: TicketDetail }) {
  if (!ticket.dueAt) return null
  const due = new Date(ticket.dueAt)

  if (ticket.firstResponseAt) {
    const answered = new Date(ticket.firstResponseAt)
    const onTime = answered <= due
    return (
      <p
        className={cn(
          'flex items-center gap-1.5 text-xs',
          onTime ? 'text-success-text' : 'text-danger-text',
        )}
      >
        <Check className="size-3.5" />
        Primeira resposta {formatRelative(answered)} —{' '}
        {onTime ? 'dentro do prazo' : 'fora do prazo'}.
      </p>
    )
  }

  if (ticket.status === 'cancelled') return null

  const late = ticket.overdue
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs',
        late ? 'text-danger-text font-medium' : 'text-muted',
      )}
    >
      <Clock className="size-3.5" />
      {late ? 'Prazo de primeira resposta vencido' : 'Responder até'} {formatDateTime(due)} (
      {formatRelative(due)}).
    </p>
  )
}

// ── Status ───────────────────────────────────────────────────────────────────

function statusForm(ticketId: string, status: SupportStatus, resolution?: string) {
  const formData = new FormData()
  formData.set('ticketId', ticketId)
  formData.set('status', status)
  if (resolution) formData.set('resolution', resolution)
  return formData
}

function StatusButton({
  ticketId,
  status,
  label,
}: {
  ticketId: string
  status: SupportStatus
  label: string
}) {
  return (
    <ActionButton
      variant={status === 'in_progress' ? 'primary' : 'secondary'}
      action={() => changeTicketStatusAction(undefined, statusForm(ticketId, status))}
    >
      {label}
    </ActionButton>
  )
}

function ResolutionDialog({
  ticketId,
  status,
}: {
  ticketId: string
  status: 'resolved' | 'cancelled'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const resolving = status === 'resolved'

  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result = await changeTicketStatusAction(previous, formData)
      if (result.status === 'success') {
        toast.success(resolving ? 'Chamado resolvido.' : 'Chamado cancelado.')
        setOpen(false)
        router.refresh()
      }
      return result as ActionState<unknown>
    },
    idleState as ActionState<unknown>,
  )

  return (
    <>
      <Button
        variant={resolving ? 'secondary' : 'danger-ghost'}
        size="sm"
        icon={resolving ? <Check /> : undefined}
        onClick={() => setOpen(true)}
      >
        {resolving ? 'Resolver' : 'Cancelar'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title={resolving ? 'Resolver chamado' : 'Cancelar chamado'}
            description={
              resolving
                ? 'A solução fica no chamado — é o que o próximo atendimento do mesmo problema vai ler.'
                : 'Chamado cancelado não é reaberto. Use para duplicados ou pedidos retirados.'
            }
          />
          <form action={formAction} className="contents">
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="status" value={status} />
            <DialogBody>
              <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
              <Field
                label={resolving ? 'Solução' : 'Motivo'}
                required
                error={state.status === 'error' ? state.fieldErrors?.resolution?.[0] : undefined}
              >
                {(props) => <Textarea {...props} name="resolution" rows={4} required autoFocus />}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <SubmitButton variant={resolving ? 'primary' : 'danger'}>
                {resolving ? 'Resolver' : 'Cancelar chamado'}
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Comercial ────────────────────────────────────────────────────────────────

function CommercialBlock({ ticket, canWrite }: { ticket: TicketDetail; canWrite: boolean }) {
  if (ticket.opportunity) {
    return (
      <Link
        href={`/comercial?oportunidade=${ticket.opportunity.id}`}
        className="border-brand-border bg-brand-soft text-brand-text flex items-center gap-2 rounded-lg border px-4 py-3 text-sm hover:underline"
      >
        <Briefcase className="size-4" />
        Enviado ao Comercial: {ticket.opportunity.code} · {ticket.opportunity.title}
      </Link>
    )
  }

  if (ticket.category !== 'new_demand' || !canWrite) return null

  return (
    <div className="border-brand-border bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <p className="text-sm">
        <span className="text-strong font-medium">Nova demanda.</span>{' '}
        <span className="text-muted">
          Trabalho novo vai para o pipeline, não para a fila de suporte.
        </span>
      </p>
      <ConfirmButton
        label="Enviar para Comercial"
        icon={<Briefcase />}
        variant="primary"
        title="Enviar para Comercial"
        description="Cria uma oportunidade com o cliente, o contato e o relato deste chamado, avisa o responsável pelo cliente e resolve o chamado."
        confirmLabel="Enviar"
        action={async () => {
          const result = await sendTicketToCommercialAction(ticket.id)
          return result.status === 'success'
            ? { status: 'success', message: result.message }
            : { status: 'error', message: result.message }
        }}
      />
    </div>
  )
}

// ── Histórico do atendimento ─────────────────────────────────────────────────

function Thread({ ticket, canWrite }: { ticket: TicketDetail; canWrite: boolean }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result = await addTicketCommentAction(previous, formData)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Registrado.')
        formRef.current?.reset()
        router.refresh()
      }
      return result as ActionState<unknown>
    },
    idleState as ActionState<unknown>,
  )

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">
        Atendimento {ticket.comments.length > 0 && `(${ticket.comments.length})`}
      </h3>

      {ticket.comments.length === 0 && (
        <p className="text-muted text-sm">Nenhuma interação registrada.</p>
      )}

      <ol className="flex flex-col gap-3">
        {ticket.comments.map((comment) => (
          <li
            key={comment.id}
            className={cn(
              'flex flex-col gap-1 rounded-lg border px-3 py-2.5',
              comment.toClient ? 'border-brand-border bg-brand-soft' : 'border-line bg-sunken',
            )}
          >
            <span className="text-2xs text-muted flex items-center gap-1.5">
              <span className="text-default font-medium">{comment.author?.name ?? '—'}</span>·
              <span title={formatDateTime(comment.createdAt)}>
                {formatRelative(comment.createdAt)}
              </span>
              ·
              <span className={comment.toClient ? 'text-brand-text' : undefined}>
                {comment.toClient ? 'Resposta ao cliente' : 'Nota interna'}
              </span>
            </span>
            <p className="text-default text-sm whitespace-pre-line">{comment.body}</p>
          </li>
        ))}
      </ol>

      {canWrite && (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
          <Textarea
            name="body"
            rows={3}
            required
            placeholder="Registre o que foi feito, perguntado ou respondido…"
            aria-label="Nova interação"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CheckboxField
              name="toClient"
              label="Resposta ao cliente"
              description="Conta como primeira resposta no prazo de atendimento."
            />
            <SubmitButton size="sm">Registrar</SubmitButton>
          </div>
        </form>
      )}
    </section>
  )
}

export function MissingTicketDrawer() {
  const router = useRouter()
  const closeHref = useCloseHref()
  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="sm">
        <DrawerHeader title="Chamado não encontrado" />
        <DrawerBody className="text-muted px-5 py-4 text-sm">
          Ele pode ter sido removido, ou você não tem acesso ao suporte.
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
