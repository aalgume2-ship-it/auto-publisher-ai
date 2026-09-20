import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@aca/video-engine',
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
  esbuild: {
    target: 'es2022',
  },
});
