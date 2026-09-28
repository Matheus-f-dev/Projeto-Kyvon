'use client'

import { Megaphone, Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { Panel } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCurrency, formatShortDate } from '@/lib/format'
import { idleState, type ActionState } from '@/server/action-state'
import { createCampaignAction, updateCampaignAction } from '@/server/modules/marketing/actions'
import type { CampaignRow } from '@/server/modules/marketing/queries'
import { CAMPAIGN_STATUS } from '@/shared/domain'
import { campaignStatusValues } from '@/shared/schemas/marketing'

export function CampaignFormDialog({
  owners,
  campaign,
  trigger,
}: {
  owners: { id: string; name: string }[]
  campaign?: CampaignRow
  trigger?: ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [state, formAction] = useActionState(
    async (previous: ActionState<unknown>, formData: FormData) => {
      const result = campaign
        ? await updateCampaignAction(campaign.id, previous, formData)
        : await createCampaignAction(previous, formData)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Salvo.')
        setOpen(false)
        router.refresh()
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
            Nova campanha
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader title={campaign ? 'Editar campanha' : 'Nova campanha'} />
        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorBanner message={state.status === 'error' ? state.message : undefined} />
            <Field label="Nome" required error={errors?.name?.[0]}>
              {(props) => (
                <Input {...props} name="name" defaultValue={campaign?.name} required autoFocus />
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status" error={errors?.status?.[0]}>
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="status"
                    defaultValue={campaign?.status ?? 'planned'}
                  >
                    {campaignStatusValues.map((value) => (
                      <option key={value} value={value}>
                        {CAMPAIGN_STATUS[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Responsável" error={errors?.ownerId?.[0]}>
                {(props) => (
                  <NativeSelect {...props} name="ownerId" defaultValue={campaign?.owner?.id ?? ''}>
                    <option value="">Sem responsável</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Início" error={errors?.startDate?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    name="startDate"
                    defaultValue={campaign?.startDate ?? ''}
                  />
                )}
              </Field>
              <Field label="Fim" error={errors?.endDate?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    name="endDate"
                    defaultValue={campaign?.endDate ?? ''}
                  />
                )}
              </Field>
              <Field label="Verba (R$)" error={errors?.budget?.[0]}>
                {(props) => (
                  <Input
                    {...props}
                    name="budget"
                    inputMode="decimal"
                    defaultValue={
                      campaign?.budget
                        ? Number(campaign.budget).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })
                        : ''
                    }
                  />
                )}
              </Field>
            </div>
            <Field label="Objetivo" error={errors?.objective?.[0]}>
              {(props) => (
                <Textarea
                  {...props}
                  name="objective"
                  rows={3}
                  defaultValue={campaign?.objective ?? ''}
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton>{campaign ? 'Salvar' : 'Criar'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Campanhas com o andamento dos conteúdos — publicados sobre o total. */
export function CampaignList({
  campaigns,
  owners,
  canWrite,
}: {
  campaigns: CampaignRow[]
  owners: { id: string; name: string }[]
  canWrite: boolean
}) {
  if (campaigns.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={<Megaphone />}
          title="Nenhuma campanha"
          description="Campanhas agrupam conteúdos com um mesmo objetivo e período."
        />
      </Panel>
    )
  }

  return (
    <Panel>
      <ul className="divide-y divide-[var(--line-subtle)]">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="text-strong truncate text-sm font-medium">{campaign.name}</span>
                <StatusBadge map={CAMPAIGN_STATUS} value={campaign.status} />
              </span>
              {campaign.objective && (
                <span className="text-muted truncate text-xs">{campaign.objective}</span>
              )}
              <span className="text-2xs text-subtle">
                {campaign.startDate ? formatShortDate(campaign.startDate) : '—'} →{' '}
                {campaign.endDate ? formatShortDate(campaign.endDate) : 'sem fim'}
                {campaign.owner && <> · {campaign.owner.name}</>}
                {campaign.budget && <> · verba {formatCurrency(campaign.budget)}</>}
              </span>
            </div>
            <Link
              href={`/marketing?campaignId=${campaign.id}&view=lista`}
              className="text-2xs text-brand-text hover:underline"
              data-tabular
            >
              {campaign.published}/{campaign.contents} publicados
            </Link>
            {canWrite && (
              <CampaignFormDialog
                owners={owners}
                campaign={campaign}
                trigger={
                  <Button variant="ghost" size="xs" iconOnly aria-label={`Editar ${campaign.name}`}>
                    <Pencil />
                  </Button>
                }
              />
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
