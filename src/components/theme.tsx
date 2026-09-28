'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

import { cn } from '@/lib/cn'
import {
  setStoredPreference,
  useStoredPreference,
  useSystemPrefersDark,
} from '@/lib/stored-preference'

/**
 * Tema claro/escuro.
 *
 * Três estados — claro, escuro e "seguir o sistema". O terceiro é o padrão:
 * a maioria já configurou isso no sistema operacional e não quer configurar
 * de novo aqui.
 *
 * A preferência vem de `localStorage` via `useSyncExternalStore`, e o único
 * efeito existente escreve no `<html>` — sincronizar com um sistema externo é
 * exatamente para isso que o efeito serve.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'kyvon-theme'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (value: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Script executado antes da primeira pintura.
 *
 * Sem ele a página nasce clara e pisca para escura assim que o React monta.
 * Fica inline no `<head>` de propósito — qualquer carregamento assíncrono
 * chegaria tarde demais.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var preference = stored === 'light' || stored === 'dark' ? stored : 'system';
    var resolved = preference === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference;
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`.trim()

function isPreference(value: string): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = useStoredPreference(STORAGE_KEY, 'system')
  const systemPrefersDark = useSystemPrefersDark()

  const preference: ThemePreference = isPreference(stored) ? stored : 'system'
  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference

  // Único efeito: espelhar o tema resolvido no documento.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved)
  }, [resolved])

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference: (next) => setStoredPreference(STORAGE_KEY, next),
    }),
    [preference, resolved],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme precisa estar dentro de <ThemeProvider>.')
  return context
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

/** Seletor de três posições. Mostra as opções em vez de escondê-las num ciclo. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme()

  return (
    <div
      className={cn('bg-sunken inline-flex items-center gap-0.5 rounded-md p-0.5', className)}
      role="radiogroup"
      aria-label="Tema"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const active = preference === option.value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setPreference(option.value)}
            className={cn(
              'flex size-6 items-center justify-center rounded transition-colors',
              active
                ? 'bg-raised text-strong shadow-[var(--shadow-raised)]'
                : 'text-subtle hover:text-muted',
            )}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}
