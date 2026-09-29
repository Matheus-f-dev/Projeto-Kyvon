import type { Metadata } from 'next'

import { SectionHeader } from '@/components/layout/page'
import { OrganizationForm } from '@/components/settings/organization-form'
import { Panel } from '@/components/ui/panel'
import { NoPermissionState } from '@/components/ui/states'
import { requireAuth } from '@/server/auth/context'
import { getOrganization } from '@/server/modules/admin/queries'

export const metadata: Metadata = { title: 'Empresa' }
export const dynamic = 'force-dynamic'

export default async function SettingsOrganizationPage() {
  const context = await requireAuth()
  if (!context.can('settings.manage')) return <NoPermissionState permission="settings.manage" />

  const org = await getOrganization()

  return (
    <>
      <SectionHeader title="Empresa" description="Dados cadastrais da Kyvon." />
      <Panel>
        <OrganizationForm
          defaults={{
            name: org?.name,
            legalName: org?.legalName,
            document: org?.document,
            email: org?.email,
            phone: org?.phone,
            website: org?.website,
          }}
        />
      </Panel>
    </>
  )
}
