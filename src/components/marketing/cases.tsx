'use client'

import {
  BadgeCheck,
  ExternalLink,
  Plus,
  RotateCcw,
  Send,
  ShieldQuestion,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState } from 'react'
import { toast } from 'sonner'

import { FileList } from '@/components/files/file-list'
import { ActionButton } from '@/components/ui/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@/components/ui/drawer'
import { DrawerLink, useCloseDrawerHref } from '@/components/ui/drawer-link'
import { Field } from '@/components/ui/field'
import { FormErrorBanner, SubmitButton } from '@/components/ui/form-helpers'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { EntityCode } from '@/components/ui/misc'
import { Panel } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { idleState, type ActionState } from '@/server/action-state'
import {
  createCaseAction,
  moveCaseAction,
  publishCaseAction,
  recordCaseAuthorizationAction,
  requestCaseAuthorizationAgainAction,
  updateCaseContentAction,
} from '@/server/modules/marketing/actions'
import type { CaseDetail, CaseRow } from '@/server/modules/marketing/queries'
import { CASE_STATUS } from '@/shared/domain'

function useFormAction(
  action: (previous: unknown, formData: FormData) => Promise<ActionState<unknown>>,
  onSuccess: (result: ActionState<unknown>) => void,
) {
  return useActionState(async (previous: ActionState<unknown>, formData: FormData) => {
    const result = await action(previous, formData)
    if (result.status === 'success') {
      toast.success(result.message ?? 'Feito.')
      onSuccess(result)
    }
    return result
  }, idleState as ActionState<unknown>)
}

// ── Criação ──────────────────────────────────────────────────────────────────

export function CaseCreateDialog({
  projects,
  owners,
}: {
  projects: { id: string; code: string; name: string; clientName: string }[]
  owners: { id: string; name: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  const [state, formAction] = useFormAction(createCaseAction, (result) => {
    setOpen(false)
    const id = (result.data as { id?: string } | undefined)?.id
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('case', id)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  })
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md" icon={<Plus />} disabled={projects.length === 0}>
          Novo case
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader
          title="Novo case"
          description="O case nasce aguardando a autorização do cliente — sem ela, não entra em produção."
        />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
            <Field
              label="Projeto entregue"
              required
              hint="Projetos lançados ou concluídos que ainda não têm case."
              error={errors?.projectId?.[0]}
            >
              {(props) => (
                <NativeSelect {...props} name="projectId" defaultValue="" required>
                  <option value="" disabled>
                    Selecione
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} · {project.name} — {project.clientName}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Título" required error={errors?.title?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  required
                  placeholder="Ex.: Aurora Clínica — do briefing ao lançamento"
                />
              )}
            </Field>
            <Field label="Responsável" error={errors?.ownerId?.[0]}>
              {(props) => (
                <NativeSelect {...props} name="ownerId" defaultValue="">
                  <option value="">Eu mesmo</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>Abrir case</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Lista ────────────────────────────────────────────────────────────────────

export function CaseList({ items }: { items: CaseRow[] }) {
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={<BadgeCheck />}
          title="Nenhum case"
          description="Cases saem de projetos entregues, com autorização do cliente registrada."
        />
      </Panel>
    )
  }
  return (
    <Panel>
      <ul className="divide-y divide-[var(--line-subtle)]">
        {items.map((item) => (
          <li key={item.id}>
            <DrawerLink
              param="case"
              id={item.id}
              className="hover:bg-hover flex items-center gap-3 px-4 py-3 transition-colors"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-strong flex items-center gap-1.5 truncate text-sm font-medium">
                  <EntityCode code={item.code} /> {item.title}
                </span>
                <span className="text-2xs text-muted truncate">
                  {item.client.name} · {item.project.name}
                  {item.status === 'pending_authorization' && item.authorizationRequestedAt && (
                    <> · pedido {formatRelative(item.authorizationRequestedAt)}</>
                  )}
                </span>
              </div>
              <StatusBadge map={CASE_STATUS} value={item.status} />
            </DrawerLink>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ── Drawer ───────────────────────────────────────────────────────────────────

/**
 * Drawer do case. A trilha de autorização fica no topo, porque é ela que
 * decide o que pode acontecer: sem autorização registrada, o texto pode ser
 * rascunhado, mas o case não entra em produção nem é publicado.
 */
export function CaseDrawer({
  item,
  owners,
  permissions,
}: {
  item: CaseDetail
  owners: { id: string; name: string }[]
  permissions: { canWrite: boolean; canPublish: boolean }
}) {
  const router = useRouter()
  const closeHref = useCloseDrawerHref('case')
  const canWrite = permissions.canWrite

  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="lg">
        <DrawerHeader
          meta={
            <>
              <EntityCode code={item.code} />
              <span>·</span>
              <Link href={`/clientes/${item.client.id}`} className="hover:underline">
                {item.client.name}
              </Link>
              <span>·</span>
              <Link href={`/projetos/${item.project.id}`} className="hover:underline">
                {item.project.name}
              </Link>
            </>
          }
          title={item.title}
        />
        <DrawerBody className="flex flex-col gap-5 px-5 py-4">
          <div className="flex items-center gap-2">
            <StatusBadge map={CASE_STATUS} value={item.status} size="md" />
            {item.owner && <span className="text-muted text-xs">· {item.owner.name}</span>}
          </div>

          <AuthorizationBlock item={item} canWrite={canWrite} canPublish={permissions.canPublish} />

          {canWrite && item.status !== 'published' && item.status !== 'denied' ? (
            <CaseContentForm item={item} owners={owners} />
          ) : (
            <CaseText item={item} />
          )}

          {item.files && (
            <FileList
              {...item.files}
              title="Material"
              description="Prints, depoimentos, autorização assinada."
            />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

function AuthorizationBlock({
  item,
  canWrite,
  canPublish,
}: {
  item: CaseDetail
  canWrite: boolean
  canPublish: boolean
}) {
  switch (item.status) {
    case 'pending_authorization':
      return (
        <div className="border-warning-border bg-warning-soft flex flex-col gap-3 rounded-lg border px-4 py-3">
          <p className="flex items-start gap-2 text-sm">
            <ShieldQuestion className="text-warning mt-0.5 size-4 shrink-0" />
            <span>
              <span className="text-strong font-medium">Aguardando autorização do cliente.</span>{' '}
              <span className="text-muted">
                Pedida{' '}
                {item.authorizationRequestedAt
                  ? formatRelative(item.authorizationRequestedAt)
                  : '—'}
                . Registre a resposta assim que ela vier — quem respondeu e como.
              </span>
            </span>
          </p>
          {canWrite && <AuthorizationDialog item={item} />}
        </div>
      )
    case 'denied':
      return (
        <div className="border-danger-border bg-danger-soft flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm">
          <span className="text-danger-text font-medium">
            O cliente não autorizou{item.deniedAt ? ` (${formatDate(item.deniedAt)})` : ''}.
          </span>
          {item.authorizationNotes && (
            <span className="text-default whitespace-pre-line">{item.authorizationNotes}</span>
          )}
          {canWrite && (
            <div>
              <ActionButton
                icon={<RotateCcw />}
                action={() => requestCaseAuthorizationAgainAction(item.id)}
              >
                Pedir novamente
              </ActionButton>
            </div>
          )}
        </div>
      )
    default:
      return (
        <div className="border-success-border bg-success-soft flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm">
          <span className="text-success-text flex items-center gap-1.5 font-medium">
            <BadgeCheck className="size-4" />
            Autorizado por {item.authorizedBy?.name ?? '—'}
            {item.authorizedBy?.jobTitle ? ` (${item.authorizedBy.jobTitle})` : ''} em{' '}
            {item.authorizedAt ? formatDate(item.authorizedAt) : '—'}
          </span>
          {item.authorizationNotes && (
            <span className="text-default whitespace-pre-line">{item.authorizationNotes}</span>
          )}
          {item.status === 'published' && item.publishedUrl && (
            <a
              href={item.publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-text flex items-center gap-1.5 hover:underline"
            >
              <ExternalLink className="size-3.5" /> Publicado{' '}
              {item.publishedAt ? formatDateTime(item.publishedAt) : ''}
            </a>
          )}
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {item.status === 'authorized' && (
                <ActionButton
                  icon={<Wrench />}
                  variant="primary"
                  action={() => moveCaseAction(item.id, 'in_production')}
                >
                  Iniciar produção
                </ActionButton>
              )}
              {item.status === 'in_production' && (
                <ActionButton
                  icon={<Send />}
                  variant="primary"
                  action={() => moveCaseAction(item.id, 'review')}
                >
                  Enviar para revisão
                </ActionButton>
              )}
              {item.status === 'review' && (
                <>
                  {canPublish && <PublishCaseDialog caseId={item.id} />}
                  <ActionButton
                    icon={<RotateCcw />}
                    action={() => moveCaseAction(item.id, 'in_production')}
                  >
                    Voltar para produção
                  </ActionButton>
                </>
              )}
            </div>
          )}
        </div>
      )
  }
}

function AuthorizationDialog({ item }: { item: CaseDetail }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [decision, setDecision] = useState<'authorized' | 'denied'>('authorized')
  const [state, formAction] = useFormAction(recordCaseAuthorizationAction, () => {
    setOpen(false)
    router.refresh()
  })
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" className="self-start">
          Registrar resposta do cliente
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader
          title="Resposta do cliente"
          description="A autorização é o que permite usar o projeto em nome da Kyvon. Registre de onde ela veio."
        />
        <form action={formAction} className="contents">
          <input type="hidden" name="caseId" value={item.id} />
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
            <Field label="Resposta" required>
              {(props) => (
                <NativeSelect
                  {...props}
                  name="decision"
                  value={decision}
                  onChange={(event) => setDecision(event.target.value as 'authorized' | 'denied')}
                >
                  <option value="authorized">Autorizou</option>
                  <option value="denied">Não autorizou</option>
                </NativeSelect>
              )}
            </Field>
            {decision === 'authorized' && (
              <Field label="Quem autorizou" required error={errors?.contactId?.[0]}>
                {(props) => (
                  <NativeSelect {...props} name="contactId" defaultValue="" required>
                    <option value="" disabled>
                      Selecione o contato
                    </option>
                    {item.clientContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                        {contact.jobTitle ? ` · ${contact.jobTitle}` : ''}
                        {contact.canApprove ? ' · aprovador' : ''}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            )}
            <Field label="Como foi dada" required error={errors?.notes?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="notes"
                  rows={3}
                  required
                  placeholder="Ex.: e-mail de 12/09 autorizando uso de logo, telas e números."
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <SubmitButton>Registrar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PublishCaseDialog({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction] = useFormAction(publishCaseAction, () => {
    setOpen(false)
    router.refresh()
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" icon={<ExternalLink />}>
          Publicar
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader
          title="Publicar case"
          description="Publicado é final — o texto não muda mais."
        />
        <form action={formAction} className="contents">
          <input type="hidden" name="caseId" value={caseId} />
          <DialogBody>
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
            <Field
              label="Link publicado"
              required
              error={state.status === 'error' ? state.fieldErrors?.publishedUrl?.[0] : undefined}
            >
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
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <SubmitButton>Publicar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const SECTIONS = [
  ['summary', 'Resumo', 'Uma frase: quem é o cliente e o que mudou.'],
  ['challenge', 'Desafio', 'O problema de negócio antes do projeto.'],
  ['solution', 'Solução', 'O que foi feito e por quê.'],
  ['results', 'Resultados', 'Números, prazos, depoimentos — com a fonte.'],
] as const

function CaseContentForm({
  item,
  owners,
}: {
  item: CaseDetail
  owners: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [state, formAction] = useFormAction(
    (previous, formData) => updateCaseContentAction(item.id, previous, formData),
    () => router.refresh(),
  )
  const errors = state.status === 'error' ? state.fieldErrors : undefined

  return (
    <form
      action={formAction}
      className="border-line flex flex-col gap-3 rounded-lg border px-4 py-3"
    >
      <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field label="Título" required error={errors?.title?.[0]}>
          {(props) => <Input {...props} name="title" defaultValue={item.title} required />}
        </Field>
        <Field label="Responsável" error={errors?.ownerId?.[0]}>
          {(props) => (
            <NativeSelect {...props} name="ownerId" defaultValue={item.owner?.id ?? ''}>
              <option value="">Sem responsável</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      {SECTIONS.map(([name, label, hint]) => (
        <Field key={name} label={label} hint={hint} error={errors?.[name]?.[0]}>
          {(props) => <Textarea {...props} name={name} rows={3} defaultValue={item[name] ?? ''} />}
        </Field>
      ))}
      <div className="flex justify-end">
        <SubmitButton size="sm">Salvar texto</SubmitButton>
      </div>
    </form>
  )
}

function CaseText({ item }: { item: CaseDetail }) {
  const filled = SECTIONS.filter(([name]) => item[name])
  if (filled.length === 0)
    return <p className="text-muted text-sm">Texto do case ainda não escrito.</p>
  return (
    <div className="flex flex-col gap-4">
      {filled.map(([name, label]) => (
        <section key={name} className="flex flex-col gap-1">
          <h3 className="text-2xs text-subtle font-semibold tracking-wide uppercase">{label}</h3>
          <p className="text-default text-sm whitespace-pre-line">{item[name]}</p>
        </section>
      ))}
    </div>
  )
}

export function MissingCaseDrawer() {
  const router = useRouter()
  const closeHref = useCloseDrawerHref('case')
  return (
    <Drawer open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <DrawerContent size="sm">
        <DrawerHeader title="Case não encontrado" />
        <DrawerBody className="text-muted px-5 py-4 text-sm">
          Ele pode ter sido removido junto com o projeto, ou você não tem acesso a cases.
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
