/**
 * Prisma 7 configuration (CLI-side).
 *
 * Prisma 7 moved the datasource connection OUT of schema.prisma: the schema
 * datasource block no longer carries `url`, so `prisma db push` / `migrate`
 * must receive the connection here. Runtime connections use the driver adapter
 * (@aca/database → @prisma/adapter-pg), see packages/database/src/index.ts.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
  migrate: {
    adapter: () => new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
  },
});
