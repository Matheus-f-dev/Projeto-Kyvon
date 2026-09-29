import type { Metadata } from 'next'

import { SectionHeader } from '@/components/layout/page'
import { CatalogEditor } from '@/components/settings/catalog-editor'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { NoPermissionState } from '@/components/ui/states'
import { requireAuth } from '@/server/auth/context'
import { listCatalog } from '@/server/modules/admin/queries'

export const metadata: Metadata = { title: 'Catálogos' }
export const dynamic = 'force-dynamic'

export default async function SettingsCatalogsPage() {
  const context = await requireAuth()
  if (!context.can('settings.manage')) return <NoPermissionState permission="settings.manage" />

  const [sources, serviceTypes] = await Promise.all([
    listCatalog('lead_source'),
    listCatalog('service_type'),
  ])

  return (
    <>
      <SectionHeader
        title="Catálogos"
        description="Opções usadas nos formulários. Itens desativados somem das opções, mas continuam nos registros antigos."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Origens de lead"
            description="De onde chegam os contatos comerciais."
          />
          <CatalogEditor
            kind="lead_source"
            items={sources}
            emptyLabel="Nenhuma origem cadastrada."
          />
        </Panel>
        <Panel>
          <PanelHeader title="Tipos de serviço" description="O que a Kyvon vende e entrega." />
          <CatalogEditor
            kind="service_type"
            items={serviceTypes}
            emptyLabel="Nenhum tipo de serviço cadastrado."
          />
        </Panel>
      </div>
    </>
  )
}
