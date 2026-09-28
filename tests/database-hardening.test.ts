import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { executeRows } from '@/server/db/client'

/**
 * Endurecimento para Supabase (ADR-010).
 *
 * A Data API do Supabase expõe o schema `public` para quem tiver a chave
 * anônima. O que impede isso é RLS ligado em toda tabela. Este teste falha se
 * uma migration nova criar tabela sem `ENABLE ROW LEVEL SECURITY` — o erro
 * aparece aqui, não em produção.
 */
describe('endurecimento do banco', () => {
  it('toda tabela do schema public tem RLS ligado', async () => {
    const rows = await executeRows<{ table: string; rls: boolean }>(sql`
      select c.relname as "table", c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `)

    expect(rows.length).toBeGreaterThan(20)
    const withoutRls = rows.filter((row) => !row.rls).map((row) => row.table)
    expect(withoutRls).toEqual([])
  })
})
