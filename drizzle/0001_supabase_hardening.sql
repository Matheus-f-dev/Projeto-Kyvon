-- Endurecimento para Supabase (ADR-010).
--
-- O Supabase publica o schema `public` pela Data API (PostgREST) usando os
-- papéis `anon` e `authenticated`. O Kyvon OS não usa essa API: toda leitura e
-- escrita passa pelo backend, que aplica autenticação, RBAC e auditoria. Sem
-- esta migration, qualquer pessoa com a chave anônima poderia ler as tabelas
-- diretamente, contornando o backend inteiro.
--
-- Duas camadas:
--   1. RLS ligado em todas as tabelas, sem nenhuma policy → a Data API não
--      enxerga nada. O dono das tabelas (o usuário da conexão da aplicação)
--      continua com acesso, porque o dono ignora RLS quando não é FORCE.
--   2. Revoga os privilégios de `anon`/`authenticated`, se esses papéis
--      existirem. Fora do Supabase (PGlite, Postgres comum) eles não existem e
--      o bloco é ignorado.
--
-- Tabelas criadas em migrations futuras precisam do mesmo tratamento — o teste
-- `tests/database-hardening.test.ts` falha se alguma ficar sem RLS.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated';
  END IF;
END
$$;
