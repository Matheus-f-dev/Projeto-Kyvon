import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, Paperclip } from 'lucide-react'

import {
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  Pagination,
} from '@/components/layout/list-toolbar'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { Panel } from '@/components/ui/panel'
import { EmptyState, NoPermissionState, NoResultsState } from '@/components/ui/states'
import { Table, TBody, TD, TH, THead, TR, TableContainer } from '@/components/ui/table'
import { formatDateTime, formatFileSize, formatRelative } from '@/lib/format'
import { requireAuth } from '@/server/auth/context'
import { readableTargets } from '@/server/modules/files/access'
import { listFiles } from '@/server/modules/files/queries'
import { FILE_TARGETS, type FileTarget } from '@/shared/files'

export const metadata: Metadata = { title: 'Arquivos' }
export const dynamic = 'force-dynamic'

const TARGET_LABEL: Record<FileTarget, string> = {
  client: 'Cliente',
  proposal: 'Proposta',
  contract: 'Contrato',
  contract_addendum: 'Aditivo',
  project: 'Projeto',
  task: 'Tarefa',
  approval_version: 'Aprovação',
  scope_change: 'Mudança de escopo',
  support_ticket: 'Chamado',
  marketing_content: 'Conteúdo',
  case: 'Case',
}

/**
 * Arquivos.
 *
 * Não é um "drive" à parte: todo arquivo nasce vinculado a um registro
 * (cliente, contrato, projeto, tarefa…) e é lá que ele é enviado e versionado.
 * Esta tela é o índice transversal — "onde está aquele PDF?" — e respeita as
 * mesmas permissões: só aparecem arquivos de entidades que você pode ver.
 */
export default async function ArquivosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const context = await requireAuth()
  const params = await searchParams

  const allowed = readableTargets(context)
  if (allowed.length === 0) {
    return (
      <PageContainer>
        <NoPermissionState permission="files.read" />
      </PageContainer>
    )
  }

  const target = FILE_TARGETS.find((type) => type === params.tipo && allowed.includes(type))
  const page = Number(params.page) > 0 ? Number(params.page) : 1
  const result = await listFiles(context, { q: params.q, target, page })
  const hasFilters = Boolean(params.q || target)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Arquivos"
        description="Todos os arquivos que você pode acessar. Envio e novas versões ficam no registro de origem."
      />

      <Panel>
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <ListToolbar>
            <ListSearchInput placeholder="Buscar pelo nome do arquivo…" />
            <ListFilterSelect
              paramKey="tipo"
              placeholder="Todos os vínculos"
              options={allowed.map((type) => ({ value: type, label: TARGET_LABEL[type] }))}
            />
          </ListToolbar>
        </div>

        {result.items.length === 0 ? (
          hasFilters ? (
            <NoResultsState query={params.q} />
          ) : (
            <EmptyState
              icon={<Paperclip />}
              title="Nenhum arquivo ainda"
              description="Anexe arquivos dentro de um cliente, contrato, projeto ou tarefa."
            />
          )
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Arquivo</TH>
                    <TH>Vínculo</TH>
                    <TH className="hidden md:table-cell">Enviado por</TH>
                    <TH align="right" className="hidden sm:table-cell">
                      Tamanho
                    </TH>
                    <TH>Quando</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((file) => (
                    <TR key={file.id}>
                      <td className="max-w-0 px-3 py-2">
                        <a
                          href={
                            file.inline ? `/api/files/${file.id}?inline=1` : `/api/files/${file.id}`
                          }
                          target={file.inline ? '_blank' : undefined}
                          rel="noopener"
                          className="flex items-center gap-2"
                        >
                          <FileText className="text-subtle size-4 shrink-0" />
                          <span className="flex min-w-0 flex-col">
                            <span className="text-strong truncate font-medium hover:underline">
                              {file.name}
                            </span>
                            <span className="text-2xs text-subtle">
                              {file.kindLabel} · v{file.version}
                            </span>
                          </span>
                        </a>
                      </td>
                      <TD>
                        {file.target ? (
                          <span className="flex min-w-0 flex-col">
                            <span className="text-2xs text-subtle">
                              {TARGET_LABEL[file.target.type]}
                            </span>
                            {file.target.href ? (
                              <Link
                                href={file.target.href}
                                className="text-default truncate text-xs hover:underline"
                              >
                                {file.target.label}
                              </Link>
                            ) : (
                              <span className="text-default truncate text-xs">
                                {file.target.label}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-subtle text-xs">—</span>
                        )}
                      </TD>
                      <TD className="hidden md:table-cell">
                        <span className="text-muted text-xs">{file.uploader ?? '—'}</span>
                      </TD>
                      <TD align="right" className="hidden sm:table-cell">
                        <span className="text-muted text-xs" data-tabular>
                          {formatFileSize(file.sizeBytes)}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-muted text-xs" title={formatDateTime(file.createdAt)}>
                          {formatRelative(file.createdAt)}
                        </span>
                      </TD>
                    </TR>
                  ))}
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
