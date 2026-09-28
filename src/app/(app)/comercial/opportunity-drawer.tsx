'use client'

import { CheckCircle2, FileText, Pencil, RotateCcw, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmButton, ReasonButton } from '@/components/ui/confirm-button'
import { DetailItem, DetailList, EntityCode } from '@/components/ui/misc'
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from '@/components/ui/drawer'
import { RestrictedValue } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCurrency, formatDate, formatPercent } from '@/lib/format'
import { convertOpportunityToContractAction } from '@/server/modules/contracts/actions'
import {
  markOpportunityLostAction,
  markOpportunityWonAction,
  reopenOpportunityAction,
} from '@/server/modules/crm/actions'
import type { OpportunityDetail, ProposalRow } from '@/server/modules/crm/queries'
import { OPPORTUNITY_STAGE } from '@/shared/domain'

import { OpportunityFormDialog, type OpportunityFormOptions } from './opportunity-form-dialog'
import { ProposalsPanel } from './proposals-panel'

export function OpportunityDrawer({
  opportunity,
  proposals,
  formOptions,
  canWrite,
  canConvert,
}: {
  opportunity: OpportunityDetail
  proposals: ProposalRow[]
  formOptions: OpportunityFormOptions
  canWrite: boolean
  canConvert: boolean
}) {
  const router = useRouter()
  const [converting, startConvert] = useTransition()

  const close = () => router.push('/comercial')

  const onConvert = () => {
    startConvert(async () => {
      const result = await convertOpportunityToContractAction(opportunity.id)
      if (result.status === 'error') {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      if (result.data) router.push(`/contratos/${result.data.id}`)
    })
  }

  const isOpen = opportunity.stage !== 'won' && opportunity.stage !== 'lost'

  return (
    <Drawer open onOpenChange={(next) => !next && close()}>
      <DrawerContent size="lg">
        <DrawerHeader
          meta={
            <>
              <EntityCode code={opportunity.code} />
              <span>·</span>
              <span>{opportunity.client.name}</span>
            </>
          }
          title={opportunity.title}
          actions={
            canWrite && (
              <OpportunityFormDialog
                options={formOptions}
                defaultValues={{
                  id: opportunity.id,
                  title: opportunity.title,
                  clientId: opportunity.client.id,
                  clientLabel: opportunity.client.name,
                  contactId: opportunity.contact?.id,
                  serviceTypeId: opportunity.serviceType?.id,
                  ownerId: opportunity.owner?.id,
                  estimatedValue: opportunity.estimatedValue ?? undefined,
                  probability: opportunity.probability ?? undefined,
                  nextAction: opportunity.nextAction ?? undefined,
                  nextActionAt: opportunity.nextActionAt ?? undefined,
                  expectedCloseAt: opportunity.expectedCloseAt ?? undefined,
                  description: opportunity.description ?? undefined,
                  notes: opportunity.notes ?? undefined,
                }}
                lockClient
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
          <div className="flex items-center gap-2">
            <StatusBadge map={OPPORTUNITY_STAGE} value={opportunity.stage} size="md" />
            {opportunity.stage === 'lost' && opportunity.lostReason && (
              <span className="text-2xs text-muted">{opportunity.lostReason}</span>
            )}
          </div>

          <DetailList>
            <DetailItem label="Valor estimado">
              {opportunity.estimatedValue !== null ? (
                formatCurrency(opportunity.estimatedValue)
              ) : (
                <RestrictedValue />
              )}
            </DetailItem>
            <DetailItem label="Probabilidade">{formatPercent(opportunity.probability)}</DetailItem>
            <DetailItem label="Responsável">{opportunity.owner?.name ?? '—'}</DetailItem>
            <DetailItem label="Serviço">{opportunity.serviceType?.name ?? '—'}</DetailItem>
            <DetailItem label="Contato">{opportunity.contact?.name ?? '—'}</DetailItem>
            <DetailItem label="Próxima ação">
              {opportunity.nextAction
                ? `${opportunity.nextAction} (${formatDate(opportunity.nextActionAt)})`
                : '—'}
            </DetailItem>
          </DetailList>

          {opportunity.description && (
            <div className="border-line flex flex-col gap-1 border-t pt-3">
              <span className="text-2xs text-subtle font-semibold tracking-wide uppercase">
                Descrição
              </span>
              <p className="text-default text-sm whitespace-pre-line">{opportunity.description}</p>
            </div>
          )}

          <div className="border-line border-t pt-4">
            <ProposalsPanel
              opportunityId={opportunity.id}
              proposals={proposals}
              canWrite={canWrite}
            />
          </div>
        </DrawerBody>

        <DrawerFooter className="flex-wrap justify-start gap-2">
          {isOpen && canWrite && (
            <>
              <ConfirmButton
                label="Marcar como ganha"
                icon={<CheckCircle2 />}
                variant="secondary"
                title="Marcar oportunidade como ganha"
                description="A conversão em contrato fica disponível em seguida."
                action={() => markOpportunityWonAction(opportunity.id)}
              />
              <ReasonButton
                label="Marcar como perdida"
                icon={<XCircle />}
                title="Marcar oportunidade como perdida"
                reasonLabel="Motivo da perda"
                action={(reason) => {
                  const formData = new FormData()
                  formData.set('opportunityId', opportunity.id)
                  formData.set('reason', reason)
                  return markOpportunityLostAction(formData)
                }}
              />
            </>
          )}

          {opportunity.stage === 'lost' && canWrite && (
            <ConfirmButton
              label="Reabrir"
              icon={<RotateCcw />}
              title="Reabrir oportunidade"
              description="Ela volta para a etapa de negociação."
              action={() => reopenOpportunityAction(opportunity.id)}
            />
          )}

          {opportunity.stage === 'won' && canConvert && (
            <>
              {opportunity.convertedContractId ? (
                <Button variant="primary" size="sm" icon={<FileText />} asChild>
                  <a href={`/contratos/${opportunity.convertedContractId}`}>Ver contrato</a>
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<FileText />}
                  loading={converting}
                  onClick={onConvert}
                >
                  Converter em contrato
                </Button>
              )}
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
