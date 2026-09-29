import type { Metadata } from 'next'

import { PageContainer, PageHeader } from '@/components/layout/page'
import { SETTINGS_PERMISSIONS, SETTINGS_SECTIONS } from '@/components/settings/sections'
import { SettingsNav } from '@/components/settings/settings-nav'
import { NoPermissionState } from '@/components/ui/states'
import { requireAuth } from '@/server/auth/context'

export const metadata: Metadata = {
  title: { template: '%s · Configurações', default: 'Configurações' },
}

/**
 * Configurações.
 *
 * Cada seção valida a própria permissão na página — este layout só decide
 * quais aparecem no menu e barra quem não tem nenhuma delas.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const context = await requireAuth()
  const sections = SETTINGS_SECTIONS.filter((section) => context.can(section.permission))

  if (sections.length === 0) {
    return (
      <PageContainer>
        <NoPermissionState permission={SETTINGS_PERMISSIONS[0]} />
      </PageContainer>
    )
  }

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Configurações"
        description="Como o sistema se adapta ao jeito da Kyvon trabalhar."
      />
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <aside className="md:sticky md:top-4 md:w-52 md:shrink-0">
          <SettingsNav sections={sections.map(({ href, label }) => ({ href, label }))} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
      </div>
    </PageContainer>
  )
}
