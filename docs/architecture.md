# Arquitetura — Kyvon OS

> Documento vivo. Toda decisão que impacta segurança, custo, arquitetura, dados,
> experiência ou escopo é registrada aqui como ADR (Architecture Decision Record).

## 1. Contexto do discovery

O diretório do projeto estava **vazio** — não havia stack, código ou banco a reaproveitar.
O ambiente de desenvolvimento apurado foi:

| Item                      | Situação     |
| ------------------------- | ------------ |
| Node.js                   | 22.14.0      |
| npm                       | 10.9.2       |
| pnpm / yarn               | ausentes     |
| Docker / Docker Compose   | **ausentes** |
| PostgreSQL local (`psql`) | **ausente**  |
| Git                       | 2.54         |
| SO                        | Windows 11   |

A ausência de Docker e de um PostgreSQL local foi a restrição mais determinante do
projeto: ela define como o banco roda em desenvolvimento (ADR-002).

## 2. Visão geral

Kyvon OS é um **monólito modular** em TypeScript. Uma única aplicação Next.js hospeda
a interface e a camada de servidor, mas o código de domínio vive isolado em módulos
com fronteiras explícitas, de modo que extrair um serviço no futuro seja um refactor
localizado — e não uma reescrita.

```
┌──────────────────────────────────────────────────────────────┐
│  Navegador                                                   │
│  React 19 · Server Components · Client Components pontuais   │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTP (RSC payload, Server Actions, /api)
┌───────────────▼──────────────────────────────────────────────┐
│  Next.js 16 (App Router) — runtime Node                      │
│                                                              │
│  src/app/         rotas, layouts, páginas (camada fina)      │
│  src/components/  design system + componentes de produto     │
│                                                              │
│  ─────────────── fronteira servidor ───────────────          │
│                                                              │
│  src/server/auth/      sessão, senha, contexto de request    │
│  src/server/rbac/      permissões e verificação              │
│  src/server/modules/   ← TODA a regra de negócio             │
│      clients/ crm/ contracts/ projects/ tasks/ approvals/    │
│      marketing/ support/ files/ notifications/ audit/ ...    │
│  src/server/db/        schema Drizzle + acesso a dados       │
│  src/server/storage/   driver de arquivos (local | supabase) │
│  src/shared/           schemas Zod e tipos usados nos 2 lados│
└───────────────┬──────────────────────────────────────────────┘
                │ SQL
┌───────────────▼──────────────────────────────────────────────┐
│  PostgreSQL                                                  │
│  dev/test → PGlite (Postgres embarcado, WASM, sem instalar)  │
│  produção → PostgreSQL gerenciado                            │
└──────────────────────────────────────────────────────────────┘
```

### Regra de dependência

```
app/  →  server/modules/  →  server/db/
  ↓            ↓
components/  shared/  ←  (ambos os lados)
```

- `app/` e `components/` **nunca** escrevem SQL nem contêm regra de negócio.
- `server/modules/` **nunca** importa de `app/` ou `components/`.
- `shared/` não importa nada de `server/` (é enviado ao cliente).

## 3. Camadas

### 3.1 Apresentação (`src/app`, `src/components`)

Server Components por padrão. Um componente vira `"use client"` apenas quando precisa
de estado, evento ou API de browser. A página monta a tela e delega a busca de dados
a um _service_; ela não conhece o banco.

### 3.2 Aplicação (`src/server/modules/<módulo>`)

Cada módulo expõe três arquivos com papéis fixos:

| Arquivo      | Responsabilidade                                                            |
| ------------ | --------------------------------------------------------------------------- |
| `queries.ts` | Leituras. Recebe `AuthContext`, aplica filtro de permissão, retorna DTOs.   |
| `service.ts` | Escritas e regras de negócio. Transação, auditoria, notificação, atividade. |
| `actions.ts` | Server Actions: casca fina que valida entrada (Zod) e chama o service.      |

O _service_ é o único lugar onde uma regra de negócio pode existir. Ele nunca confia
no cliente: recebe sempre o `AuthContext` resolvido no servidor a partir do cookie de
sessão.

### 3.3 Dados (`src/server/db`)

Drizzle ORM com schema tipado. Migrations versionadas em SQL. Sem SQL solto pela
aplicação: consultas ficam dentro de `queries.ts`/`service.ts` do módulo dono da
entidade.

## 4. Superfície de API

Três portas, cada uma com um propósito claro:

| Porta                         | Quando usar                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| **Server Components**         | Leitura na renderização inicial. Chama `queries.ts` direto — sem round-trip HTTP.          |
| **Server Actions**            | Toda mutação vinda da UI. Passa obrigatoriamente por `withPermission()`.                   |
| **Route Handlers** (`/api/*`) | Consumo dinâmico pelo cliente: busca global, notificações, upload/download, `/api/health`. |

Não existe uma quarta porta. Não há REST público na V1 — quando houver integração
externa, ela entra como `/api/v1/*` versionado e autenticado por API key.

## 5. Decisões (ADRs)

### ADR-001 — Next.js 16 (App Router) como monólito modular

**Decisão.** Um único deploy, TypeScript ponta a ponta, React Server Components.

**Porquê.** O escopo da V1 tem 17 módulos que compartilham intensamente o mesmo domínio
(cliente → contrato → projeto → tarefa). Separar front e back em dois repositórios
dobraria o custo de cada feature sem ganho real nessa escala. Server Components
eliminam a maior parte do código de fetch/estado que normalmente polui um painel
operacional.

**Consequência.** Disciplina de camadas passa a ser responsabilidade nossa, não do
framework — por isso a regra de dependência da seção 2 é explícita e verificável.

**Alternativa descartada.** NestJS + SPA Vite: mais cerimônia, dois deploys, dois
sistemas de tipos para manter sincronizados.

### ADR-002 — PGlite em desenvolvimento, PostgreSQL em produção

**Decisão.** O mesmo schema e as mesmas migrations rodam em ambos. `DATABASE_URL`
vazia → PGlite (Postgres compilado para WASM, embarcado no processo, dados em
`.data/pglite`). `DATABASE_URL` preenchida → PostgreSQL real via `postgres-js`.

**Porquê.** A máquina de desenvolvimento não tem Docker nem PostgreSQL. As saídas eram:
(a) exigir instalação de Postgres, (b) usar SQLite em dev, (c) PGlite. A opção (b) é a
armadilha clássica: SQLite não tem enums, `jsonb`, tipos de data decentes nem as mesmas
garantias transacionais — o código passaria a divergir entre dev e produção justamente
nas partes mais delicadas. PGlite **é** PostgreSQL: mesma sintaxe, mesmos tipos, mesmas
migrations, zero instalação.

**Consequência.** PGlite é single-connection e roda no processo — ótimo para dev e
testes, inadequado para produção. Produção exige `DATABASE_URL` (a aplicação recusa
subir em produção sem ela).

**Limite conhecido.** Extensões não empacotadas (ex.: `pg_trgm`) não estão disponíveis
por padrão — ver ADR-005.

### ADR-003 — Autenticação própria por sessão, sem biblioteca de auth

**Decisão.** Sessões opacas em banco. Token de 32 bytes aleatórios entregue em cookie
`httpOnly` + `secure` + `sameSite=lax`; no banco guardamos apenas o **HMAC-SHA256** do
token. Senha com **scrypt** (`node:crypto`), formato versionado
`scrypt$N$r$p$salt$hash`.

**Porquê.** Os requisitos incluem revogação de sessão, auditoria de acesso, permissões
granulares e controle total do fluxo. Bibliotecas de auth resolvem principalmente login
social — fora do escopo — e em troca impõem um modelo de sessão que teríamos de
contornar. Sessão em banco dá revogação imediata e histórico auditável, coisas que um
JWT stateless não dá.

**Porquê scrypt e não bcrypt.** scrypt é memory-hard (resistente a GPU), vem no runtime
Node sem dependência nativa (nada de `node-gyp` no Windows) e não tem o truncamento de
72 bytes do bcrypt. O formato do hash é versionado para permitir migração de algoritmo
sem quebrar contas existentes.

**Consequência.** Vazamento do banco **não** expõe tokens de sessão utilizáveis (só
hashes). Comparações de hash usam `timingSafeEqual`.

### ADR-004 — Etapa e Status são dimensões independentes

**Decisão.** `project.stage` (onde o projeto está no processo) e `project.status`
(situação operacional agora) são colunas distintas, nunca derivadas uma da outra.

**Porquê.** Um projeto pode estar em _Desenvolvimento_ (etapa) e _Aguardando cliente_
(status) ao mesmo tempo. Fundir as duas — erro comum em ferramentas de gestão — torna
impossível responder "o que está parado esperando o cliente?", que é uma das perguntas
centrais do produto.

### ADR-005 — Busca global por `ILIKE` indexado na V1

**Decisão.** A busca consulta as entidades principais em paralelo com `ILIKE`, com
limite por entidade e índices nas colunas de nome/código.

**Porquê.** Full-text com `tsvector`/GIN ou trigram adiciona manutenção de índice e
dependência de extensão (indisponível no PGlite). Para o volume de um sistema interno —
milhares, não milhões de linhas — `ILIKE` com `LIMIT` responde em poucos milissegundos.

**Gatilho de revisão.** Quando qualquer entidade passar de ~100k linhas ou a busca
exceder 200 ms p95, migrar para colunas `tsvector` geradas + índice GIN.

### ADR-006 — Status de workflow como enum; catálogos como tabela

**Decisão.** Status que **dirigem regra de negócio** (status de projeto, tarefa,
contrato, aprovação, chamado) são enums PostgreSQL. O que é só catálogo — tipos de
serviço, origens de lead, categorias, templates — vive em tabela e é editável em
Configurações.

**Porquê.** Se o status fosse texto livre configurável, nenhuma regra poderia depender
dele com segurança ("concluir projeto exige todas as tarefas concluídas" deixaria de ser
verificável). Enum dá exaustividade em tempo de compilação no TypeScript e integridade
no banco. Catálogos não têm semântica de regra, então podem ser dados.

### ADR-007 — Referências polimórficas apenas onde integridade não se aplica

**Decisão.** Vínculos que exigem integridade (arquivo→projeto, comentário→tarefa) usam
**chaves estrangeiras reais com `CHECK` de exclusividade**, nunca
`(entity_type, entity_id)`. O par polimórfico é usado só em `notifications`,
`activities` e `audit_logs`.

**Porquê.** Nessas três tabelas a referência é _navegacional e histórica_: o registro
precisa sobreviver à exclusão da entidade ("Matheus excluiu o contrato X" deve continuar
no log depois que X sumiu). Uma FK real com `CASCADE` apagaria exatamente a evidência
que a auditoria existe para preservar.

### ADR-008 — Storage de arquivos atrás de uma interface

**Decisão.** `StorageDriver` (`src/server/storage/`) com dois drivers: `local` (disco,
dev e hospedagem com volume persistente) e `supabase` (Supabase Storage, produção —
ver ADR-010). Binário **nunca** entra no banco — o banco guarda metadados, a chave de
storage e o checksum SHA-256.

**Regras do módulo de arquivos** (`src/server/modules/files/`):

- A chave de storage é gerada pelo servidor (`aaaa/mm/<uuid>.<ext>`); o nome enviado
  pelo usuário só é exibido, nunca compõe caminho. Os dois drivers recusam chaves com
  `..`, barra inicial ou barra invertida.
- Tipo aceito por **lista fechada de extensões** e conferido pela **assinatura binária**
  (`%PDF`, `PNG`, `PK`, `ftyp`…). O MIME declarado pelo navegador é ignorado; o gravado
  é o da tabela em `src/shared/files.ts`.
- Download sempre por `/api/files/[id]`, com permissão checada a cada pedido. Sai como
  anexo com `CSP: sandbox`; só imagem raster e PDF abrem inline. SVG nunca inline.
- Permissão herdada da entidade vinculada (tabela em `docs/permissions.md`, seção 7).
- Nova versão aponta para a anterior (`previous_file_id`); versões formam uma linha,
  não uma árvore. Material de versão de aprovação já decidida é imutável.
- Em contrato, aditivo e proposta, o feed de atividade diz "anexou um documento" sem o
  nome: quem vê o feed pode não ter `contracts.documents.read`. O nome fica na auditoria.
- Ordem no upload: grava o binário → grava metadados em transação → se o banco falhar,
  apaga o binário. Na exclusão, o inverso: apaga o registro e depois o binário.

**Porquê.** Blobs em banco inflam backup, quebram replicação e tornam a restauração
lenta.

### ADR-009 — Risco aceito: `esbuild` transitivo do `drizzle-kit`

`drizzle-kit@0.31` depende do pacote deprecado `@esbuild-kit/*`, que traz um `esbuild`
com CVE de severidade moderada (o _dev server_ do esbuild aceita requisições de qualquer
origem). **Aceito** porque: (a) é dependência de desenvolvimento, não vai para o bundle
de produção; (b) `drizzle-kit` nunca inicia o dev server do esbuild — só faz transpile
pontual; (c) `npm audit fix --force` rebaixaria `drizzle-kit` para 0.18, versão sem
suporte às migrations que usamos. **Revisar** quando o `drizzle-kit` migrar para `tsx`.

### ADR-010 — Supabase como provedor de produção (Postgres + Storage)

**Decisão.** Produção roda no Supabase: o Postgres gerenciado como banco e o Supabase
Storage como storage de arquivos. A aplicação continua falando com o Postgres pelo
Drizzle/postgres-js (ADR-002) — **não** usa `supabase-js`, a Data API (PostgREST) nem o
Supabase Auth.

**Porquê não usar a Data API nem o Supabase Auth.** Toda regra do sistema — RBAC com
exceções por usuário, envolvimento no projeto, redação de valores financeiros,
auditoria — vive no backend (ADR-003). Reescrevê-la como policies de RLS duplicaria a
lógica em duas linguagens, e qualquer divergência vira brecha. O Supabase entra como
infraestrutura, não como camada de regra.

**Consequências e cuidados:**

1. **Data API fechada.** O Supabase expõe o schema `public` para quem tiver a chave
   anônima (que é pública por natureza). A migration `0001_supabase_hardening` liga RLS
   em todas as tabelas **sem nenhuma policy** e revoga os privilégios de `anon` e
   `authenticated`. A conexão da aplicação usa o dono das tabelas, que ignora RLS. O
   teste `tests/database-hardening.test.ts` falha se alguma tabela ficar sem RLS —
   **toda migration que cria tabela precisa incluir `ENABLE ROW LEVEL SECURITY`**.
   Recomendado também remover `public` dos schemas expostos em _Settings → API_.
2. **Pooler.** A aplicação usa o pooler em modo transação (porta 6543), que não suporta
   prepared statements — por isso `prepare: false` no postgres-js. Migrations usam
   `DATABASE_MIGRATION_URL` (conexão direta ou modo sessão, porta 5432).
3. **Storage privado.** O bucket é criado **privado** por `npm run storage:setup`, que
   também recusa seguir se o bucket existir como público. O acesso é pela service role
   key, que fica só no servidor (nunca `NEXT_PUBLIC_`).
4. **Backup.** O backup do Supabase cobre o banco, **não** os objetos do Storage. Os
   arquivos precisam de rotina própria (ver `docs/database.md`, seção 8).

**Pendências conhecidas (dependem de onde o app for hospedado):**

- **Upload acima de 4,5 MB na Vercel.** Funções serverless da Vercel limitam o corpo da
  requisição a 4,5 MB; o upload passa pela aplicação e falharia acima disso. Em
  hospedagem com processo contínuo (Railway, Render, Fly.io, VPS) não há esse limite.
  Se o destino for a Vercel, o próximo passo é upload direto ao Supabase por URL
  assinada de curta duração, com confirmação no servidor.
- **Rate limit em memória.** O limitador atual é por processo. Com várias instâncias
  (serverless), cada uma conta separado — o limite efetivo fica maior. Migrar para um
  contador compartilhado (tabela no Postgres ou Redis) antes de escalar horizontalmente.

## 6. Segurança (resumo operacional)

Detalhes de permissão em [`permissions.md`](./permissions.md).

- **Autorização sempre no servidor.** Esconder um botão é UX, não segurança. Toda Server
  Action e todo Route Handler passa por `withPermission()`; nenhuma leitura sai de
  `queries.ts` sem `AuthContext`.
- **Validação de entrada** com Zod na fronteira, com o mesmo schema reutilizado no
  formulário do cliente (`src/shared/schemas`).
- **SQL injection** neutralizado por queries parametrizadas do Drizzle. Concatenação de
  string em SQL é proibida.
- **XSS**: React escapa por padrão. `dangerouslySetInnerHTML` é proibido no código de
  produto, com **uma** exceção auditada: o script inline de tema em
  `src/app/layout.tsx`, cujo conteúdo é uma constante literal do próprio código, sem
  nenhum dado de usuário. Qualquer novo uso precisa da mesma justificativa.
- **CSRF**: cookie `sameSite=lax` + verificação de `Origin` no middleware para métodos
  mutantes. Server Actions do Next já validam origem.
- **Rate limiting** em login e endpoints sensíveis (janela deslizante em memória na V1;
  a interface permite trocar por Redis sem tocar nos chamadores).
- **Upload**: allowlist de MIME + extensão, limite de tamanho, nome sanitizado, chave de
  storage gerada pelo servidor (o nome enviado pelo usuário nunca vira caminho).
- **Segredos** somente por variável de ambiente; a aplicação valida o ambiente no boot e
  recusa subir em produção com `AUTH_SECRET` fraco.

## 7. Performance

Paginação obrigatória em toda listagem (padrão 25, teto 100). Filtro e ordenação no
banco, nunca em memória. Índices em toda FK e em colunas de filtro frequente (`status`,
`due_date`, `assignee_id`). Debounce de 250 ms na busca. Contagens de dashboard
resolvidas em agregações, não carregando linhas.

## 8. Testes

`vitest`. Unitários para regras puras (permissão, cálculo de progresso, transições de
status). Integração contra PGlite em memória, com banco recriado por suíte — os fluxos
críticos do documento de produto rodam ponta a ponta.

## 9. Ambientes

|               | Desenvolvimento         | Teste             | Produção          |
| ------------- | ----------------------- | ----------------- | ----------------- |
| Banco         | PGlite (`.data/pglite`) | PGlite em memória | Supabase Postgres |
| Storage       | disco local             | memória           | Supabase Storage  |
| Seed demo     | permitido               | fixtures          | **bloqueado**     |
| `/api/health` | sim                     | sim               | sim               |
