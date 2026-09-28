'use client'

import { useActionState, useState } from 'react'

import { idleState, type ActionState } from '@/server/action-state'

/**
 * `useActionState` para o par "criar ou editar" de um diálogo.
 *
 * Existe por causa de uma sutileza de tipos: a action de criação devolve
 * `ActionState<{ id: string }>`, a de edição devolve `ActionState<undefined>`
 * — TypeScript não infere sozinho um tipo comum entre as duas quando eu só
 * escrevo `isEdit ? updateAction : createAction`, porque o parâmetro de
 * estado anterior é contravariante. Este hook resolve a inferência uma vez só
 * (com um cast documentado aqui dentro) para que nenhum componente de
 * formulário precise repetir a ginástica de tipos.
 *
 * Também fecha o diálogo quando a ação é bem-sucedida — ajustado durante a
 * renderização (não em `useEffect`), comparando a *identidade* do objeto de
 * estado: duas submissões seguidas com sucesso produzem objetos diferentes
 * com o mesmo texto de status, e comparar só a string perderia a segunda
 * transição.
 */

type CreateAction<TData> = (state: unknown, formData: FormData) => Promise<ActionState<TData>>

type UpdateAction = (state: unknown, formData: FormData) => Promise<ActionState<undefined>>

export function useUpsertFormAction<TData>(
  action: CreateAction<TData> | UpdateAction,
  open: boolean,
  setOpen: (open: boolean) => void,
) {
  const widenedAction = action as (
    state: ActionState<TData | undefined>,
    formData: FormData,
  ) => Promise<ActionState<TData | undefined>>

  const [state, formAction] = useActionState<ActionState<TData | undefined>, FormData>(
    widenedAction,
    idleState,
  )

  const [trackedState, setTrackedState] = useState(state)
  if (state !== trackedState) {
    setTrackedState(state)
    if (state.status === 'success' && open) setOpen(false)
  }

  return [state, formAction] as const
}
