# Permissões e controle de acesso — Kyvon OS

## 1. Modelo

O controle de acesso é **RBAC com sobreposição granular por usuário**.

```
Usuário ──1:1──► Perfil (Role) ──N:N──► Permissões
   │
   └──N:N──► Sobreposições (allow / deny) em permissões específicas
```

O perfil define a base. A sobreposição existe porque a realidade não cabe em sete
caixas: o designer que também cuida do suporte, o dev que precisa ver valores de um
contrato específico. Sem isso a saída inevitável seria promover a pessoa a ADMIN — que é
como controles de acesso morrem na prática.

### Resolução (ordem de precedência)

```
1. deny explícito no usuário   → NEGA   (vence tudo, inclusive ADMIN)
2. allow explícito no usuário  → PERMITE
3. permissão concedida ao perfil → PERMITE
4. perfil é ADMIN              → PERMITE
5. caso contrário              → NEGA   (default deny)
```

`deny` vencer o ADMIN é deliberado: permite criar um administrador de sistema que
mesmo assim não enxerga valores financeiros, sem inventar um perfil novo.

O conjunto efetivo é calculado **uma vez por requisição**, junto com a sessão, e viaja no
`AuthContext`. Não há consulta ao banco a cada verificação.

## 2. Formato das permissões

`<módulo>.<recurso?>.<ação>` — sempre em minúsculas.

Ações: `read`, `write`, `delete`, `manage` (`manage` implica administrar configuração do
módulo, não é superconjunto automático de `read`/`write` — precisa ser concedido junto).

### Catálogo completo

| Chave                       | O que libera                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| **Clientes**                |                                                                     |
| `clients.read`              | Ver clientes, contatos e a timeline de relacionamento               |
| `clients.write`             | Criar e editar clientes e contatos                                  |
| `clients.delete`            | Arquivar cliente                                                    |
| **Comercial**               |                                                                     |
| `crm.read`                  | Ver leads, oportunidades, pipeline e propostas                      |
| `crm.write`                 | Criar/editar/mover oportunidades, leads e propostas                 |
| `crm.values.read`           | **Ver valores** de oportunidades e propostas                        |
| `crm.convert`               | Converter oportunidade ganha em contrato                            |
| **Contratos**               |                                                                     |
| `contracts.read`            | Ver contratos (sem valores nem documento)                           |
| `contracts.write`           | Criar/editar contratos e aditivos                                   |
| `contracts.values.read`     | **Ver valores, pagamento e condições financeiras**                  |
| `contracts.documents.read`  | **Baixar o documento contratual e anexos jurídicos**                |
| `contracts.delete`          | Cancelar contrato                                                   |
| **Projetos**                |                                                                     |
| `projects.read`             | Ver projetos, etapas e progresso                                    |
| `projects.write`            | Criar/editar projetos, etapas e equipe                              |
| `projects.delete`           | Cancelar projeto e gerenciar qualquer projeto, mesmo fora da equipe |
| `projects.templates.manage` | Criar e editar templates de projeto                                 |
| **Tarefas**                 |                                                                     |
| `tasks.read`                | Ver tarefas                                                         |
| `tasks.write`               | Criar/editar tarefas, comentar, mover status                        |
| `tasks.assign`              | Atribuir tarefa a outra pessoa                                      |
| `tasks.delete`              | Excluir tarefa e gerenciar qualquer tarefa, mesmo fora do projeto   |
| **Aprovações**              |                                                                     |
| `approvals.read`            | Ver aprovações e versões                                            |
| `approvals.write`           | Solicitar aprovação e enviar nova versão                            |
| `approvals.decide`          | **Aprovar ou solicitar ajustes**                                    |
| **Mudança de escopo**       |                                                                     |
| `scope.read`                | Ver solicitações de mudança de escopo                               |
| `scope.write`               | Registrar solicitação                                               |
| `scope.decide`              | **Aprovar ou recusar mudança de escopo**                            |
| **Marketing**               |                                                                     |
| `marketing.read`            | Ver campanhas, conteúdos e calendário                               |
| `marketing.write`           | Criar/editar campanhas e conteúdos                                  |
| `marketing.publish`         | Marcar conteúdo como publicado                                      |
| `cases.read`                | Ver cases                                                           |
| `cases.write`               | Criar/editar cases e registrar autorização                          |
| **Suporte**                 |                                                                     |
| `support.read`              | Ver chamados                                                        |
| `support.write`             | Criar/editar/responder chamados                                     |
| `support.assign`            | Atribuir chamado                                                    |
| **Arquivos**                |                                                                     |
| `files.read`                | Listar e baixar arquivos (respeitando o vínculo)                    |
| `files.write`               | Enviar arquivos                                                     |
| `files.delete`              | Excluir arquivo                                                     |
| **Relatórios**              |                                                                     |
| `reports.read`              | Painéis gerenciais                                                  |
| `reports.financial.read`    | **Indicadores com valores financeiros**                             |
| **Administração**           |                                                                     |
| `users.read`                | Ver usuários                                                        |
| `users.write`               | Convidar, editar e suspender usuários                               |
| `roles.manage`              | Editar perfis e permissões                                          |
| `settings.manage`           | Configurações da empresa, catálogos, integrações                    |
| `audit.read`                | Ler o log de auditoria                                              |

As permissões em **negrito** são as sensíveis: valores financeiros, documentos
contratuais e poder de decisão. Elas nunca vêm junto por padrão — precisam ser
concedidas explicitamente.

## 3. Perfis padrão

|                             | ADMIN | GESTOR | COMERCIAL | MARKETING | DESIGN | DEV | SUPORTE |
| --------------------------- | :---: | :----: | :-------: | :-------: | :----: | :-: | :-----: |
| `clients.read`              |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |    ●    |
| `clients.write`             |   ●   |   ●    |     ●     |           |        |     |    ●    |
| `clients.delete`            |   ●   |   ●    |           |           |        |     |         |
| `crm.read`                  |   ●   |   ●    |     ●     |     ●     |        |     |    ●    |
| `crm.write`                 |   ●   |   ●    |     ●     |           |        |     |         |
| `crm.values.read`           |   ●   |   ●    |     ●     |           |        |     |         |
| `crm.convert`               |   ●   |   ●    |     ●     |           |        |     |         |
| `contracts.read`            |   ●   |   ●    |     ●     |           |   ●    |  ●  |    ●    |
| `contracts.write`           |   ●   |   ●    |           |           |        |     |         |
| `contracts.values.read`     |   ●   |   ●    |     ●     |           |        |     |         |
| `contracts.documents.read`  |   ●   |   ●    |           |           |        |     |         |
| `contracts.delete`          |   ●   |   ●    |           |           |        |     |         |
| `projects.read`             |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |    ●    |
| `projects.write`            |   ●   |   ●    |           |           |   ●    |  ●  |         |
| `projects.delete`           |   ●   |   ●    |           |           |        |     |         |
| `projects.templates.manage` |   ●   |   ●    |           |           |        |     |         |
| `tasks.read`                |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |    ●    |
| `tasks.write`               |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |    ●    |
| `tasks.assign`              |   ●   |   ●    |           |     ●     |   ●    |  ●  |    ●    |
| `tasks.delete`              |   ●   |   ●    |           |           |        |     |         |
| `approvals.read`            |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |    ●    |
| `approvals.write`           |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |         |
| `approvals.decide`          |   ●   |   ●    |           |           |        |     |         |
| `scope.read`                |   ●   |   ●    |     ●     |           |   ●    |  ●  |    ●    |
| `scope.write`               |   ●   |   ●    |     ●     |           |   ●    |  ●  |    ●    |
| `scope.decide`              |   ●   |   ●    |           |           |        |     |         |
| `marketing.read`            |   ●   |   ●    |           |     ●     |   ●    |     |         |
| `marketing.write`           |   ●   |   ●    |           |     ●     |        |     |         |
| `marketing.publish`         |   ●   |   ●    |           |     ●     |        |     |         |
| `cases.read`                |   ●   |   ●    |     ●     |     ●     |   ●    |     |         |
| `cases.write`               |   ●   |   ●    |           |     ●     |        |     |         |
| `support.read`              |   ●   |   ●    |     ●     |           |        |  ●  |    ●    |
| `support.write`             |   ●   |   ●    |           |           |        |  ●  |    ●    |
| `support.assign`            |   ●   |   ●    |           |           |        |     |    ●    |
| `files.read`                |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |    ●    |
| `files.write`               |   ●   |   ●    |     ●     |     ●     |   ●    |  ●  |    ●    |
| `files.delete`              |   ●   |   ●    |           |           |        |     |         |
| `reports.read`              |   ●   |   ●    |     ●     |     ●     |        |     |    ●    |
| `reports.financial.read`    |   ●   |   ●    |           |           |        |     |         |
| `users.read`                |   ●   |   ●    |           |           |        |     |         |
| `users.write`               |   ●   |        |           |           |        |     |         |
| `roles.manage`              |   ●   |        |           |           |        |     |         |
| `settings.manage`           |   ●   |        |           |           |        |     |         |
| `audit.read`                |   ●   |   ●    |           |           |        |     |         |

Perfis são marcados `is_system` e não podem ser excluídos; suas permissões **podem** ser
ajustadas por quem tem `roles.manage`, e cada ajuste é auditado.

## 4. Onde a verificação acontece

**Sempre no servidor.** Três pontos, nesta ordem:

1. **Middleware** — só verifica se existe sessão válida e valida `Origin` em métodos
   mutantes. Não faz autorização de recurso.
2. **Server Action / Route Handler** — `withPermission('contracts.write')` roda antes de
   qualquer efeito. É a fronteira de autorização real.
3. **Query** — leituras recebem o `AuthContext` e aplicam o recorte: campos sensíveis são
   **omitidos do resultado**, não apenas escondidos na tela.

O passo 3 é o que impede o vazamento clássico: sem ele, um usuário sem
`contracts.values.read` receberia o valor no payload RSC e bastaria abrir o DevTools.
`queries.ts` retorna `value: null` para quem não pode ver — o dado não sai do servidor.

A UI usa `can()` apenas para decidir o que renderizar. Isso é conveniência, nunca
proteção.

## 5. Escopo por registro (V1)

Além da permissão, a V1 aplica dois recortes de visibilidade:

- **Projetos**: todos com `projects.read` enxergam a lista completa (transparência
  operacional é um requisito do produto). Editar exige `projects.write` **e** ser
  responsável ou membro da equipe do projeto — exceto para quem tem `projects.delete`,
  que gerencia qualquer projeto.
- **Tarefas**: todos com `tasks.read` veem todas. Editar exige `tasks.write` **e**
  envolvimento: ser responsável ou criador da tarefa, ou responsável ou membro do
  projeto — exceto para quem tem `tasks.delete`, que gerencia qualquer tarefa.

`projects.delete` e `tasks.delete` funcionam, portanto, como o poder de gestão ampla do
módulo. Na matriz padrão só Admin e Gestor os têm. A escolha evita checar nome de perfil
no código — o que anularia as sobreposições granulares por usuário.

Não há multi-tenant: o sistema é de uso interno da Kyvon, um único espaço
organizacional. Introduzir `organization_id` agora seria complexidade sem demanda.

## 6. Auditoria

Toda mudança de permissão, perfil, usuário ou sessão gera registro em `audit_logs` com
autor, momento, entidade, valor anterior e novo valor. `audit_logs` não tem rota de
exclusão — nem para ADMIN. Retenção e expurgo, quando existirem, serão tarefa
administrativa fora da aplicação.

## 7. Arquivos

Arquivo não tem permissão de leitura própria além de `files.*`: ele **herda a da
entidade** a que está vinculado. Todas as colunas exigem também `files.read` (ver)
ou `files.write` (enviar). Implementação em `src/server/modules/files/access.ts`.

| Vinculado a         | Para ver                                      | Para enviar                                                                 |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| Cliente             | `clients.read`                                | `clients.write`                                                             |
| Proposta            | `crm.read` + `crm.values.read`                | `crm.write` + `crm.values.read`                                             |
| Contrato / aditivo  | `contracts.read` + `contracts.documents.read` | `contracts.write` + `contracts.documents.read`                              |
| Projeto             | `projects.read`                               | `projects.write` + equipe do projeto¹                                       |
| Tarefa              | `tasks.read`                                  | `tasks.write` + envolvimento na tarefa¹                                     |
| Versão de aprovação | `approvals.read`                              | `approvals.write` + equipe do projeto¹ (só enquanto a versão está pendente) |
| Mudança de escopo   | `scope.read`                                  | `scope.write`                                                               |
| Chamado             | `support.read`                                | `support.write`                                                             |
| Conteúdo            | `marketing.read`                              | `marketing.write`                                                           |
| Case                | `cases.read`                                  | `cases.write`                                                               |

¹ Mesma regra de edição da seção 5; `projects.delete` / `tasks.delete` dispensam o
envolvimento.

- **Proposta** exige `crm.values.read` porque o PDF de uma proposta mostra preço — a
  mesma informação que a tela omite de quem não tem essa permissão.
- **Excluir** exige `files.delete` (Admin e Gestor na matriz padrão) e fica registrado
  na auditoria com nome, tamanho e checksum. Material de versão de aprovação já decidida
  não pode ser excluído: faz parte do histórico.
- Quem não pode ver um arquivo recebe **404**, não 403 — a resposta não confirma que
  ele existe.
- No feed de contrato, aditivo e proposta, o upload aparece como "anexou um documento",
  sem o nome, porque quem vê o feed pode não ter `contracts.documents.read`.

## 8. Aprovações

| Ação                                              | Exige                                                        |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Ver aprovações e o histórico de versões           | `approvals.read`                                             |
| Pedir, editar dados, enviar nova versão, cancelar | `approvals.write` + equipe do projeto (ou `projects.delete`) |
| Aprovar ou solicitar ajustes                      | `approvals.decide`                                           |

- **Quem aprova** é uma pessoa da equipe com `approvals.decide` efetiva (perfil e
  exceções individuais consideradas) ou um contato do cliente marcado como
  _autorizado a aprovar_. Quando é o cliente, a equipe registra a decisão dele.
- **Ninguém aprova o próprio material.** Em aprovação interna, quem enviou a versão
  não pode decidir sobre ela. Com aprovador do cliente a regra não se aplica: quem
  registra está repassando a decisão de outra pessoa.
- A decisão é sempre sobre uma versão específica: se a tela estiver desatualizada
  (a v2 já foi enviada e a pessoa decide "a v1"), o servidor recusa.
- Decidida a versão, o material dela fica travado (seção 7) e a decisão não muda.
  Aprovado é final; mudança posterior é uma nova aprovação.

## 9. Mudanças de escopo

| Ação                                                            | Exige                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Ver mudanças de escopo                                          | `scope.read`                                                               |
| Registrar, analisar impacto, enviar para aprovação, implementar | `scope.write`                                                              |
| Aprovar ou recusar                                              | `scope.decide`                                                             |
| Devolver para análise                                           | `scope.write` ou `scope.decide`                                            |
| Ajustar o prazo do projeto ao aprovar                           | `scope.decide` + poder editar o projeto (seção 5)                          |
| Gerar aditivo a partir da mudança                               | `contracts.write` (+ `contracts.values.read` se houver impacto financeiro) |

- **Registrar não exige ser da equipe.** O pedido de mudança costuma chegar por quem
  fala com o cliente (comercial, suporte). Perder o registro é pior do que recebê-lo
  de fora do projeto.
- **Impacto financeiro segue a regra de valores de contrato:** sem
  `contracts.values.read`, o valor sai como "restrito" da consulta, e quem não vê o
  valor também não o altera — o campo é ignorado no servidor e o valor atual mantido.
- **O escopo do contrato nunca é editado** por este fluxo. Aprovada, a mudança gera no
  máximo **um** aditivo em rascunho, criado e vinculado na mesma transação. Ativar o
  aditivo continua sendo passo do fluxo de contratos.

## 10. Suporte

| Ação                                                      | Exige            |
| --------------------------------------------------------- | ---------------- |
| Ver chamados                                              | `support.read`   |
| Abrir, editar, mudar status, registrar interação, assumir | `support.write`  |
| Atribuir a outra pessoa (ou tirar de outra pessoa)        | `support.assign` |
| Enviar ao Comercial                                       | `support.write`  |

- **Responsável** precisa ter `support.write` efetiva — chamado não é atribuído a quem
  não atende.
- **Enviar ao Comercial é o único caminho em que alguém sem `crm.write` cria uma
  oportunidade.** Por isso nenhum campo vem do formulário: título, cliente, contato,
  origem ("Cliente existente") e responsável (o dono do cliente) são derivados do
  chamado. A oportunidade gerada só aparece no chamado para quem tem `crm.read`.
- **Prazo de atendimento** mede a primeira resposta: abertura + horas da prioridade
  (`SUPPORT_SLA_HOURS`). Responder é sair de "Aberto" ou registrar uma resposta ao
  cliente. Mudar a prioridade antes disso recalcula a partir da abertura — rebaixar
  a prioridade não reinicia o relógio.

## 11. Marketing e cases

| Ação                                                   | Exige                                   |
| ------------------------------------------------------ | --------------------------------------- |
| Ver conteúdos, calendário e campanhas                  | `marketing.read`                        |
| Criar, editar, mover conteúdo; campanhas               | `marketing.write`                       |
| Publicar conteúdo (registrar link)                     | `marketing.write` + `marketing.publish` |
| Ver cases                                              | `cases.read`                            |
| Abrir case, registrar autorização, editar texto, mover | `cases.write`                           |
| Publicar case                                          | `cases.write` + `marketing.publish`     |

- **Publicar é o passo que põe algo em nome da Kyvon no ar** — por isso tem permissão
  própria, separada de produzir. Publicado é final nos dois casos.
- **Case exige autorização registrada do cliente**: qual contato autorizou, quando e
  como (e-mail, reunião, documento). Sem ela o texto pode ser rascunhado, mas o case não
  entra em produção nem é publicado. Uma recusa bloqueia até a autorização ser pedida de
  novo.
- Links publicados só aceitam `http(s)://` — nada de `javascript:` virando link na tela.
