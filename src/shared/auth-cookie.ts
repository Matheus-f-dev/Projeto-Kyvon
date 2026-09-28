/**
 * Nome do cookie de sessão.
 *
 * Mora sozinho num módulo sem dependências porque o middleware precisa dele.
 * Importá-lo de `server/auth/session.ts` arrastaria Drizzle e o driver do banco
 * para o bundle do middleware — que roda em runtime restrito e em toda requisição.
 */
export const SESSION_COOKIE = 'kyvon_session'
