/**
 * ESLint flat config (v9) for @aca/web.
 *
 * Web components predate the strict monorepo rules; keep the essential
 * checks (unused vars, explicit any, boundaries) but relax React-handler
 * style rules that produce noise on legacy components.
 */
import aca from '@aca/eslint-config';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...aca,
  {
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unnecessary-template-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    // React 19 legacy handlers use deprecated FormEvent type name.
    files: ['src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
];
