import { redirect } from 'next/navigation'

import { SETTINGS_SECTIONS } from '@/components/settings/sections'
import { requireAuth } from '@/server/auth/context'

/** `/configuracoes` abre a primeira seção que a pessoa pode ver. */
export default async function SettingsIndexPage() {
  const context = await requireAuth()
  const first = SETTINGS_SECTIONS.find((section) => context.can(section.permission))
  // Sem nenhuma seção, o layout já mostra o estado "sem permissão".
  if (!first) return null
  redirect(first.href)
}
