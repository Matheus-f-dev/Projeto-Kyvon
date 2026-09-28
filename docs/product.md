# Produto — Kyvon OS

## 1. O que este sistema é

O centro operacional da Kyvon. Um lugar onde o ciclo completo de um trabalho —
da primeira conversa com um possível cliente até o suporte pós-lançamento — existe
como uma cadeia conectada, sem redigitação e sem histórico perdido.

O teste de sucesso é responder, em segundos e sem abrir dez telas:

> O que está acontecendo? O que está atrasado? O que está bloqueado? O que depende do
> cliente? O que precisa da minha atenção hoje?

## 2. O que este sistema não é

- Não é um painel administrativo de CRUDs.
- Não é uma ferramenta para o cliente final usar (não há portal do cliente na V1 —
  aprovações são registradas _pela equipe_, a partir do retorno do cliente).
- Não é um sistema financeiro/contábil. Registra valores contratados; não emite nota,
  não concilia banco, não fecha caixa.
- Não é um substituto de Git/CI. A área DEV referencia repositório, branch e PR; não os
  gerencia.

## 3. A cadeia central

```
  Lead ──converte──► Cliente + Contato + Oportunidade
                                            │
                                        Proposta (v1, v2, …)
                                            │
                                         ganha
                                            ▼
                                        Contrato ──► Aditivos
                                            │
                                         origina
                                            ▼
                          Projeto ◄── Template (gera etapas + tarefas)
                             │
             ┌───────────────┼───────────────┬──────────────┐
             ▼               ▼               ▼              ▼
          Etapas          Tarefas       Aprovações   Mudanças de escopo
                             │               │              │
                        comentários     versões v1,v2   aditivo (opcional)
                        checklists
                        dependências
                             │
                         Lançamento
                             ▼
                          Suporte ──"nova demanda"──► volta para o Comercial
```

**Nada é redigitado.** Cada seta transporta os dados da etapa anterior: a conversão de
oportunidade em contrato já traz cliente, serviço, escopo e valor da proposta aceita; o
projeto nasce do contrato; as tarefas nascem do template.

**Nada é sobrescrito.** Escopo original, versões de aprovação e contratos encerrados
permanecem consultáveis. O sistema acumula histórico em vez de substituir estado.

## 4. Vocabulário do domínio

Termos com significado preciso. Confundi-los quebra o modelo.

| Termo                 | Definição                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| **Lead**              | Contato ainda não qualificado. Pode nunca virar cliente. Vive fora do CRM principal até ser convertido. |
| **Cliente**           | Empresa com quem existe (ou existiu) relação comercial.                                                 |
| **Contato**           | Pessoa dentro de um cliente.                                                                            |
| **Oportunidade**      | Uma negociação específica com um cliente. Um cliente pode ter várias.                                   |
| **Proposta**          | Documento comercial versionado dentro de uma oportunidade.                                              |
| **Contrato**          | Acordo firmado. Define escopo, valor, prazo, revisões e suporte.                                        |
| **Projeto**           | Execução de um contrato. Um contrato pode gerar mais de um projeto.                                     |
| **Etapa**             | _Onde_ o projeto está no processo (Descoberta → … → Lançamento).                                        |
| **Status**            | _Como_ o projeto está agora (Em andamento, Bloqueado, Aguardando cliente…).                             |
| **Tarefa**            | Unidade de trabalho com responsável e prazo.                                                            |
| **Aprovação**         | Pedido formal de validação de um material, com versões.                                                 |
| **Mudança de escopo** | Pedido de alteração do que foi contratado, com impacto medido.                                          |
| **Chamado**           | Demanda pós-lançamento vinculada a um projeto/contrato.                                                 |

### Etapa ≠ Status

A distinção mais importante do produto. Um projeto em **Desenvolvimento** (etapa) pode
estar **Aguardando cliente** (status). Se fossem o mesmo campo, a pergunta "o que está
parado esperando o cliente?" não teria resposta.

| Etapa (processo) | Status (situação)  |
| ---------------- | ------------------ |
| Descoberta       | Planejamento       |
| Estratégia       | Em andamento       |
| Design           | Aguardando cliente |
| Desenvolvimento  | Bloqueado          |
| Lançamento       | Pausado            |
|                  | Concluído          |
|                  | Cancelado          |

## 5. Regras de negócio que o sistema garante

Estas são invariantes — implementadas no _service_, cobertas por teste, não opcionais.

1. **Oportunidade ganha exige cliente.** Não é possível marcar `won` sem cliente
   vinculado.
2. **Conversão é idempotente.** Uma oportunidade gera no máximo um contrato pela ação
   "Converter em contrato". Reexecutar abre o contrato existente.
3. **Contrato ativo exige data de início.** E `end_date >= start_date`.
4. **Projeto herda cliente do contrato.** Se há contrato, o cliente não é escolhido à
   mão — é derivado. Impede divergência.
5. **Bloqueio exige justificativa.** Status `blocked` em tarefa ou projeto só é aceito
   com motivo, data de início do bloqueio e responsável pela resolução.
6. **Tarefa não conclui com dependência aberta.** Uma tarefa bloqueada por outra não
   pode ir para `done` antes da predecessora.
7. **Aprovação nunca é sobrescrita.** "Solicitar ajustes" fecha a versão atual e abre a
   próxima (v1 → v2). O histórico de decisões é imutável.
8. **Escopo original é imutável.** Mudança de escopo cria um registro novo com impacto
   em horas, prazo e valor; jamais edita o escopo do contrato. Se aprovada e com impacto
   financeiro, sugere a criação de um aditivo.
9. **Projeto só conclui com aprovações resolvidas.** Nenhuma aprovação pode estar
   `pending` ou `changes_requested`.
10. **Contrato encerrado não desaparece.** Encerramento é mudança de status; exclusão de
    contrato não existe — existe cancelamento, que também preserva o registro.
11. **Chamado "nova demanda" vira oportunidade.** A ação gera uma oportunidade no
    pipeline já vinculada ao cliente, ao projeto de origem e ao chamado.
12. **Toda mudança relevante é auditada.** Autor, momento, campo, valor anterior, valor
    novo.

## 6. Módulos e a razão de cada um existir

| Módulo            | Pergunta que responde                                  |
| ----------------- | ------------------------------------------------------ |
| **Dashboard**     | O que está acontecendo na Kyvon agora?                 |
| **Meu trabalho**  | O que _eu_ preciso fazer hoje?                         |
| **Clientes**      | Quem são, e qual é a história com cada um?             |
| **Comercial**     | O que está em negociação e qual a próxima ação?        |
| **Contratos**     | O que foi acordado, por quanto, até quando?            |
| **Projetos**      | O que está sendo entregue e em que pé está?            |
| **Tarefas**       | Quem está fazendo o quê?                               |
| **Aprovações**    | O que está parado esperando validação?                 |
| **Marketing**     | O que a Kyvon está publicando sobre si mesma?          |
| **Suporte**       | O que os clientes estão pedindo depois do lançamento?  |
| **Arquivos**      | Onde está aquele documento?                            |
| **Relatórios**    | Como a operação está se comportando ao longo do tempo? |
| **Configurações** | Como o sistema se adapta ao jeito da Kyvon trabalhar?  |

## 7. Meu trabalho — a tela mais usada

A primeira tela de quem não é gestor. Reúne, sem filtros manuais, tudo o que aponta para
a pessoa logada:

- **Hoje**: tarefas vencendo hoje, tarefas atrasadas, aprovações aguardando sua decisão,
  bloqueios sob sua responsabilidade, entregas dos próximos dias.
- **Minhas tarefas** em lista, kanban ou calendário, filtráveis por projeto, cliente,
  prioridade, status, tipo e prazo.

Ela não traz informação nova — traz a informação existente recortada por
responsabilidade. É o que separa um sistema usado diariamente de um sistema preenchido
por obrigação.

## 8. Fluxo de referência (teste ponta a ponta)

O cenário abaixo é implementado como teste de integração. Se ele quebra, a V1 está
quebrada.

| #   | Ação                               | Efeito verificado                                                                      |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Cadastrar lead                     | Lead em `new`                                                                          |
| 2   | Converter em oportunidade          | Cria cliente + contato + oportunidade; lead marcado `converted` e apontando para ambos |
| 3   | Criar proposta                     | Proposta v1 vinculada à oportunidade                                                   |
| 4   | Marcar oportunidade como ganha     | `won_at` preenchido; exige cliente                                                     |
| 5   | Converter em contrato              | Contrato em `draft` com cliente, escopo e valor herdados da proposta aceita            |
| 6   | Ativar contrato e criar projeto    | Projeto herda cliente e contrato; status `planning`                                    |
| 7   | Aplicar template                   | Etapas + tarefas + checklists + dependências criados em uma transação                  |
| 8   | Atribuir tarefas                   | Notificação para cada responsável                                                      |
| 9   | Executar                           | Progresso do projeto recalculado a partir das tarefas                                  |
| 10  | Solicitar aprovação de material    | Aprovação v1 em `pending`                                                              |
| 11  | Registrar "ajustes solicitados"    | v1 fechada, v2 aberta — v1 permanece legível                                           |
| 12  | Aprovar v2                         | Aprovação `approved`; v1 intacta                                                       |
| 13  | Registrar mudança de escopo        | Impacto em horas/prazo/valor; escopo do contrato inalterado                            |
| 14  | Concluir projeto                   | Bloqueado se houver aprovação pendente                                                 |
| 15  | Registrar lançamento               | `launched_at`; projeto entra em suporte                                                |
| 16  | Abrir chamado                      | Vinculado a cliente + projeto                                                          |
| 17  | Chamado "nova demanda" → Comercial | Nova oportunidade vinculada ao chamado e ao projeto                                    |
| 18  | Conferir auditoria                 | Cada passo acima tem registro com autor e diferença                                    |

## 9. Fora do escopo da V1

Registrado para não virar escopo por acidente:

- Portal externo para o cliente aprovar materiais
- Integrações (e-mail, WhatsApp, Slack, Google Calendar, GitHub, gateways de pagamento)
- Apontamento de horas com cronômetro e faturamento por hora
- Assinatura eletrônica de contrato
- Relatórios customizáveis pelo usuário
- Multi-idioma e multi-moeda
- Aplicativo móvel nativo (a web é responsiva)

## 10. Princípios de interface

1. **Densidade com respiro.** Muita informação por tela, organizada por hierarquia
   tipográfica — não por bordas e caixas.
2. **Drawer antes de página.** Ver uma tarefa não deve custar uma navegação. Página
   completa só quando há conteúdo que justifique.
3. **Todo estado tem tela.** Carregando, vazio, erro, sem permissão, sem resultado. Tela
   quebrada não existe.
4. **Ação sempre tem consequência visível.** Salvou, aparece feedback e a tela reflete o
   novo estado.
5. **Teclado é primeira classe.** `Ctrl+K` abre busca e comandos; `C` cria; `Esc` fecha.
6. **Tudo é navegável.** De qualquer entidade chega-se às vizinhas sem voltar ao menu.
   Breadcrumb mostra onde se está na cadeia.
