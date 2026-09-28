import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderKanban } from 'lucide-react'

import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { Avatar } from '@/components/ui/avatar'
import { ProgressBar } from '@/components/ui/misc'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TBody, TD, TDPrimary, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { formatDeadline, isOverdue } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { listProjects, listTemplateOptions } from '@/server/modules/projects/queries'
import { listUserOptions } from '@/server/modules/users/queries'
import { PROJECT_STATUS, type ProjectStatus } from '@/shared/domain'
import { projectStatusValues } from '@/shared/schemas/projects'

import { CreateProjectDialog } from './create-project-dialog'

export const metadata: Metadata = { title: 'Projetos' }
export const dynamic = 'force-dynamic'

const FILTERS = [
  { value: 'ativos', label: 'Em execução' },
  { value: 'atrasados', label: 'Atrasados' },
  { value: 'bloqueados', label: 'Bloqueados' },
] as const

type Filter = (typeof FILTERS)[number]['value']

export default async function ProjetosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  if (!context.can('projects.read')) {
    return (
      <PageContainer>
        <NoPermissionState permission="projects.read" />
      </PageContainer>
    )
  }

  const filtro = FILTERS.some((item) => item.value === params.filtro)
    ? (params.filtro as Filter)
    : undefined
  const status = projectStatusValues.includes(params.status as ProjectStatus)
    ? (params.status as ProjectStatus)
    : undefined
  const canCreate = context.can('projects.write')

  const [result, templates, users] = await Promise.all([
    listProjects(context, {
      q: params.q,
      status,
      filtro,
      page: params.page ? Number(params.page) : 1,
    }),
    canCreate ? listTemplateOptions() : Promise.resolve([]),
    canCreate ? listUserOptions() : Promise.resolve([]),
  ])

  const hasFilters = Boolean(params.q || status || filtro)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Projetos"
        description="O que está sendo entregue, em que etapa e em que situação."
        actions={
          canCreate && (
            <CreateProjectDialog
              templates={templates}
              owners={users}
              defaultOpen={params.novo === '1'}
            />
          )
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip href="/projetos" active={!filtro && !status}>
          Todos
        </FilterChip>
        {FILTERS.map((item) => (
          <FilterChip
            key={item.value}
            href={`/projetos?filtro=${item.value}`}
            active={filtro === item.value}
          >
            {item.label}
          </FilterChip>
        ))}
      </div>

      <Panel>
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar por projeto, código ou cliente…" />
            <ListFilterSelect
              paramKey="status"
              placeholder="Todos os status"
              options={projectStatusValues.map((value) => ({
                value,
                label: PROJECT_STATUS[value].label,
              }))}
            />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={params.q} />
          ) : (
            <EmptyState
              icon={<FolderKanban />}
              title="Nenhum projeto ainda"
              description="Projetos nascem de um contrato ativo — ou podem ser criados aqui, com ou sem template."
            />
          )
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Projeto</TH>
                    <TH className="hidden md:table-cell">Etapa</TH>
                    <TH className="hidden lg:table-cell">Responsável</TH>
                    <TH>Progresso</TH>
                    <TH align="right" className="hidden md:table-cell">
                      Tarefas
                    </TH>
                    <TH>Prazo</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((project) => {
                    const closed = project.status === 'completed' || project.status === 'cancelled'
                    const late = !closed && isOverdue(project.dueDate)
                    return (
                      <TR key={project.id} interactive>
                        <TDPrimary
                          title={
                            <Link href={`/projetos/${project.id}`} className="hover:underline">
                              {project.name}
                            </Link>
                          }
                          subtitle={`${project.code} · ${project.clientName}`}
                        />
                        <TD className="hidden md:table-cell">
                          <span className="text-muted text-xs">{project.stageName ?? '—'}</span>
                        </TD>
                        <TD className="hidden lg:table-cell">
                          {project.owner ? (
                            <span className="flex items-center gap-1.5">
                              <Avatar
                                name={project.owner.name}
                                src={project.owner.avatarUrl}
                                size="xs"
                              />
                              <span className="truncate text-xs">{project.owner.name}</span>
                            </span>
                          ) : (
                            <span className="text-subtle text-xs">—</span>
                          )}
                        </TD>
                        <TD className="w-32">
                          <ProgressBar value={project.progress} showValue />
                        </TD>
                        <TD align="right" className="hidden md:table-cell">
                          <span className="text-xs" data-tabular>
                            {project.openTasks}
                            {project.overdueTasks > 0 && (
                              <span className="text-danger-text ml-1">
                                ({project.overdueTasks} atrasadas)
                              </span>
                            )}
                          </span>
                        </TD>
                        <TD>
                          <span className={cn('text-xs', late && 'text-danger-text font-medium')}>
                            {closed ? '—' : formatDeadline(project.dueDate)}
                          </span>
                        </TD>
                        <TD>
                          <StatusBadge map={PROJECT_STATUS} value={project.status} />
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </Panel>
    </PageContainer>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'h-7 rounded-full border px-3 text-xs leading-7 font-medium transition-colors',
        active
          ? 'border-brand-border bg-brand-soft text-brand-text'
          : 'border-line text-muted hover:border-line-strong hover:text-strong',
      )}
    >
      {children}
    </Link>
  )
}
