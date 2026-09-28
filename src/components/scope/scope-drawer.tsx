'use client'

import { Check, CheckCheck, FileStack, Send, Undo2, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState } from 'react'
import { toast } from 'sonner'

import { FileList } from '@/components/files/file-list'
import { ActionButton } from '@/components/ui/action-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Input, Textarea } from '@/components/ui/input'
import { DetailItem, DetailList, EntityCode } from '@/components/ui/misc'
import { RestrictedValue } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { CheckboxField } from '@/components/ui/toggle'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDayImpact,
  formatHours,
  formatRelative,
} from '@/lib/format'
import { idleState, type ActionState } from '@/server/action-state'
import {
  decideScopeChangeAction,
  generateAddendumFromScopeAction,
  markScopeImplementedAction,
  returnScopeToAnalysisAction,
  saveScopeAnalysisAction,
  submitScopeForApprovalAction,
} from '@/server/modules/scope/actions'
import type { ScopeChangeDetail } from '@/server/modules/scope/queries'
import { SCOPE_CHANGE_ORIGIN, SCOPE_CHANGE_STATUS } from '@/shared/domain'
import { addDaysISO } from '@/shared/dates'

export interface ScopeDrawerPermissions {
  canWrite: boolean
  canDecide: boolean
  canEditProject: boolean
  canGenerateAddendum: boolean
}

function useCloseHref(): string {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.delete('escopo')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/**
 * Drawer da mudança de escopo.
 *
 * A faixa no topo diz o que precisa acontecer agora e oferece exatamente a
 * ação daquele momento — analisar, enviar, decidir, implementar, gerar
 * aditivo. O contrato não aparece como editável em nenhum ponto.
 */
export function ScopeDrawer({
  change,
  permissions,
}: {
  change: ScopeChangeDetail
  permissions: ScopeDrawerPermissions
}) {
  const router = useRouter()
  const closeHref = useCloseHref()
  const projectClosed =
    change.project.status === 'completed' || change.project.status === 'cancelled'
  const analysisOpen = change.status === 'requested' || change.status === 'under_analysis'

  return (
    <Drawer open onOpenChange={(next) => !next && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="lg">
        <DrawerHeader
          meta={
            <>
              <EntityCode code={change.code} />
              <span>·</span>
              <Link href={`/projetos/${change.project.id}`} className="hover:underline">
                {change.project.name}
              </Link>
              {change.contract && (
                <>
                  <span>·</span>
                  <Link href={`/contratos/${change.contract.id}`} className="hover:underline">
                    {change.contract.code}
                  </Link>
                </>
              )}
            </>
          }
          title={change.title}
        />

        <DrawerBody className="flex flex-col gap-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={SCOPE_CHANGE_STATUS} value={change.status} size="md" />
            <Badge tone={SCOPE_CHANGE_ORIGIN[change.origin].tone} size="sm">
              Origem: {SCOPE_CHANGE_ORIGIN[change.origin].label}
            </Badge>
          </div>

          <NextStep change={change} permissions={permissions} projectClosed={projectClosed} />

          <section className="flex flex-col gap-1">
            <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">
              O que foi pedido
            </h3>
            <p className="text-default text-sm whitespace-pre-line">{change.description}</p>
          </section>

          {analysisOpen && permissions.canWrite && !projectClosed ? (
            <AnalysisForm change={change} />
          ) : (
            <ImpactSummary change={change} />
          )}

          <DetailList>
            <DetailItem label="Registrada por">
              {change.requester?.name ?? '—'}
              <span className="text-2xs text-muted block" title={formatDateTime(change.createdAt)}>
                {formatRelative(change.createdAt)}
              </span>
            </DetailItem>
            <DetailItem label="Análise">{change.analyzer?.name ?? '—'}</DetailItem>
            <DetailItem label="Decisão">
              {change.decider ? (
                <>
                  {change.decider.name}
                  {change.decidedAt && (
                    <span className="text-2xs text-muted block">
                      {formatDateTime(change.decidedAt)}
                    </span>
                  )}
                </>
              ) : (
                '—'
              )}
            </DetailItem>
            <DetailItem label="Aditivo">
              {change.addendum && change.contract ? (
                <Link href={`/contratos/${change.contract.id}`} className="hover:underline">
                  {change.addendum.code}
                </Link>
              ) : (
                '—'
              )}
            </DetailItem>
          </DetailList>

          {change.files && (
            <FileList {...change.files} title="Anexos" description="E-mails, prints, orçamentos." />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

// ── Próximo passo ────────────────────────────────────────────────────────────

function NextStep({
  change,
  permissions,
  projectClosed,
}: {
  change: ScopeChangeDetail
  permissions: ScopeDrawerPermissions
  projectClosed: boolean
}) {
  const complete =
    Boolean(change.impactDescription) &&
    change.estimatedHours !== null &&
    change.deadlineImpactDays !== null

  switch (change.status) {
    case 'requested':
    case 'under_analysis':
      return (
        <Banner tone="neutral">
          <p className="text-sm">
            <span className="text-strong font-medium">
              {change.status === 'requested' ? 'Aguardando análise de impacto.' : 'Em análise.'}
            </span>{' '}
            <span className="text-muted">
              Meça horas, prazo e valor; depois envie para quem decide.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {permissions.canWrite &&
              change.status === 'under_analysis' &&
              complete &&
              !projectClosed && (
                <ActionButton
                  icon={<Send />}
                  variant="primary"
                  action={() => submitScopeForApprovalAction(change.id)}
                >
                  Enviar para aprovação
                </ActionButton>
              )}
            {permissions.canDecide && (
              <DecisionDialog change={change} decision="rejected" canEditProject={false} />
            )}
          </div>
        </Banner>
      )

    case 'awaiting_approval':
      return (
        <Banner tone="warning">
          <p className="text-sm">
            <span className="text-strong font-medium">Aguardando decisão.</span>{' '}
            <span className="text-muted">
              Aprovar não altera o contrato — o aditivo é gerado em seguida, em rascunho.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {permissions.canDecide && (
              <>
                <DecisionDialog
                  change={change}
                  decision="approved"
                  canEditProject={permissions.canEditProject}
                />
                <DecisionDialog change={change} decision="rejected" canEditProject={false} />
              </>
            )}
            {(permissions.canWrite || permissions.canDecide) && (
              <ActionButton icon={<Undo2 />} action={() => returnScopeToAnalysisAction(change.id)}>
                Voltar para análise
              </ActionButton>
            )}
          </div>
        </Banner>
      )

    case 'approved':
    case 'implemented': {
      const needsAddendum = Boolean(change.contract) && !change.addendum
      return (
        <Banner tone="success">
          <p className="text-sm">
            <span className="text-strong font-medium">
              {change.status === 'approved' ? 'Aprovada' : 'Implementada'}
            </span>
            {change.status === 'implemented' && change.implementedAt && (
              <span className="text-muted"> em {formatDate(change.implementedAt)}</span>
            )}
            .{' '}
            {needsAddendum && (
              <span className="text-muted">
                O contrato ainda não reflete esta mudança — gere o aditivo para formalizar.
              </span>
            )}
            {!change.contract && (
              <span className="text-muted">Projeto sem contrato: não há aditivo a gerar.</span>
            )}
          </p>
          {change.decisionComment && (
            <p className="text-default text-sm whitespace-pre-line">{change.decisionComment}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {needsAddendum && permissions.canGenerateAddendum && (
              <ActionButton
                icon={<FileStack />}
                variant="primary"
                action={() => generateAddendumFromScopeAction(change.id)}
              >
                Gerar aditivo
              </ActionButton>
            )}
            {change.status === 'approved' && permissions.canWrite && (
              <ActionButton
                icon={<CheckCheck />}
                action={() => markScopeImplementedAction(change.id)}
              >
                Marcar como implementada
              </ActionButton>
            )}
          </div>
        </Banner>
      )
    }

    case 'rejected':
      return (
        <Banner tone="neutral">
          <p className="text-sm">
            <span className="text-strong font-medium">Recusada.</span>
          </p>
          {change.decisionComment && (
            <p className="text-default text-sm whitespace-pre-line">{change.decisionComment}</p>
          )}
        </Banner>
      )
  }
}

const BANNER_TONES = {
  neutral: 'border-line bg-sunken',
  warning: 'border-warning-border bg-warning-soft',
  success: 'border-success-border bg-success-soft',
} as const

function Banner({
  tone,
  children,
}: {
  tone: keyof typeof BANNER_TONES
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-lg border px-4 py-3 ${BANNER_TONES[tone]}`}>
      {children}
    </div>
  )
}

// ── Impacto ──────────────────────────────────────────────────────────────────

function ImpactSummary({ change }: { change: ScopeChangeDetail }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">Impacto</h3>
      <div className="border-line grid gap-px overflow-hidden rounded-lg border bg-[var(--line-subtle)] sm:grid-cols-3">
        <ImpactCell label="Horas">
          {change.estimatedHours === null ? '—' : formatHours(change.estimatedHours)}
        </ImpactCell>
        <ImpactCell label="Prazo">
          {change.deadlineImpactDays === null ? '—' : formatDayImpact(change.deadlineImpactDays)}
        </ImpactCell>
        <ImpactCell label="Valor">
          {change.financialRestricted ? (
            <RestrictedValue />
          ) : change.financialImpact === null ? (
            '—'
          ) : (
            formatCurrency(change.financialImpact)
          )}
        </ImpactCell>
      </div>
      {change.impactDescription ? (
        <p className="text-default text-sm whitespace-pre-line">{change.impactDescription}</p>
      ) : (
        <p className="text-muted text-sm">Impacto ainda não analisado.</p>
      )}
    </section>
  )
}

function ImpactCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-raised flex flex-col gap-0.5 px-4 py-3">
      <span className="text-2xs text-subtle tracking-wide uppercase">{label}</span>
      <span className="text-strong text-sm font-medium" data-tabular>
        {children}
      </span>
    </div>
  )
}

function AnalysisForm({ change }: { change: ScopeChangeDetail }) {
  const router = useRouter()
  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result = await saveScopeAnalysisAction(change.id, previous, formData)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Salvo.')
        router.refresh()
      }
      return result as ActionState<unknown>
    },
    idleState as ActionState<unknown>,
  )
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <form
      action={formAction}
      className="border-line flex flex-col gap-3 rounded-lg border px-4 py-3"
    >
      <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">
        Análise de impacto
      </h3>
      <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />

      <Field label="Impacto" required error={errors?.impactDescription?.[0]}>
        {(props) => (
          <Textarea
            {...props}
            name="impactDescription"
            rows={4}
            defaultValue={change.impactDescription ?? ''}
            placeholder="O que muda na entrega, dependências, riscos."
            required
          />
        )}
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Horas" required hint="0 se nenhuma." error={errors?.estimatedHours?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="estimatedHours"
              inputMode="decimal"
              defaultValue={
                change.estimatedHours ? String(Number(change.estimatedHours)).replace('.', ',') : ''
              }
              required
            />
          )}
        </Field>
        <Field
          label="Prazo (dias)"
          required
          hint="Negativo se encurta."
          error={errors?.deadlineImpactDays?.[0]}
        >
          {(props) => (
            <Input
              {...props}
              name="deadlineImpactDays"
              inputMode="numeric"
              defaultValue={change.deadlineImpactDays ?? ''}
              required
            />
          )}
        </Field>
        {change.financialRestricted ? (
          <div className="flex flex-col gap-1">
            <span className="text-default text-xs font-medium">Valor</span>
            <span className="text-muted text-xs">
              Restrito — alguém com acesso a valores completa este campo.
            </span>
          </div>
        ) : (
          <Field label="Valor (R$)" hint="Negativo se reduz." error={errors?.financialImpact?.[0]}>
            {(props) => (
              <Input
                {...props}
                name="financialImpact"
                inputMode="decimal"
                defaultValue={
                  change.financialImpact
                    ? Number(change.financialImpact).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })
                    : ''
                }
              />
            )}
          </Field>
        )}
      </div>

      <div className="flex justify-end">
        <SubmitButton size="sm">Salvar análise</SubmitButton>
      </div>
    </form>
  )
}

// ── Decisão ──────────────────────────────────────────────────────────────────

function DecisionDialog({
  change,
  decision,
  canEditProject,
}: {
  change: ScopeChangeDetail
  decision: 'approved' | 'rejected'
  canEditProject: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const approving = decision === 'approved'

  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result = await decideScopeChangeAction(previous, formData)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Feito.')
        setOpen(false)
        router.refresh()
      }
      return result as ActionState<unknown>
    },
    idleState as ActionState<unknown>,
  )

  const days = change.deadlineImpactDays ?? 0
  const canApplyDeadline =
    approving && canEditProject && days !== 0 && Boolean(change.project.dueDate)

  return (
    <>
      <Button
        variant={approving ? 'primary' : 'danger-ghost'}
        size="sm"
        icon={approving ? <Check /> : <X />}
        onClick={() => setOpen(true)}
      >
        {approving ? 'Aprovar' : 'Recusar'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title={approving ? 'Aprovar mudança de escopo' : 'Recusar mudança de escopo'}
            description={
              approving
                ? 'O escopo do contrato continua como está. Depois de aprovar, gere o aditivo para formalizar.'
                : 'A recusa é final e o motivo fica registrado.'
            }
          />
          <form action={formAction} className="contents">
            <input type="hidden" name="scopeChangeId" value={change.id} />
            <input type="hidden" name="decision" value={decision} />
            <DialogBody className="flex flex-col gap-4">
              <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
              <Field
                label={approving ? 'Comentário' : 'Motivo'}
                required={!approving}
                error={state.status === 'error' ? state.fieldErrors?.comment?.[0] : undefined}
              >
                {(props) => (
                  <Textarea {...props} name="comment" rows={3} required={!approving} autoFocus />
                )}
              </Field>
              {canApplyDeadline && change.project.dueDate && (
                <CheckboxField
                  name="applyDeadline"
                  defaultChecked
                  label={`Ajustar o prazo do projeto (${formatDayImpact(days)})`}
                  description={`De ${formatDate(change.project.dueDate)} para ${formatDate(addDaysISO(change.project.dueDate, days))}.`}
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <SubmitButton variant={approving ? 'primary' : 'danger'}>
                {approving ? 'Aprovar' : 'Recusar'}
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function MissingScopeDrawer() {
  const router = useRouter()
  const closeHref = useCloseHref()
  return (
    <Drawer open onOpenChange={(next) => !next && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="sm">
        <DrawerHeader title="Mudança de escopo não encontrada" />
        <DrawerBody className="text-muted px-5 py-4 text-sm">
          Ela pode ter sido removida junto com o projeto, ou você não tem acesso a mudanças de
          escopo.
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
