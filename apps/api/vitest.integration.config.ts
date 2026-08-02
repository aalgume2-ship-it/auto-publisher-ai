/**
 * Integration config — REAL Postgres + Redis, boots the FULL AppModule over
 * fastify .inject() (no sockets). Gated: runs only when ACA_API_IT=1 (CI
 * integration job sets it + provides services; local runs need compose up).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { tsconfigRaw: '{"compilerOptions":{"experimentalDecorators":true,"emitDecoratorMetadata":true}}' },
  test: {
    name: '@aca/api-it',
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // one shared DB — serialize suites
    testTimeout: 30000,
    hookTimeout: 45000,
  },
});
