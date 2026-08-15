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
    // AssetStore is the storage ADAPTER (AWS SDK lives here by design).
    files: ['src/media/asset-store.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Legacy pipeline files (kept as-is from apps/api, lint-light).
    files: ['src/render/**', 'src/ffmpeg/**', 'src/dubbing/**', 'src/generation/**', 'src/image/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-template-expression': 'off',
    },
  },
];
