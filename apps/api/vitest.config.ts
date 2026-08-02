import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@aca/api',
    include: ['test/**/*.spec.ts'],
    environment: 'node',
  },
  esbuild: {
    target: 'es2022',
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        useDefineForClassFields: false,
      },
    },
  },
});
