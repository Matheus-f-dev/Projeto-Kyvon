'use client'

import { ArrowRight, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCompactCurrency, formatDeadline, isOverdue } from '@/lib/format'
import { moveOpportunityAction } from '@/server/modules/crm/actions'
import { OPPORTUNITY_STAGE, PIPELINE_STAGES, type OpportunityStage } from '@/shared/domain'
import type { PipelineColumn } from '@/server/modules/crm/queries'

/**
 * Quadro do pipeline.
 *
 * Movimentação entre etapas é por menu ("Mover para"), não arrastar-e-soltar:
 * cobre o requisito de movimentar entre etapas com um quinto do código e
 * funciona igual em touch. Abrir o card mostra o detalhe completo no drawer.
 */
export function PipelineBoard({
  columns,
  canWrite,
}: {
  columns: PipelineColumn[]
  canWrite: boolean
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((column) => (
        <div key={column.stage} className="flex w-72 shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-strong text-xs font-semibold">
              {OPPORTUNITY_STAGE[column.stage].label}
            </h3>
            <div className="text-2xs text-subtle flex items-center gap-1.5">
              <span data-tabular>{column.cards.length}</span>
              {column.totalValue !== null && Number(column.totalValue) > 0 && (
                <span data-tabular>· {formatCompactCurrency(column.totalValue)}</span>
              )}
            </div>
          </div>

          <div className="bg-sunken flex flex-col gap-2 rounded-lg p-1.5">
            {column.cards.length === 0 ? (
              <div className="border-line text-2xs text-subtle rounded-md border border-dashed px-2 py-6 text-center">
                Vazio
              </div>
            ) : (
              column.cards.map((card) => (
                <OpportunityCard key={card.id} card={card} canWrite={canWrite} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function OpportunityCard({
  card,
  canWrite,
}: {
  card: PipelineColumn['cards'][number]
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const overdueAction = isOverdue(card.nextActionAt)

  const moveTo = (stage: OpportunityStage) => {
    const formData = new FormData()
    formData.set('opportunityId', card.id)
    formData.set('stage', stage)

    startTransition(async () => {
      const result = await moveOpportunityAction(formData)
      if (result.status === 'error') {
        toast.error(result.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="group border-line bg-raised relative flex flex-col gap-2 rounded-md border p-2.5 shadow-[var(--shadow-raised)]">
      <Link href={`/comercial?oportunidade=${card.id}`} className="flex flex-col gap-1.5">
        <span className="text-strong line-clamp-2 text-sm leading-snug font-medium">
          {card.title}
        </span>
        <span className="text-2xs text-muted truncate">{card.clientName}</span>
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {card.ownerName && <Avatar name={card.ownerName} src={card.ownerAvatar} size="xs" />}
          {card.estimatedValue !== null && (
            <span className="text-2xs text-strong font-medium" data-tabular>
              {formatCompactCurrency(card.estimatedValue)}
            </span>
          )}
        </div>
        {card.nextActionAt && (
          <span
            className={
              overdueAction ? 'text-2xs text-danger-text font-medium' : 'text-2xs text-subtle'
            }
          >
            {formatDeadline(card.nextActionAt)}
          </span>
        )}
      </div>

      {canWrite && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={pending}
              className="text-subtle hover:bg-hover hover:text-strong absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
              aria-label="Mover oportunidade"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PIPELINE_STAGES.filter((stage) => stage !== card.stage).map((stage) => (
              <DropdownMenuItem key={stage} onSelect={() => moveTo(stage)}>
                <ArrowRight />
                Mover para {OPPORTUNITY_STAGE[stage].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
