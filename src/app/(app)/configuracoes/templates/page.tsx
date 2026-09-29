import type { Metadata } from 'next'
import { LayoutTemplate } from 'lucide-react'

import { SectionHeader } from '@/components/layout/page'
import { TemplateToggle } from '@/components/settings/template-toggle'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState } from '@/components/ui/states'
import { requireAuth } from '@/server/auth/context'
import { listTemplates } from '@/server/modules/admin/queries'

export const metadata: Metadata = { title: 'Templates de projeto' }
export const dynamic = 'force-dynamic'

export default async function SettingsTemplatesPage() {
  const context = await requireAuth()
  if (!context.can('projects.templates.manage')) {
    return <NoPermissionState permission="projects.templates.manage" />
  }

  const templates = await listTemplates()

  return (
    <>
      <SectionHeader
        title="Templates de projeto"
        description="Ao criar um projeto a partir de um template, etapas, tarefas, checklists e dependências nascem juntos. Desativar tira o template das opções sem afetar projetos existentes."
      />
      <Panel>
        {templates.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate />}
            title="Nenhum template"
            description="Os templates padrão são criados pelo seed do sistema."
          />
        ) : (
          <ul className="divide-y divide-[var(--line-subtle)]">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={
                      template.isActive
                        ? 'text-strong text-sm font-medium'
                        : 'text-subtle text-sm font-medium'
                    }
                  >
                    {template.name}
                  </span>
                  <span className="text-2xs text-muted truncate">
                    {[
                      template.serviceType,
                      `${template.stages} etapas`,
                      `${template.tasks} tarefas`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {template.description && (
                    <span className="text-2xs text-subtle line-clamp-1">
                      {template.description}
                    </span>
                  )}
                </div>
                <TemplateToggle
                  templateId={template.id}
                  name={template.name}
                  isActive={template.isActive}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
