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
    // The worker IS the queue consumer — BullMQ/ioredis are core, not vendor lock-in.
    files: ['src/**'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
];
