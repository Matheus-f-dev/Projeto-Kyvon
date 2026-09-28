/**
 * Paginação padrão das listagens.
 *
 * Todo módulo usa o mesmo tamanho de página e o mesmo formato de resultado —
 * requisito 32 do produto: nenhuma tela carrega milhares de linhas de uma vez.
 */

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface PageInput {
  page?: number
  pageSize?: number
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function normalizePage(page: number | undefined): number {
  return Number.isFinite(page) && (page ?? 0) > 0 ? Math.floor(page as number) : 1
}

export function normalizePageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize) || (pageSize ?? 0) <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(pageSize as number), MAX_PAGE_SIZE)
}

export function toOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize
}

export function buildPageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}
