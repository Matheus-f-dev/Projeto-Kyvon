# Kyvon OS

Sistema operacional interno da Kyvon. Organiza o ciclo completo de um trabalho —
do primeiro contato com um possível cliente ao suporte pós-lançamento — como uma
cadeia conectada, sem redigitação e sem histórico perdido.

```
Lead → Cliente → Oportunidade → Proposta → Contrato → Projeto → Tarefas
     → Aprovações → Lançamento → Suporte → (nova demanda volta ao Comercial)
```

## Começar

Pré-requisito: **Node.js 20.11+** (desenvolvido em 22.14). Nada além disso —
sem Docker, sem PostgreSQL instalado.

```bash
npm install
cp .env.example .env.local     # ajuste se quiser; os padrões funcionam
npm run db:migrate             # cria o schema
npm run db:seed                # perfis, permissões, catálogos e templates
npm run dev                    # http://localhost:3000
```

O seed imprime **uma única vez** o e-mail e a senha do administrador criado.
Anote. Para definir credenciais fixas em desenvolvimento, preencha
`SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` no `.env.local` antes de rodar.

### Com dados de demonstração

```bash
npm run db:seed -- --demo
```

Cria uma agência fictícia em operação: 6 clientes, pipeline em vários estágios,
3 contratos, 3 projetos (um atrasado, um bloqueado, um aguardando cliente),
aprovações versionadas, mudança de escopo e chamados de suporte. Útil para
avaliar as telas com conteúdo real.

Bloqueado em produção — ver [Segurança](#segurança).

## Como o banco funciona sem instalar nada

`DATABASE_URL` vazia → a aplicação sobe um **PostgreSQL embarcado** (PGlite,
compilado para WebAssembly) com os dados em `.data/pglite`. Não é um banco
"parecido com Postgres": é o Postgres, com os mesmos tipos, as mesmas
constraints e as mesmas migrations que rodam em produção.

`DATABASE_URL` preenchida → conecta em um PostgreSQL real.

O racional completo está em [ADR-002](docs/architecture.md#adr-002--pglite-em-desenvolvimento-postgresql-em-produção).

## Comandos

| Comando                     | O que faz                                          |
| --------------------------- | -------------------------------------------------- |
| `npm run dev`               | Servidor de desenvolvimento                        |
| `npm run build`             | Build de produção                                  |
| `npm start`                 | Servidor de produção (após o build)                |
| `npm run check`             | Typecheck + lint + testes — rode antes de commitar |
| `npm run typecheck`         | Só o TypeScript                                    |
| `npm run lint` / `lint:fix` | ESLint                                             |
| `npm run format`            | Prettier                                           |
| `npm test` / `test:watch`   | Vitest                                             |
| `npm run db:generate`       | Gera migration a partir do schema alterado         |
| `npm run db:migrate`        | Aplica as migrations pendentes                     |
| `npm run db:seed`           | Seed essencial (`-- --demo` para dados fictícios)  |
| `npm run db:reset`          | Apaga o banco (bloqueado em produção)              |

Recomeçar do zero em desenvolvimento:

```bash
npm run db:reset && npm run db:migrate && npm run db:seed -- --demo
```

## Estrutura

```
docs/                     Arquitetura, banco, permissões e produto
drizzle/                  Migrations SQL versionadas
scripts/                  migrate, seed, reset
src/
  app/                    Rotas (App Router)
    (auth)/               Telas públicas — login
    (app)/                Aplicação autenticada
    api/                  Route handlers: health, search, notifications
  components/
    ui/                   Design system
    layout/               Shell: sidebar, header, command palette
  lib/                    Utilidades de cliente (formatação, classes)
  server/
    auth/                 Sessão, senha, contexto da requisição
    rbac/                 Resolução de permissões
    db/                   Schema Drizzle, migrations, seed
    modules/<módulo>/     Regra de negócio: queries · service · actions
    security/             Rate limiting
    storage/              Drivers de arquivo (local em dev, Supabase em produção)
  shared/                 Schemas Zod e tipos usados nos dois lados
tests/                    Vitest contra PostgreSQL real
```

A regra que sustenta tudo: **regra de negócio só existe em
`server/modules/*/service.ts`**. Páginas e componentes não escrevem SQL nem
decidem nada. Detalhes em [`docs/architecture.md`](docs/architecture.md).

## Documentação

| Documento                                      | Conteúdo                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| [`docs/product.md`](docs/product.md)           | O que o sistema é, vocabulário do domínio, regras de negócio, fluxo de referência |
| [`docs/architecture.md`](docs/architecture.md) | Camadas, decisões (ADRs) e o porquê de cada uma                                   |
| [`docs/database.md`](docs/database.md)         | Modelo de dados, integridade, índices, backup                                     |
| [`docs/permissions.md`](docs/permissions.md)   | Catálogo de permissões e matriz de perfis                                         |

## Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example). As que importam:

| Variável                                    | Padrão       | Observação                                                      |
| ------------------------------------------- | ------------ | --------------------------------------------------------------- |
| `DATABASE_URL`                              | vazio        | Vazio = PGlite. **Obrigatória em produção.**                    |
| `AUTH_SECRET`                               | valor de dev | Deriva o hash dos tokens de sessão. **Troque em produção.**     |
| `SESSION_TTL_DAYS`                          | 7            | Validade da sessão, renovada de forma deslizante                |
| `DATABASE_MIGRATION_URL`                    | vazio        | Conexão direta usada só pelas migrations (Supabase: porta 5432) |
| `STORAGE_DRIVER`                            | `local`      | `local` ou `supabase`                                           |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | vazio        | Exigidas com `STORAGE_DRIVER=supabase`. Segredo de servidor     |
| `ALLOW_DEMO_SEED`                           | `true`       | Precisa ser `false` em produção                                 |

A aplicação **valida o ambiente no boot** e recusa subir com configuração
inválida — inclusive se `AUTH_SECRET` ainda for o valor de exemplo em produção.

## Segurança

- Autorização sempre no servidor. A interface esconder um botão é conveniência,
  não proteção: campos sensíveis (valor de contrato, documentos) são **omitidos
  da resposta** para quem não tem a permissão, não escondidos via CSS.
- Senhas com **scrypt** (memory-hard, sem dependência nativa), formato
  versionado para permitir endurecer os parâmetros sem invalidar contas.
- Sessões opacas em banco; o token só existe no cookie, o banco guarda o HMAC.
- Rate limiting no login, por e-mail **e** por IP.
- Validação de entrada com Zod na fronteira; queries parametrizadas pelo Drizzle.
- Auditoria de toda mudança relevante, sem rota de exclusão.
- Dados de demonstração bloqueados em produção por duas barreiras independentes.

Detalhes em [`docs/architecture.md`](docs/architecture.md#6-segurança-resumo-operacional)
e [`docs/permissions.md`](docs/permissions.md).

## Deploy

Produção roda no **Supabase** (Postgres + Storage) — decisão e cuidados no ADR-010 de
[`docs/architecture.md`](docs/architecture.md).

1. No Supabase, em _Project Settings → Database → Connection string_, copie:
   - o **pooler em modo transação** (porta 6543) → `DATABASE_URL`
   - a **conexão direta** ou o pooler em modo sessão (porta 5432) → `DATABASE_MIGRATION_URL`

   Ambas com `?sslmode=require`.

2. Em _Project Settings → API_, copie a URL do projeto e a **service role key** →
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Defina `STORAGE_DRIVER=supabase`.
   Recomendado: remova `public` dos schemas expostos pela Data API — o sistema não a usa.
3. Gere um `AUTH_SECRET` real:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
4. Defina `NODE_ENV=production`, `ALLOW_DEMO_SEED=false` e `APP_URL`.
5. `npm ci && npm run build`
6. `npm run db:migrate` — sempre antes de subir a nova versão. A migration
   `0001_supabase_hardening` fecha a Data API (RLS em todas as tabelas).
7. `npm run db:seed` — em produção só o seed essencial roda.
8. `npm run storage:setup` — cria o bucket **privado** de arquivos.
9. `npm start`
10. Aponte o health check para `GET /api/health`. Ele responde **503** quando o
    banco está fora, e não apenas 200 incondicional.

> Hospedando na **Vercel**: uploads acima de 4,5 MB falham pelo limite de corpo das
> funções serverless. Veja as pendências do ADR-010 antes de escolher o host.

### Backup

`pg_dump` do banco **e** o bucket de arquivos precisam ser restaurados ao mesmo
ponto no tempo — o banco guarda apenas metadados e a chave de storage. O backup
automático do Supabase cobre só o banco; os objetos do Storage precisam de cópia
própria (ver [`docs/database.md`](docs/database.md), seção 8).
