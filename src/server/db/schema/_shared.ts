import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Colunas repetidas em quase toda tabela.
 *
 * IDs são UUID gerados na aplicação (`crypto.randomUUID`) em vez de sequência:
 * não expõem volume de negócio na URL e permitem montar um grafo de objetos
 * relacionados antes de qualquer ida ao banco — o que a criação de projeto a
 * partir de template precisa para inserir tudo em uma transação só.
 */

export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

/** Exclusão lógica. Usada só onde o histórico precisa sobreviver ao "delete". */
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true })

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
