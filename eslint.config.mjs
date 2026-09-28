import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

/**
 * ESLint (flat config).
 *
 * `eslint-config-next@16` já exporta flat config nativo — usar o `FlatCompat`
 * aqui quebra na validação de schema do formato antigo.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', '.data/**', 'next-env.d.ts'],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      // `any` desliga a checagem justamente onde ela mais importa: na fronteira
      // entre banco, formulário e interface.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `console.log` esquecido vira ruído em produção; warn e error são intencionais.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // Scripts e testes rodam em terminal: imprimir ali é o comportamento certo.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: { 'no-console': 'off' },
  },
]

export default config
