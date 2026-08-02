/**
 * Integration config — REAL Postgres + Redis, boots the FULL AppModule over
 * fastify .inject() (no sockets). Gated: runs only when ACA_API_IT=1 (CI
 * integration job sets it + provides services; local runs need compose up).
 *
 * TRANSFORM: SWC (not esbuild). Nest's runtime DI reads design:paramtypes
 * metadata; esbuild never emits decorator metadata (verified: esbuild 0.28.1,
 * experimentalDecorators + emitDecoratorMetadata set, zero __metadata calls),
 * so a Nest app cannot boot under vitest/esbuild. SWC legacyDecorator +
 * decoratorMetadata reproduces tsc emit exactly. Local proof lives in the
 * commit message of the fix that introduced this plugin.
 */
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
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
