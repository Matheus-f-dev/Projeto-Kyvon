'use client'

import { Check, MessageSquareWarning, Pencil, Send, XCircle } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState } from 'react'
import { toast } from 'sonner'

import { FileList } from '@/components/files/file-list'
import { Button } from '@/components/ui/button'
import { ReasonButton } from '@/components/ui/confirm-button'
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
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatDeadline, formatRelative, isOverdue } from '@/lib/format'
import { idleState, type ActionState } from '@/server/action-state'
import {
  cancelApprovalAction,
  decideApprovalAction,
  submitNewVersionAction,
} from '@/server/modules/approvals/actions'
import type { ApprovalDetail, ApprovalVersionDetail } from '@/server/modules/approvals/queries'
import { APPROVAL_STATUS } from '@/shared/domain'

import { ApprovalFormDialog, type ApprovalProjectOptions } from './approval-form-dialog'

export interface ApprovalDrawerProps {
  approval: ApprovalDetail
  approvers: { id: string; name: string }[]
  options: ApprovalProjectOptions
  permissions: {
    /** Pedir, editar, reenviar, cancelar. */
    canWrite: boolean
    canDecide: boolean
  }
  currentUserId: string
}

/** URL da página atual sem `?aprovacao=` — fecha o drawer. */
function useCloseHref(): string {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.delete('aprovacao')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/**
 * Drawer da aprovação.
 *
 * As versões aparecem da mais recente para a mais antiga, cada uma com o
 * material, as observações de quem enviou e a decisão — do jeito que estavam
 * quando foram decididas. É o histórico que responde "o que o cliente aprovou,
 * e quando".
 */
export function ApprovalDrawer({
  approval,
  approvers,
  options,
  permissions,
  currentUserId,
}: ApprovalDrawerProps) {
  const router = useRouter()
  const closeHref = useCloseHref()

  const open = approval.status === 'pending' || approval.status === 'changes_requested'
  const projectClosed =
    approval.project.status === 'completed' || approval.project.status === 'cancelled'
  const canWrite = permissions.canWrite && open && !projectClosed
  const current = approval.versions.find((version) => version.version === approval.currentVersion)

  // Aprovação interna: quem enviou a versão não decide sobre ela (o servidor
  // recusa de qualquer forma — aqui só evita oferecer um botão que vai falhar).
  const selfSubmitted = !approval.approverContact && current?.submittedBy?.id === currentUserId
  const canDecide = permissions.canDecide && approval.status === 'pending' && !selfSubmitted

  const approverLabel = approval.approverContact
    ? `${approval.approverContact.name} (cliente)`
    : (approval.approverUser?.name ?? 'Não definido')

  return (
    <Drawer open onOpenChange={(next) => !next && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="lg">
        <DrawerHeader
          meta={
            <>
              <EntityCode code={approval.code} />
              <span>·</span>
              <Link href={`/projetos/${approval.project.id}`} className="hover:underline">
                {approval.project.name}
              </Link>
              <span>·</span>
              <Link href={`/clientes/${approval.client.id}`} className="hover:underline">
                {approval.client.name}
              </Link>
            </>
          }
          title={approval.title}
          actions={
            canWrite && (
              <>
                <ApprovalFormDialog
                  approvers={approvers}
                  options={options}
                  defaultValues={{
                    id: approval.id,
                    title: approval.title,
                    description: approval.description,
                    taskId: approval.task?.id ?? null,
                    approverUserId: approval.approverUser?.id ?? null,
                    approverContactId: approval.approverContact?.id ?? null,
                    dueDate: approval.dueDate,
                  }}
                  trigger={
                    <Button variant="ghost" size="sm" icon={<Pencil />}>
                      Editar
                    </Button>
                  }
                />
                <ReasonButton
                  label="Cancelar"
                  icon={<XCircle />}
                  title="Cancelar aprovação"
                  description="O histórico das versões é preservado. O motivo fica no feed do projeto e na auditoria."
                  confirmLabel="Cancelar aprovação"
                  action={(reason) => cancelApprovalAction(approval.id, reason)}
                />
              </>
            )
          }
        />

        <DrawerBody className="flex flex-col gap-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={APPROVAL_STATUS} value={approval.status} size="md" />
            <span className="text-muted text-xs">v{approval.currentVersion}</span>
            {approval.dueDate && open && (
              <span
                className={cn(
                  'text-xs',
                  isOverdue(approval.dueDate) ? 'text-danger-text font-medium' : 'text-muted',
                )}
              >
                · decisão {formatDeadline(approval.dueDate)}
              </span>
            )}
          </div>

          <StatusBanner
            approval={approval}
            approverLabel={approverLabel}
            canWrite={canWrite}
            canDecide={canDecide}
            selfSubmitted={selfSubmitted && permissions.canDecide && approval.status === 'pending'}
          />

          <DetailList>
            <DetailItem label="Quem aprova">
              {approval.approverContact ? (
                <span className="flex flex-col">
                  <span>{approval.approverContact.name}</span>
                  <span className="text-2xs text-muted">
                    Cliente
                    {approval.approverContact.jobTitle
                      ? ` · ${approval.approverContact.jobTitle}`
                      : ''}
                    {approval.approverUser ? ` · registro por ${approval.approverUser.name}` : ''}
                  </span>
                </span>
              ) : (
                approverLabel
              )}
            </DetailItem>
            <DetailItem label="Pedido por">
              {approval.requester?.name ?? '—'}
              <span
                className="text-2xs text-muted block"
                title={formatDateTime(approval.createdAt)}
              >
                {formatRelative(approval.createdAt)}
              </span>
            </DetailItem>
            <DetailItem label="Tarefa de origem">
              {approval.task ? (
                <Link
                  href={`/projetos/${approval.project.id}?tarefa=${approval.task.id}`}
                  className="hover:underline"
                >
                  <EntityCode code={approval.task.code} /> {approval.task.title}
                </Link>
              ) : (
                '—'
              )}
            </DetailItem>
            <DetailItem label="Prazo para decisão">
              {approval.dueDate ? formatDate(approval.dueDate) : '—'}
            </DetailItem>
          </DetailList>

          {approval.description && (
            <p className="text-default text-sm whitespace-pre-line">{approval.description}</p>
          )}

          <section className="flex flex-col gap-3" aria-label="Versões">
            <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">Versões</h3>
            <ol className="flex flex-col gap-3">
              {approval.versions.map((version) => (
                <VersionCard
                  key={version.id}
                  version={version}
                  current={version.version === approval.currentVersion}
                />
              ))}
            </ol>
          </section>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

// ── Faixa de status: o que precisa acontecer agora ───────────────────────────

function StatusBanner({
  approval,
  approverLabel,
  canWrite,
  canDecide,
  selfSubmitted,
}: {
  approval: ApprovalDetail
  approverLabel: string
  canWrite: boolean
  canDecide: boolean
  selfSubmitted: boolean
}) {
  const current = approval.versions.find((version) => version.version === approval.currentVersion)

  if (approval.status === 'pending') {
    return (
      <div className="border-warning-border bg-warning-soft flex flex-col gap-3 rounded-lg border px-4 py-3">
        <p className="text-sm">
          <span className="text-strong font-medium">
            v{approval.currentVersion} aguardando decisão
          </span>
          <span className="text-muted"> de {approverLabel}.</span>
          {approval.approverContact && canDecide && (
            <span className="text-muted block text-xs">
              Registre aqui a decisão que o cliente deu por reunião, e-mail ou mensagem.
            </span>
          )}
        </p>
        {canDecide && current && (
          <div className="flex flex-wrap gap-2">
            <DecisionDialog
              approvalId={approval.id}
              version={current.version}
              decision="approved"
            />
            <DecisionDialog
              approvalId={approval.id}
              version={current.version}
              decision="changes_requested"
            />
          </div>
        )}
        {selfSubmitted && (
          <p className="text-muted text-xs">
            Você enviou esta versão — a decisão precisa ser de outra pessoa.
          </p>
        )}
      </div>
    )
  }

  if (approval.status === 'changes_requested') {
    return (
      <div className="border-accent-border bg-accent-soft flex flex-col gap-3 rounded-lg border px-4 py-3">
        <p className="text-sm">
          <span className="text-strong font-medium">
            Ajustes solicitados na v{approval.currentVersion}.
          </span>
          <span className="text-muted">
            {' '}
            Revise o material e envie a v{approval.currentVersion + 1}.
          </span>
        </p>
        {current?.decisionComment && (
          <blockquote className="text-default border-accent-border border-l-2 pl-3 text-sm whitespace-pre-line">
            {current.decisionComment}
          </blockquote>
        )}
        {canWrite && (
          <div>
            <NewVersionDialog approvalId={approval.id} nextVersion={approval.currentVersion + 1} />
          </div>
        )}
      </div>
    )
  }

  if (approval.status === 'approved') {
    return (
      <div className="border-success-border bg-success-soft text-success-text rounded-lg border px-4 py-3 text-sm">
        <span className="font-medium">v{approval.currentVersion} aprovada</span>
        {approval.decidedAt && <> em {formatDateTime(approval.decidedAt)}</>}
        {current?.decidedBy && <> · registrado por {current.decidedBy.name}</>}.
      </div>
    )
  }

  return (
    <div className="border-line bg-neutral-soft text-muted rounded-lg border px-4 py-3 text-sm">
      Aprovação cancelada. O histórico das versões continua abaixo.
    </div>
  )
}

// ── Versão ───────────────────────────────────────────────────────────────────

function VersionCard({ version, current }: { version: ApprovalVersionDetail; current: boolean }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border px-4 py-3',
        current ? 'border-line-strong bg-raised' : 'border-line bg-sunken',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-strong font-mono text-sm font-semibold">v{version.version}</span>
        <StatusBadge map={APPROVAL_STATUS} value={version.status} />
        <span className="text-2xs text-muted" title={formatDateTime(version.submittedAt)}>
          enviada por {version.submittedBy?.name ?? '—'} · {formatRelative(version.submittedAt)}
        </span>
      </div>

      {version.notes && <p className="text-default text-sm whitespace-pre-line">{version.notes}</p>}

      {version.files && (
        <div className="border-line -mx-4 border-t pt-1">
          <FileList
            {...version.files}
            bare
            emptyDescription="Arraste o material desta versão para cá ou use o botão Enviar."
          />
        </div>
      )}

      {version.decidedAt && (
        <div className="border-line flex flex-col gap-1 border-t pt-2 text-sm">
          <span className="text-2xs text-muted" title={formatDateTime(version.decidedAt)}>
            {version.status === 'approved'
              ? 'Aprovada'
              : version.status === 'changes_requested'
                ? 'Ajustes solicitados'
                : 'Encerrada'}{' '}
            por {version.decidedBy?.name ?? '—'} · {formatDateTime(version.decidedAt)}
          </span>
          {version.decisionComment && (
            <p className="text-default whitespace-pre-line">{version.decisionComment}</p>
          )}
        </div>
      )}
    </li>
  )
}

// ── Ações ────────────────────────────────────────────────────────────────────

function useRefreshingAction(
  action: (previous: unknown, formData: FormData) => Promise<ActionState<unknown>>,
  onSuccess: () => void,
) {
  const router = useRouter()
  return useActionState(async (previous: ActionState<unknown>, formData: FormData) => {
    const result = await action(previous, formData)
    if (result.status === 'success') {
      toast.success(result.message ?? 'Feito.')
      onSuccess()
      router.refresh()
    }
    return result
  }, idleState as ActionState<unknown>)
}

function DecisionDialog({
  approvalId,
  version,
  decision,
}: {
  approvalId: string
  version: number
  decision: 'approved' | 'changes_requested'
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useRefreshingAction(decideApprovalAction, () => setOpen(false))
  const approving = decision === 'approved'

  return (
    <>
      <Button
        variant={approving ? 'primary' : 'secondary'}
        size="sm"
        icon={approving ? <Check /> : <MessageSquareWarning />}
        onClick={() => setOpen(true)}
      >
        {approving ? `Aprovar v${version}` : 'Solicitar ajustes'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title={approving ? `Aprovar v${version}` : `Solicitar ajustes na v${version}`}
            description={
              approving
                ? 'A aprovação é final. Se o cliente pedir mudanças depois, abra uma nova aprovação.'
                : `A v${version} fica registrada com o seu comentário e a equipe envia a v${version + 1}.`
            }
          />
          <form action={formAction} className="contents">
            <input type="hidden" name="approvalId" value={approvalId} />
            <input type="hidden" name="version" value={version} />
            <input type="hidden" name="decision" value={decision} />
            <DialogBody className="flex flex-col gap-3">
              <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
              <Field
                label={approving ? 'Comentário' : 'Ajustes solicitados'}
                required={!approving}
                error={state.status === 'error' ? state.fieldErrors?.comment?.[0] : undefined}
              >
                {(props) => (
                  <Textarea
                    {...props}
                    name="comment"
                    rows={4}
                    required={!approving}
                    autoFocus
                    placeholder={
                      approving
                        ? 'Opcional. Ex.: aprovado pelo cliente em reunião de 12/03.'
                        : 'O que precisa mudar, com o máximo de clareza possível.'
                    }
                  />
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <SubmitButton>{approving ? 'Aprovar' : 'Solicitar ajustes'}</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function NewVersionDialog({
  approvalId,
  nextVersion,
}: {
  approvalId: string
  nextVersion: number
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useRefreshingAction(submitNewVersionAction, () => setOpen(false))

  return (
    <>
      <Button variant="primary" size="sm" icon={<Send />} onClick={() => setOpen(true)}>
        Enviar v{nextVersion}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title={`Enviar v${nextVersion}`}
            description="Depois de enviar, anexe o material revisado na nova versão."
          />
          <form action={formAction} className="contents">
            <input type="hidden" name="approvalId" value={approvalId} />
            <DialogBody className="flex flex-col gap-3">
              <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
              <Field
                label="O que mudou"
                required
                error={state.status === 'error' ? state.fieldErrors?.notes?.[0] : undefined}
              >
                {(props) => (
                  <Textarea
                    {...props}
                    name="notes"
                    rows={4}
                    required
                    autoFocus
                    placeholder="Responda a cada ajuste pedido."
                  />
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <SubmitButton>Enviar v{nextVersion}</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Drawer para `?aprovacao=` inexistente ou sem acesso. */
export function MissingApprovalDrawer() {
  const router = useRouter()
  const closeHref = useCloseHref()
  return (
    <Drawer open onOpenChange={(next) => !next && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="sm">
        <DrawerHeader title="Aprovação não encontrada" />
        <DrawerBody className="text-muted px-5 py-4 text-sm">
          Ela pode ter sido removida junto com o projeto, ou você não tem acesso a aprovações.
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
