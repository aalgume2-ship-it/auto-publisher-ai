import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    exclude: ['test/integration/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
