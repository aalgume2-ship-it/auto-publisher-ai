/**
 * ESLint flat config (v9) — monorepo rules from @aca/eslint-config.
 */
import aca from '@aca/eslint-config';

export default [
  ...aca,
  {
    ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo', 'test/**', 'vitest*.ts', '**/*.spec.ts'],
  },
  {
    // Legacy app code: keep core checks, relax style rules never enforced before.
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unnecessary-template-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      'eqeqeq': 'off',
      'no-console': 'off',
      'no-restricted-imports': 'off', // queue/redis infra is core to the API
    },
  },
];
