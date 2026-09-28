/**
 * IDs vêm da URL (`/projetos/[id]`, `?tarefa=`) e chegam como texto qualquer.
 * Um valor que não é UUID não pode existir no banco — tratá-lo como "não
 * encontrado" antes da consulta evita que o Postgres rejeite o tipo e a página
 * vire erro 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
