#!/usr/bin/env node
/**
 * ensure-vector — idempotently enables pgvector before `prisma db push`.
 *
 * CI uses the pgvector/pgvector image (extension pre-baked); managed Postgres
 * offerings (Render/RDS/…) ship pgvector as an installable extension instead.
 * Database.md §3 declares `extensions = [vector]`, so db push must land on a
 * database where `CREATE EXTENSION vector` has already run — this script does
 * exactly that (safe on repeat runs), against DATABASE_URL from the env.
 * Used by the Render blueprint pre-deploy; harmless everywhere else.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

if (typeof process.env.DATABASE_URL !== 'string' || process.env.DATABASE_URL === '') {
  console.error('✖ DATABASE_URL is not set — cannot enable pgvector.');
  process.exit(1);
}

const { createPrismaClient } = await import(resolve(root, 'packages/database/dist/index.js'));
const prisma = createPrismaClient();
try {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
  const rows = await prisma.$queryRawUnsafe("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'");
  console.log('✔ pgvector enabled:', JSON.stringify(rows));
} finally {
  await prisma.$disconnect();
}
