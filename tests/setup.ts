/**
 * Ambiente do processo de teste.
 *
 * Repete o que o `globalSetup` definiu porque os workers são processos
 * separados: herdam o `process.env` do pai, mas depender disso deixaria os
 * testes frágeis a mudanças na estratégia de pool do Vitest.
 *
 * Roda antes de qualquer import de módulo da aplicação — é o que garante que
 * `getEnv()` leia os valores de teste na primeira chamada.
 */
// `NODE_ENV` é readonly no @types/node; a conversão mantém a atribuição
// confinada ao preparo de teste, sem afrouxar o tipo no resto do projeto.
const env = process.env as Record<string, string>
env.NODE_ENV = 'test'
env.DATABASE_URL = ''
env.PGLITE_DATA_DIR = '.data/test-pglite'
env.AUTH_SECRET = 'segredo-de-teste-determinístico-para-hmac-0000'
env.ALLOW_DEMO_SEED = 'true'
