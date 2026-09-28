# Banco de dados — Kyvon OS

PostgreSQL. Em desenvolvimento roda como PGlite embarcado; em produção, um
PostgreSQL gerenciado. Mesmo schema, mesmas migrations (ADR-002).

**Estado atual:** 43 tabelas · 31 enums · 123 chaves estrangeiras · 170 índices ·
5 constraints CHECK.

## 1. Convenções

| Aspecto           | Convenção                                                                   |
| ----------------- | --------------------------------------------------------------------------- |
| Nomes             | `snake_case` no banco, `camelCase` no TypeScript                            |
| Tabelas           | plural (`projects`, `support_tickets`)                                      |
| Chave primária    | `uuid` gerado na aplicação (`crypto.randomUUID`)                            |
| Código legível    | `code varchar` único por entidade (`PRJ-0042`), gerado por `code_sequences` |
| Datas de negócio  | `date` — prazo não tem fuso horário                                         |
| Instantes         | `timestamptz` — sempre UTC no banco                                         |
| Dinheiro          | `numeric(14,2)` — nunca `float`                                             |
| Horas             | `numeric(7,2)`                                                              |
| Criação/alteração | `created_at` / `updated_at` em toda tabela de entidade                      |
| Exclusão          | `deleted_at` apenas onde o histórico precisa sobreviver                     |

### Por que UUID e não `serial`

Um `serial` na URL entrega o volume de negócio a qualquer um que saiba contar
(`/clients/3` diz que a Kyvon tem 3 clientes). Além disso, o UUID gerado na
aplicação permite montar todo o grafo de objetos **antes** de tocar o banco — é
o que torna a criação de um projeto inteiro a partir de um template (etapas +
tarefas + checklists + dependências) uma única transação.

### Código legível ao lado do UUID

O UUID é a chave; o `code` é o que as pessoas falam em reunião. Ambos existem.
`code_sequences` gera os códigos com `UPDATE … RETURNING`, o que é atômico e
participa da mesma transação da entidade — se a criação falha, o número não é
queimado.

## 2. Grupos de tabelas

### Identidade e acesso (6)

```
roles ──┬── role_permissions ── permissions
        │                            │
      users ── user_permissions ─────┘
        │
     sessions
```

`users.password_hash` guarda `scrypt$N$r$p$salt$hash`. `sessions.token_hash`
guarda o HMAC-SHA256 do token — o token em si só existe no cookie do navegador.

### CRM (7)

`lead_sources`, `service_types` — catálogos editáveis em Configurações.

```
leads ──converte──► clients ──► contacts
                       │
                 opportunities ──► proposals
```

`leads.converted_client_id` / `converted_contact_id` / `converted_opportunity_id`
preservam o rastro da conversão. `opportunities.lead_id` fecha o ciclo na outra
direção — é uma FK circular, possível porque ambas as colunas são nulas.

### Contratos (2)

```
contracts ──► contract_addendums
```

`contract_addendums.value_delta` é **delta**, não valor final: o total do
contrato é o valor base mais a soma dos aditivos ativos. Guardar o total
recalculado em cada aditivo criaria duas fontes de verdade.

### Projetos (8)

```
project_templates ──► project_template_stages ──► project_template_tasks
                                                       ├── checklist_items
                                                       └── task_dependencies

projects ──► project_stages          projects ──► project_members
   └── current_stage_id ─────────────────┘
```

`projects.current_stage_id` aponta para `project_stages` — FK circular resolvida
depois que as etapas são criadas, dentro da mesma transação.

`projects.status` e `projects.current_stage_id` são **independentes** (ADR-004).

### Tarefas (5)

```
tasks ──┬── task_dev_details (1:1, esparsa)
        ├── task_checklist_items
        ├── task_dependencies (auto-relacionamento)
        ├── task_watchers
        └── parent_task_id (subtarefas)
```

Campos técnicos (repositório, branch, PR, ambiente, versão, release) ficam em
`task_dev_details` — tabela 1:1 separada porque só tarefas de desenvolvimento os
preenchem, e não faz sentido carregar seis colunas nulas em toda tarefa.

### Aprovações (2), Escopo (1), Suporte (1), Marketing (3)

```
approvals ──► approval_versions      (v1 → v2 → v3, nunca sobrescreve)
scope_changes ──► contract_addendums (quando aprovada com impacto financeiro)
support_tickets ──► opportunities    (quando é "nova demanda")
marketing_campaigns ──► marketing_contents        cases ──► projects (1:1)
```

### Plataforma (8)

`files`, `file_links`, `comments`, `notifications`, `activities`, `audit_logs`,
`organization`, `code_sequences`.

## 3. Integridade

### Vínculo exclusivo em vez de polimorfismo

`file_links` e `comments` precisam apontar para muitas entidades diferentes. A
solução comum — `(entity_type, entity_id)` — abre mão de chave estrangeira e,
com ela, de qualquer garantia do banco. Aqui cada alvo possível é uma coluna FK
nula, e um CHECK exige que exatamente uma esteja preenchida:

```sql
CONSTRAINT file_links_exactly_one_target
  CHECK (num_nonnulls(client_id, proposal_id, contract_id, …, case_id) = 1)
```

Custo: colunas nulas a mais. Ganho: o banco impede um arquivo órfão ou vinculado
a dois donos, e `ON DELETE CASCADE` funciona de verdade.

### Onde o polimorfismo é correto

`notifications`, `activities` e `audit_logs` usam `(entity_type, entity_id)` —
deliberadamente (ADR-007). Esses registros **precisam sobreviver** à exclusão da
entidade: um log que diz "Matheus excluiu o contrato X" não pode ser apagado
junto com X. `activities.entity_label` congela o nome no momento do evento, para
o feed continuar legível mesmo após renomeação.

### Regras de negócio no banco

| Constraint                      | Garante                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `tasks_blocked_requires_reason` | Tarefa `blocked` sem motivo e data é rejeitada pelo banco |
| `task_dependencies_no_self`     | Tarefa não depende de si mesma                            |
| `comments_exactly_one_target`   | Comentário pertence a exatamente um dono                  |
| `file_links_exactly_one_target` | Arquivo vinculado a exatamente um dono                    |
| `organization_singleton`        | Exatamente uma linha de configuração da empresa           |

O _service_ também valida — mas a constraint é a rede de segurança que vale
mesmo quando alguém escreve no banco por fora.

### Política de exclusão por relação

| Relação                         | Política   | Razão                                |
| ------------------------------- | ---------- | ------------------------------------ |
| `contracts.client_id`           | `RESTRICT` | Não se apaga cliente com contrato    |
| `projects.client_id`            | `RESTRICT` | Idem para projetos                   |
| `tasks.project_id`              | `CASCADE`  | Tarefa não existe fora do projeto    |
| `approval_versions.approval_id` | `CASCADE`  | Versão não existe sem a aprovação    |
| `*.owner_id`, `*.assignee_id`   | `SET NULL` | Desligar alguém não apaga o trabalho |
| `users.role_id`                 | `RESTRICT` | Não se apaga perfil em uso           |

## 4. Índices

Além de toda FK, há índices nas colunas efetivamente usadas em filtro:
`status`, `due_date`, `assignee_id`, `client_id`, `project_id`, `code`.

Índices compostos onde a consulta é quente:

- `tasks (assignee_id, status, due_date)` — "minhas tarefas de hoje", a consulta
  mais executada do sistema.
- `notifications (user_id, read_at, created_at)` — badge de não lidas e lista do
  painel.
- `activities (project_id, created_at)` / `(client_id, created_at)` — feeds.

## 5. Migrations

Arquivos SQL versionados em `drizzle/`, gerados a partir do schema TypeScript.

```bash
npm run db:generate    # schema alterado → novo arquivo SQL
npm run db:migrate     # aplica o que estiver pendente
npm run db:reset       # apaga e recria (bloqueado em produção)
npm run db:seed        # dados iniciais
```

O schema TypeScript em `src/server/db/schema/` é a fonte de verdade. **Nunca**
edite um arquivo de migration já aplicado — altere o schema e gere outro.

**Tabela nova precisa de RLS.** Toda migration que cria tabela deve incluir
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (sem policy). É o que impede a Data API
do Supabase de expor a tabela (ADR-010); `tests/database-hardening.test.ts` falha
se alguma ficar de fora. Migration com SQL manual:
`npx drizzle-kit generate --custom --name=<nome>`.

No Supabase, as migrations rodam pela `DATABASE_MIGRATION_URL` (conexão direta):
o pooler em modo transação, usado pela aplicação, não serve para DDL.

## 6. Seed

Dois conjuntos, separados de propósito:

|                  | Conteúdo                                                          | Produção      |
| ---------------- | ----------------------------------------------------------------- | ------------- |
| **Essencial**    | Perfis, permissões, catálogos, templates, organização, contadores | roda          |
| **Demonstração** | Clientes, oportunidades, contratos, projetos, tarefas fictícios   | **bloqueado** |

O seed de demonstração exige `ALLOW_DEMO_SEED=true`, e o validador de ambiente
recusa subir em produção com essa variável ligada. Dado falso nunca entra em
produção por acidente.

## 7. Diferença observável entre os drivers

Uma só, e está isolada: `db.execute()` devolve um array de linhas no postgres-js
e `{ rows, fields, rowCount }` no PGlite. Por isso a aplicação usa
`executeRows()` de `src/server/db/client.ts`, que normaliza os dois — ou, de
preferência, o query builder do Drizzle, que já é uniforme.

## 8. Backup e recuperação

Produção (Supabase): backup diário do próprio Supabase e, se contratado,
point-in-time recovery; além disso, `pg_dump` periódico pela `DATABASE_MIGRATION_URL`
guardado fora do Supabase, para não depender de um único provedor.

O **Storage não entra no backup do banco**. Os objetos do bucket precisam de cópia
própria (a API do Storage é compatível com S3, então `rclone` ou `aws s3 sync`
funcionam). Restaurar só o banco deixa metadados apontando para binários
inexistentes — os dois precisam voltar ao mesmo ponto no tempo. A coluna
`files.checksum` (SHA-256) permite conferir, depois de uma restauração, que cada
binário é exatamente o que foi enviado.

Desenvolvimento: `.data/pglite` é descartável. `npm run db:reset && npm run db:seed`
reconstrói tudo.
