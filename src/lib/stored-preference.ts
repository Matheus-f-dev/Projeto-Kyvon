'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Preferências do usuário guardadas em `localStorage`.
 *
 * Usa `useSyncExternalStore` em vez do par `useState` + `useEffect`. A razão é
 * concreta: o servidor não conhece o `localStorage`, então ler no efeito e
 * chamar `setState` provoca uma segunda renderização logo após a hidratação —
 * o menu "pula" de expandido para recolhido, o tema pisca. Com este hook o
 * React usa o valor do servidor durante a hidratação e troca para o valor real
 * em uma passada só.
 *
 * De brinde, mudar a preferência em uma aba reflete nas outras.
 */

type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

function notify(key: string) {
  const subscribers = listeners.get(key)
  if (!subscribers) return
  for (const listener of subscribers) listener()
}

/** Grava e avisa todos os componentes que observam a chave. */
export function setStoredPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Modo privado ou armazenamento bloqueado: a preferência simplesmente não
    // persiste. Não é motivo para quebrar a interface.
  }
  notify(key)
}

export function useStoredPreference(key: string, fallback: string): string {
  const subscribe = useCallback(
    (onChange: Listener) => {
      let subscribers = listeners.get(key)
      if (!subscribers) {
        subscribers = new Set()
        listeners.set(key, subscribers)
      }
      subscribers.add(onChange)

      // `storage` só dispara em outras abas — é o que sincroniza entre janelas.
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange()
      }
      window.addEventListener('storage', onStorage)

      return () => {
        subscribers.delete(onChange)
        window.removeEventListener('storage', onStorage)
      }
    },
    [key],
  )

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  }, [key, fallback])

  const getServerSnapshot = useCallback(() => fallback, [fallback])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Preferência de tema do sistema operacional.
 * Mesma razão do hook acima: é estado externo ao React.
 */
export function useSystemPrefersDark(): boolean {
  const subscribe = useCallback((onChange: Listener) => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    // No servidor assumimos claro; o script inline do `<head>` já corrigiu o
    // atributo antes da primeira pintura, então não há flash visível.
    () => false,
  )
}
