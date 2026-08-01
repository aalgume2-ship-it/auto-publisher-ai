/**
 * @aca/eslint-config — flat config for the monorepo.
 *
 * Enforces the architecture rules from docs/Folder-Structure.md §2:
 *  - `shared` stays dependency-free of workspace packages;
 *  - vendor SDKs are only importable from **／adapters/** and **／providers/** folders
 *    (the zero-lock-in guardrail — violations fail CI);
 *  - no deep imports across module folders inside an app (public index only rule
 *    is completed by api/worker-level overrides in their own eslint configs).
 */
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import boundaries from 'eslint-plugin-boundaries';

const VENDOR_SDK_PATTERNS = [
  'openai', '@anthropic-ai/*', '@google-cloud/*', '@google/generative-ai',
  'deepseek*', 'elevenlabs*', '@aws-sdk/*', 'stripe', 'resend', 'pexels*',
  'replicate', 'fluent-ffmpeg', 'bullmq', 'ioredis', 'kafkajs', '@temporalio/*',
];

export const base = [
  {
    ignores: ['**/dist/**', '**/.turbo/**', '**/node_modules/**', '**/coverage/**', '**/.next/**'],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { projectService: true, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      ...tsPlugin.configs['strict-type-checked'].rules,
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
    },
  },
  {
    // Zero vendor lock-in: vendor SDKs confined to adapter/provider folders.
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/adapters/**', '**/providers/**', '**/vendor/**', '**/*.spec.ts', '**/test/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: VENDOR_SDK_PATTERNS.map((p) => ({ group: [p] })) }],
    },
  },
  {
    files: ['packages/shared/**/*.{ts,tsx}'],
    rules: {
      // @aca/shared must never import other workspace packages (publishable contract package).
      'no-restricted-imports': ['error', { patterns: [{ group: ['@aca/*'] }] }],
    },
  },
];

export const boundariesPreset = {
  plugins: { boundaries },
  settings: {
    'boundaries/include': ['apps/**/*', 'packages/**/*'],
    'boundaries/elements': [
      { type: 'apps', pattern: 'apps/*' },
      { type: 'packages', pattern: 'packages/*' },
    ],
  },
  rules: {
    'boundaries/no-unknown-files': 'off',
  },
};

export default [...base, boundariesPreset];
