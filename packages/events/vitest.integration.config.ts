import { defineConfig } from 'vitest/config';

/**
 * REAL infrastructure only — no fakes. Requires the local data plane
 * (repo-root ./docker-compose.yml: postgres + redis) and migrated schema:
 *   docker compose up -d postgres redis
 *   pnpm --filter @aca/database run db:push:test   (or migrate dev)
 *   ACA_EVENTS_IT=1 pnpm --filter @aca/events run test:integration
 * CI runs this suite with compose services (see docs/Testing-Strategy.md).
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: {
      ACA_REDIS_URL: process.env.ACA_REDIS_URL ?? 'redis://localhost:6379/3',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://aca:aca@localhost:5432/aca',
    },
  },
});
