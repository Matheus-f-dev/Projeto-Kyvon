import { AlertTriangle, Inbox, Lock, RefreshCw, SearchX } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { Button } from './button'

/**
 * Estados de tela.
 *
 * Toda listagem e todo painel tem cinco estados possíveis — carregando, vazio,
 * sem resultado, sem permissão e com erro. Componentizá-los é o que impede a
 * tela em branco que não explica nada.
 *
 * A diferença entre "vazio" e "sem resultado" importa: no primeiro caso a ação
 * é criar o primeiro registro; no segundo, limpar o filtro.
 */

interface BaseStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
  compact?: boolean
}

function StateShell({ title, description, action, icon, className, compact }: BaseStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'bg-neutral-soft text-subtle flex items-center justify-center rounded-full',
            compact ? 'size-8 [&_svg]:size-4' : 'size-11 [&_svg]:size-5',
          )}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <p className={cn('text-strong font-medium', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description && <p className="text-muted text-xs leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** Não existe nenhum registro ainda. A saída é criar o primeiro. */
export function EmptyState(props: Omit<BaseStateProps, 'icon'> & { icon?: ReactNode }) {
  return <StateShell icon={props.icon ?? <Inbox />} {...props} />
}

/** Existem registros, mas o filtro atual não devolveu nenhum. */
export function NoResultsState({
  onClear,
  query,
  ...props
}: Omit<BaseStateProps, 'icon' | 'title'> & {
  title?: string
  query?: string
  onClear?: () => void
}) {
  return (
    <StateShell
      icon={<SearchX />}
      title={props.title ?? 'Nenhum resultado'}
      description={
        props.description ??
        (query
          ? `Nada encontrado para "${query}". Tente outro termo ou ajuste os filtros.`
          : 'Nenhum registro corresponde aos filtros aplicados.')
      }
      action={
        props.action ??
        (onClear ? (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        ) : undefined)
      }
      {...props}
    />
  )
}

export function ErrorState({
  onRetry,
  ...props
}: Omit<BaseStateProps, 'icon' | 'title'> & { title?: string; onRetry?: () => void }) {
  return (
    <StateShell
      icon={<AlertTriangle />}
      title={props.title ?? 'Não foi possível carregar'}
      description={
        props.description ?? 'Algo deu errado ao buscar os dados. Tente de novo em instantes.'
      }
      action={
        props.action ??
        (onRetry ? (
          <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : undefined)
      }
      {...props}
    />
  )
}

/**
 * Sem permissão.
 *
 * Diz o que falta sem expor o conteúdo. A UI esconder é conveniência — o dado
 * já não foi enviado pelo servidor.
 */
export function NoPermissionState({
  permission,
  ...props
}: Omit<BaseStateProps, 'icon' | 'title'> & { title?: string; permission?: string }) {
  return (
    <StateShell
      icon={<Lock />}
      title={props.title ?? 'Sem acesso a esta área'}
      description={
        props.description ??
        `Seu perfil não inclui esta permissão${permission ? ` (${permission})` : ''}. Fale com um administrador se precisar dela.`
      }
      {...props}
    />
  )
}

/** Valor oculto por falta de permissão — no lugar de um campo em branco. */
export function RestrictedValue({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-subtle inline-flex items-center gap-1 text-xs', className)}
      title="Você não tem permissão para ver este valor"
      {...props}
    >
      <Lock className="size-3" aria-hidden />
      restrito
    </span>
  )
}
