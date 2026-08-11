/**
 * ESLint flat config (v9) for @aca/config.
 */
import aca from '@aca/eslint-config';

export default [
  ...aca,
  {
    ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo', 'test/**'],
  },
];
