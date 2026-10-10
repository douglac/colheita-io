// Lint (npm run lint): erros de verdade (hooks do React, variáveis/imports sobrando, código inalcançável).
// Estilo fica com quem escreve: nada de regra de formatação aqui.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// O código tem "eslint-disable @next/next/no-img-element" (regra do eslint-config-next, que não usamos):
// regra vazia só para o comentário continuar válido.
const nextStub = { rules: { 'no-img-element': { create: () => ({}) } } }

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', 'scripts/art/**', 'scripts/qa/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks, '@next/next': nextStub },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
)
