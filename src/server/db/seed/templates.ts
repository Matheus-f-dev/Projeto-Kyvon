import type { RoleKey } from '@/shared/permissions'

/**
 * Templates de projeto entregues de fábrica.
 *
 * Um template existe para que ninguém recrie 20 tarefas à mão a cada projeto
 * do mesmo tipo. Ele carrega etapas, tarefas, checklists, prazo relativo e o
 * perfil sugerido como responsável — o que sobra para a pessoa é ajustar, não
 * montar do zero.
 *
 * `dueOffsetDays` é relativo ao início do projeto.
 */

export interface TemplateTaskSeed {
  title: string
  description?: string
  type:
    | 'generic'
    | 'discovery'
    | 'design'
    | 'content'
    | 'development'
    | 'bug'
    | 'review'
    | 'qa'
    | 'deploy'
    | 'meeting'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  estimateHours?: number
  defaultRole?: RoleKey
  dueOffsetDays?: number
  checklist?: string[]
  /** Títulos de tarefas anteriores que precisam terminar antes desta. */
  dependsOn?: string[]
}

export interface TemplateStageSeed {
  name: string
  description?: string
  tasks: TemplateTaskSeed[]
}

export interface ProjectTemplateSeed {
  key: string
  name: string
  description: string
  serviceTypeKey: string
  stages: TemplateStageSeed[]
}

export const PROJECT_TEMPLATES: readonly ProjectTemplateSeed[] = [
  {
    key: 'website-institucional',
    name: 'Website Institucional',
    description:
      'Fluxo completo de um site institucional, da descoberta ao lançamento com SEO e analytics.',
    serviceTypeKey: 'website',
    stages: [
      {
        name: 'Descoberta',
        description: 'Entender o negócio, o público e o que o site precisa resolver.',
        tasks: [
          {
            title: 'Reunião inicial',
            description: 'Alinhar objetivos, expectativas, prazos e pontos de contato.',
            type: 'meeting',
            priority: 'high',
            estimateHours: 2,
            defaultRole: 'gestor',
            dueOffsetDays: 2,
            checklist: [
              'Agendar com o cliente',
              'Confirmar participantes',
              'Registrar ata da reunião',
            ],
          },
          {
            title: 'Briefing',
            description: 'Consolidar o briefing a partir da reunião e do material do cliente.',
            type: 'discovery',
            estimateHours: 3,
            defaultRole: 'gestor',
            dueOffsetDays: 4,
            dependsOn: ['Reunião inicial'],
            checklist: [
              'Público-alvo definido',
              'Concorrentes mapeados',
              'Referências visuais coletadas',
              'Tom de voz definido',
            ],
          },
          {
            title: 'Levantamento de requisitos',
            description: 'Listar funcionalidades, integrações e restrições técnicas.',
            type: 'discovery',
            estimateHours: 4,
            defaultRole: 'dev',
            dueOffsetDays: 6,
            dependsOn: ['Briefing'],
            checklist: [
              'Funcionalidades listadas',
              'Integrações identificadas',
              'Hospedagem e domínio verificados',
              'Requisitos de acessibilidade definidos',
            ],
          },
        ],
      },
      {
        name: 'Estratégia',
        description: 'Definir estrutura, navegação e conteúdo antes de desenhar.',
        tasks: [
          {
            title: 'Sitemap',
            description: 'Mapa de páginas e hierarquia de navegação.',
            type: 'discovery',
            estimateHours: 3,
            defaultRole: 'design',
            dueOffsetDays: 9,
            dependsOn: ['Levantamento de requisitos'],
          },
          {
            title: 'Arquitetura da informação',
            description: 'Organizar o conteúdo de cada página e os caminhos de conversão.',
            type: 'discovery',
            estimateHours: 4,
            defaultRole: 'design',
            dueOffsetDays: 11,
            dependsOn: ['Sitemap'],
          },
          {
            title: 'Conteúdo',
            description: 'Produzir ou consolidar textos e imagens de cada página.',
            type: 'content',
            estimateHours: 8,
            defaultRole: 'marketing',
            dueOffsetDays: 16,
            dependsOn: ['Arquitetura da informação'],
            checklist: [
              'Textos revisados',
              'Imagens em alta resolução',
              'Títulos e metadados de SEO',
            ],
          },
        ],
      },
      {
        name: 'Design',
        description: 'Desenhar a interface e obter aprovação antes de codar.',
        tasks: [
          {
            title: 'Wireframe',
            description: 'Estrutura de baixa fidelidade das páginas principais.',
            type: 'design',
            estimateHours: 8,
            defaultRole: 'design',
            dueOffsetDays: 20,
            dependsOn: ['Arquitetura da informação'],
          },
          {
            title: 'UI',
            description: 'Interface final em alta fidelidade, desktop e mobile.',
            type: 'design',
            priority: 'high',
            estimateHours: 24,
            defaultRole: 'design',
            dueOffsetDays: 28,
            dependsOn: ['Wireframe'],
            checklist: [
              'Todas as páginas do sitemap desenhadas',
              'Versão mobile de cada página',
              'Estados de hover, foco, erro e vazio',
              'Componentes reutilizáveis documentados',
            ],
          },
          {
            title: 'Aprovação do design',
            description: 'Enviar o design para aprovação do cliente e registrar a decisão.',
            type: 'review',
            priority: 'high',
            estimateHours: 2,
            defaultRole: 'gestor',
            dueOffsetDays: 32,
            dependsOn: ['UI'],
          },
        ],
      },
      {
        name: 'Desenvolvimento',
        description: 'Construir, integrar e testar.',
        tasks: [
          {
            title: 'Setup do projeto',
            description: 'Repositório, ambientes, CI e dependências.',
            type: 'development',
            estimateHours: 4,
            defaultRole: 'dev',
            dueOffsetDays: 34,
            checklist: [
              'Repositório criado',
              'Ambiente de staging no ar',
              'Variáveis configuradas',
            ],
          },
          {
            title: 'Frontend',
            description: 'Implementar as telas aprovadas.',
            type: 'development',
            priority: 'high',
            estimateHours: 40,
            defaultRole: 'dev',
            dueOffsetDays: 48,
            dependsOn: ['Aprovação do design', 'Setup do projeto'],
          },
          {
            title: 'Backend',
            description: 'Formulários, CMS e regras de servidor.',
            type: 'development',
            estimateHours: 24,
            defaultRole: 'dev',
            dueOffsetDays: 48,
            dependsOn: ['Setup do projeto'],
          },
          {
            title: 'Integrações',
            description: 'E-mail, analytics, CRM e demais serviços previstos no escopo.',
            type: 'development',
            estimateHours: 12,
            defaultRole: 'dev',
            dueOffsetDays: 52,
            dependsOn: ['Backend'],
          },
          {
            title: 'Responsividade',
            description: 'Ajuste fino em tablet e mobile.',
            type: 'development',
            estimateHours: 12,
            defaultRole: 'dev',
            dueOffsetDays: 54,
            dependsOn: ['Frontend'],
          },
          {
            title: 'QA',
            description: 'Teste funcional, de navegadores e de performance.',
            type: 'qa',
            priority: 'high',
            estimateHours: 12,
            defaultRole: 'dev',
            dueOffsetDays: 57,
            dependsOn: ['Responsividade', 'Integrações'],
            checklist: [
              'Chrome, Safari, Firefox e Edge',
              'iOS e Android',
              'Formulários enviando corretamente',
              'Links quebrados verificados',
              'Lighthouse acima de 90',
              'Contraste e navegação por teclado',
            ],
          },
        ],
      },
      {
        name: 'Lançamento',
        description: 'Colocar no ar com tudo medido e verificado.',
        tasks: [
          {
            title: 'Domínio e DNS',
            description: 'Apontar o domínio e emitir o certificado.',
            type: 'deploy',
            estimateHours: 2,
            defaultRole: 'dev',
            dueOffsetDays: 58,
            dependsOn: ['QA'],
          },
          {
            title: 'Deploy em produção',
            type: 'deploy',
            priority: 'high',
            estimateHours: 3,
            defaultRole: 'dev',
            dueOffsetDays: 59,
            dependsOn: ['Domínio e DNS'],
          },
          {
            title: 'Analytics',
            description: 'Instalar medição e configurar as conversões.',
            type: 'development',
            estimateHours: 3,
            defaultRole: 'dev',
            dueOffsetDays: 60,
            dependsOn: ['Deploy em produção'],
          },
          {
            title: 'SEO',
            description: 'Sitemap.xml, robots.txt, metadados e indexação.',
            type: 'content',
            estimateHours: 4,
            defaultRole: 'marketing',
            dueOffsetDays: 60,
            dependsOn: ['Deploy em produção'],
            checklist: [
              'sitemap.xml enviado ao Search Console',
              'robots.txt revisado',
              'Meta títulos e descrições de cada página',
              'Open Graph configurado',
            ],
          },
          {
            title: 'Checklist final e entrega',
            description: 'Conferência geral e passagem para suporte.',
            type: 'review',
            priority: 'high',
            estimateHours: 3,
            defaultRole: 'gestor',
            dueOffsetDays: 62,
            dependsOn: ['Analytics', 'SEO'],
            checklist: [
              'Acessos entregues ao cliente',
              'Backup configurado',
              'Período de suporte comunicado',
              'Documentação entregue',
            ],
          },
        ],
      },
    ],
  },

  {
    key: 'landing-page',
    name: 'Landing Page',
    description: 'Fluxo enxuto para uma página de conversão única.',
    serviceTypeKey: 'landing-page',
    stages: [
      {
        name: 'Descoberta',
        tasks: [
          {
            title: 'Briefing da campanha',
            description: 'Oferta, público, promessa e métrica de sucesso.',
            type: 'discovery',
            priority: 'high',
            estimateHours: 2,
            defaultRole: 'marketing',
            dueOffsetDays: 2,
          },
        ],
      },
      {
        name: 'Estratégia',
        tasks: [
          {
            title: 'Copy e estrutura',
            description: 'Texto de cada bloco e ordem de argumentação.',
            type: 'content',
            estimateHours: 6,
            defaultRole: 'marketing',
            dueOffsetDays: 5,
            dependsOn: ['Briefing da campanha'],
          },
        ],
      },
      {
        name: 'Design',
        tasks: [
          {
            title: 'UI da landing',
            type: 'design',
            priority: 'high',
            estimateHours: 10,
            defaultRole: 'design',
            dueOffsetDays: 9,
            dependsOn: ['Copy e estrutura'],
          },
          {
            title: 'Aprovação do design',
            type: 'review',
            estimateHours: 1,
            defaultRole: 'gestor',
            dueOffsetDays: 11,
            dependsOn: ['UI da landing'],
          },
        ],
      },
      {
        name: 'Desenvolvimento',
        tasks: [
          {
            title: 'Implementação',
            type: 'development',
            priority: 'high',
            estimateHours: 12,
            defaultRole: 'dev',
            dueOffsetDays: 16,
            dependsOn: ['Aprovação do design'],
          },
          {
            title: 'Formulário e integração',
            description: 'Captura de lead ligada ao destino combinado.',
            type: 'development',
            estimateHours: 4,
            defaultRole: 'dev',
            dueOffsetDays: 18,
            dependsOn: ['Implementação'],
          },
          {
            title: 'QA',
            type: 'qa',
            estimateHours: 4,
            defaultRole: 'dev',
            dueOffsetDays: 19,
            dependsOn: ['Formulário e integração'],
          },
        ],
      },
      {
        name: 'Lançamento',
        tasks: [
          {
            title: 'Publicação',
            type: 'deploy',
            priority: 'high',
            estimateHours: 2,
            defaultRole: 'dev',
            dueOffsetDays: 20,
            dependsOn: ['QA'],
          },
          {
            title: 'Pixels e conversões',
            description: 'Medição das mídias que vão apontar para a página.',
            type: 'development',
            estimateHours: 2,
            defaultRole: 'marketing',
            dueOffsetDays: 21,
            dependsOn: ['Publicação'],
          },
        ],
      },
    ],
  },

  {
    key: 'ecommerce',
    name: 'E-commerce',
    description: 'Loja virtual com catálogo, pagamento, frete e homologação.',
    serviceTypeKey: 'ecommerce',
    stages: [
      {
        name: 'Descoberta',
        tasks: [
          {
            title: 'Reunião inicial',
            type: 'meeting',
            priority: 'high',
            estimateHours: 2,
            defaultRole: 'gestor',
            dueOffsetDays: 2,
          },
          {
            title: 'Catálogo e operação',
            description: 'Produtos, variações, estoque, frete e política de troca.',
            type: 'discovery',
            estimateHours: 8,
            defaultRole: 'gestor',
            dueOffsetDays: 6,
            dependsOn: ['Reunião inicial'],
            checklist: [
              'Planilha de produtos recebida',
              'Regras de frete definidas',
              'Meios de pagamento escolhidos',
              'Política de troca e devolução',
            ],
          },
        ],
      },
      {
        name: 'Estratégia',
        tasks: [
          {
            title: 'Arquitetura da loja',
            description: 'Categorias, filtros, busca e fluxo de checkout.',
            type: 'discovery',
            estimateHours: 8,
            defaultRole: 'design',
            dueOffsetDays: 12,
            dependsOn: ['Catálogo e operação'],
          },
        ],
      },
      {
        name: 'Design',
        tasks: [
          {
            title: 'UI da loja',
            description: 'Home, categoria, produto, carrinho e checkout.',
            type: 'design',
            priority: 'high',
            estimateHours: 32,
            defaultRole: 'design',
            dueOffsetDays: 26,
            dependsOn: ['Arquitetura da loja'],
          },
          {
            title: 'Aprovação do design',
            type: 'review',
            priority: 'high',
            estimateHours: 2,
            defaultRole: 'gestor',
            dueOffsetDays: 30,
            dependsOn: ['UI da loja'],
          },
        ],
      },
      {
        name: 'Desenvolvimento',
        tasks: [
          {
            title: 'Setup da plataforma',
            type: 'development',
            estimateHours: 8,
            defaultRole: 'dev',
            dueOffsetDays: 32,
          },
          {
            title: 'Vitrine e catálogo',
            type: 'development',
            priority: 'high',
            estimateHours: 40,
            defaultRole: 'dev',
            dueOffsetDays: 48,
            dependsOn: ['Aprovação do design', 'Setup da plataforma'],
          },
          {
            title: 'Carrinho e checkout',
            type: 'development',
            priority: 'high',
            estimateHours: 32,
            defaultRole: 'dev',
            dueOffsetDays: 56,
            dependsOn: ['Vitrine e catálogo'],
          },
          {
            title: 'Pagamento e frete',
            description: 'Integração com gateway e transportadoras.',
            type: 'development',
            priority: 'high',
            estimateHours: 24,
            defaultRole: 'dev',
            dueOffsetDays: 62,
            dependsOn: ['Carrinho e checkout'],
            checklist: [
              'Pagamento aprovado em ambiente de teste',
              'Cálculo de frete conferido',
              'Cenário de estorno testado',
            ],
          },
          {
            title: 'Cadastro de produtos',
            type: 'content',
            estimateHours: 16,
            defaultRole: 'marketing',
            dueOffsetDays: 64,
            dependsOn: ['Vitrine e catálogo'],
          },
          {
            title: 'QA e homologação',
            type: 'qa',
            priority: 'urgent',
            estimateHours: 20,
            defaultRole: 'dev',
            dueOffsetDays: 68,
            dependsOn: ['Pagamento e frete', 'Cadastro de produtos'],
            checklist: [
              'Compra completa de ponta a ponta',
              'E-mails transacionais chegando',
              'Estoque baixando corretamente',
              'Nota fiscal emitida',
            ],
          },
        ],
      },
      {
        name: 'Lançamento',
        tasks: [
          {
            title: 'Deploy e domínio',
            type: 'deploy',
            priority: 'high',
            estimateHours: 4,
            defaultRole: 'dev',
            dueOffsetDays: 70,
            dependsOn: ['QA e homologação'],
          },
          {
            title: 'Analytics e e-commerce tracking',
            type: 'development',
            estimateHours: 6,
            defaultRole: 'dev',
            dueOffsetDays: 72,
            dependsOn: ['Deploy e domínio'],
          },
          {
            title: 'Treinamento da equipe do cliente',
            type: 'meeting',
            priority: 'high',
            estimateHours: 4,
            defaultRole: 'gestor',
            dueOffsetDays: 73,
            dependsOn: ['Deploy e domínio'],
          },
        ],
      },
    ],
  },
]
