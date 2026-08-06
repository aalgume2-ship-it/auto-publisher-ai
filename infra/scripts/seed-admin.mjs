#!/usr/bin/env node
/**
 * seed-admin — Render-shell one-shot that creates an OWNER user with a
 * scrypt-hashed password, an org, and a membership, so a human can log in
 * via the web app without having to re-register.
 *
 * Why a separate script: the only /v1 endpoint that creates users is
 * /v1/auth/register, and the very next request from a new account lands
 * inside an empty org with no membership yet (the dashboard route guard
 * then redirects to /register, which now 409s). This script skips the
 * whole chicken-and-egg loop by inserting through Prisma directly.
 *
 * Usage (Render Shell tab on autocreator-api-preview):
 *   node infra/scripts/seed-admin.mjs --email admin@autocreator.sa \
 *       --password 'AdminRiyadh2026!' --displayName 'Studio Admin'
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// Load .env (Render provides DATABASE_URL via the env, but tolerate a local one).
try {
  process.loadEnvFile(resolve(root, '.env'));
} catch { /* env provided externally */ }

const argv = process.argv.slice(2);
const option = (name) => {
  const hit = argv.find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};

const EMAIL = (option('--email') ?? process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
const PASSWORD = option('--password') ?? process.env.SEED_ADMIN_PASSWORD ?? '';
const DISPLAY_NAME = option('--displayName') ?? process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Studio Admin';
const ORG_SLUG = option('--orgSlug') ?? 'admin-studio';
const ORG_NAME = option('--orgName') ?? 'Admin Studio';

if (!EMAIL || !PASSWORD) {
  console.error('ERROR: --email and --password are required');
  console.error('  node infra/scripts/seed-admin.mjs --email admin@autocreator.sa --password "AdminRiyadh2026!"');
  process.exit(2);
}
if (PASSWORD.length < 12) {
  console.error('ERROR: password must be at least 12 characters (matches the API zod min(12) policy)');
  process.exit(2);
}

const scrypt = promisify(scryptCb);
const CURRENT = { N: 16_384, r: 8, p: 1 };
const SALT_BYTES = 16;
const KEY_LENGTH = 32;
const maxmem = 128 * CURRENT.N * CURRENT.r * CURRENT.p + 1024 * 1024;

async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, { ...CURRENT, maxmem });
  return `scrypt$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function main() {
  // Import compiled @aca/database (Render has run `pnpm build` during image build).
  const { createPrismaClient, generateId } = await import('@aca/database');
  const prisma = createPrismaClient();
  const passwordHash = await hashPassword(PASSWORD);

  // 1. Upsert user (id is mandatory: User.id is @db.Uuid with no default)
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, displayName: DISPLAY_NAME },
    create: {
      id: generateId(),
      email: EMAIL,
      passwordHash,
      displayName: DISPLAY_NAME,
      locale: 'ar-SA',
      timezone: 'Asia/Riyadh',
    },
  });
  console.log(`user: ${user.id}  email=${user.email}  displayName=${user.displayName}`);

  // 2. Upsert org (idempotent on slug)
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME, ownerId: user.id },
    create: { id: generateId(), slug: ORG_SLUG, name: ORG_NAME, ownerId: user.id },
  });
  console.log(`org:  ${org.id}  slug=${org.slug}  name=${org.name}`);

  // 3. Ensure OWNER membership
  const membership = await prisma.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: { role: 'OWNER', status: 'ACTIVE' },
    create: { id: generateId(), userId: user.id, orgId: org.id, role: 'OWNER', status: 'ACTIVE' },
  });
  console.log(`membership: ${membership.id}  role=${membership.role}  status=${membership.status}`);

  await prisma.$disconnect();
  console.log('\nDone. You can now log in with:');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
}

main().catch((err) => {
  console.error('seed-admin failed:', err);
  process.exit(1);
});
