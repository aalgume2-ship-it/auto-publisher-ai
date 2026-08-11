/**
 * ESLint flat config (v9) — monorepo rules from @aca/eslint-config.
 */
import aca from '@aca/eslint-config';

export default [
  ...aca,
  {
    ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo', 'test/**', 'vitest*.ts', '**/*.spec.ts'],
  },
];
