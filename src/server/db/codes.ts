import { eq, sql } from 'drizzle-orm'

import { codeSequences } from './schema'
import { db, type Database } from './client'

/**
 * Códigos legíveis: CLI-0001, PRJ-0042, TSK-0117…
 *
 * O UUID é a chave; o código é o que as pessoas dizem em reunião. Gerar com
 * `UPDATE … RETURNING` é atômico e participa da transação de quem chamou — se a
 * criação da entidade falhar, o número volta atrás em vez de ser queimado.
 */

export const CODE_ENTITIES = {
  client: { prefix: 'CLI', padding: 4 },
  lead: { prefix: 'LED', padding: 4 },
  opportunity: { prefix: 'OPP', padding: 4 },
  proposal: { prefix: 'PRP', padding: 4 },
  contract: { prefix: 'CTR', padding: 4 },
  contract_addendum: { prefix: 'ADT', padding: 4 },
  project: { prefix: 'PRJ', padding: 4 },
  task: { prefix: 'TSK', padding: 5 },
  approval: { prefix: 'APR', padding: 4 },
  scope_change: { prefix: 'ESC', padding: 4 },
  support_ticket: { prefix: 'CHM', padding: 5 },
  marketing_content: { prefix: 'CNT', padding: 4 },
  case: { prefix: 'CAS', padding: 3 },
} as const

export type CodeEntity = keyof typeof CODE_ENTITIES

/**
 * Próximo código da entidade.
 *
 * Passe a transação em `tx` sempre que a entidade estiver sendo criada dentro
 * de uma — caso contrário o contador avança mesmo se a criação for desfeita.
 */
export async function nextCode(entity: CodeEntity, tx: Database = db): Promise<string> {
  const [row] = await tx
    .update(codeSequences)
    .set({ currentValue: sql`${codeSequences.currentValue} + 1` })
    .where(eq(codeSequences.entity, entity))
    .returning({
      prefix: codeSequences.prefix,
      value: codeSequences.currentValue,
      padding: codeSequences.padding,
    })

  if (!row) {
    throw new Error(
      `Contador de código ausente para "${entity}". Rode \`npm run db:seed\` para criar os contadores.`,
    )
  }

  return `${row.prefix}-${String(row.value).padStart(row.padding, '0')}`
}

/**
 * Vários códigos da mesma entidade de uma vez, em um único UPDATE.
 * Usado pela criação de projeto por template, que insere dezenas de tarefas.
 */
export async function nextCodes(
  entity: CodeEntity,
  count: number,
  tx: Database = db,
): Promise<string[]> {
  if (count <= 0) return []

  const [row] = await tx
    .update(codeSequences)
    .set({ currentValue: sql`${codeSequences.currentValue} + ${count}` })
    .where(eq(codeSequences.entity, entity))
    .returning({
      prefix: codeSequences.prefix,
      value: codeSequences.currentValue,
      padding: codeSequences.padding,
    })

  if (!row) {
    throw new Error(
      `Contador de código ausente para "${entity}". Rode \`npm run db:seed\` para criar os contadores.`,
    )
  }

  // `value` já é o valor final após o incremento; reconstituímos a faixa.
  const first = row.value - count + 1
  return Array.from(
    { length: count },
    (_unused, index) => `${row.prefix}-${String(first + index).padStart(row.padding, '0')}`,
  )
}
