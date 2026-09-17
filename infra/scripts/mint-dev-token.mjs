#!/usr/bin/env node
/**
 * mint-dev-token — LOCAL-ONLY session token minter for trying the API.
 *
 * It is NOT a login endpoint and never ships in production: it runs on the
 * developer's machine, against the developer's local database, signed with
 * their own AUTH_JWT_SECRET. The API's trust boundary is unchanged — the
 * guard still verifies signature, exp, iss/aud, and user status on every
 * request.
 *
 * Usage:
 *   node infra/scripts/mint-dev-token.mjs --email owner@example.com
 *   eval "$(node infra/scripts/mint-dev-token.mjs --email owner@example.com --export)"
 *
 * Requires: `pnpm build` (imports compiled package dist) and env —
 * DATABASE_URL + AUTH_JWT_SECRET (min 32) from .env.local (written by
 * `pnpm dev:bootstrap`) or the real environment.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// Load .env.local (gitignored, written by dev-bootstrap). process.loadEnvFile
// throws on a missing file — tolerate: real env vars work just as well.
try {
  process.loadEnvFile(resolve(root, '.env.local'));
} catch { /* no .env.local — rely on exported env */ }

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const hit = argv.find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};

const EXPORT_MODE = flag('--export');
const EMAIL = option('--email') ?? process.env.SEED_ADMIN_EMAIL ?? '';
const TTL_SEC_RAW = option('--ttl') ?? process.env.DEV_TOKEN_TTL_SECONDS ?? '28800';
const TTL_SEC = Number.parseInt(TTL_SEC_RAW, 10);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!Number.isInteger(TTL_SEC) || TTL_SEC <= 0 || TTL_SEC > 30 * 24 * 3600) {
  fail(`invalid --ttl "${TTL_SEC_RAW}" (seconds, 1..2592000)`);
}
if (EMAIL.trim() === '') {
  fail('email is required. Pass --email=<user@example.com> or export SEED_ADMIN_EMAIL.');
}

const secret = process.env.AUTH_JWT_SECRET;
if (typeof secret !== 'string' || secret.length < 32) {
  fail('AUTH_JWT_SECRET is missing or shorter than 32 chars. Run `pnpm dev:bootstrap` (it writes .env.local) or export it.');
}
if (typeof process.env.DATABASE_URL !== 'string' || process.env.DATABASE_URL === '') {
  fail('DATABASE_URL is missing. Run `pnpm dev:bootstrap` (it writes .env.local).');
}

const distChecks = [
  ['packages/database', 'packages/database/dist/index.js'],
  ['packages/config', 'packages/config/dist/schema.js'],
  ['apps/api', 'apps/api/dist/common/auth/session-jwt.js'],
];
for (const [pkg, rel] of distChecks) {
  if (!existsSync(resolve(root, rel))) fail(`${pkg} is not built (${rel} missing). Run \`pnpm build\` first.`);
}

const { createPrismaClient } = await import(resolve(root, 'packages/database/dist/index.js'));
const { AppConfigSchema } = await import(resolve(root, 'packages/config/dist/schema.js'));
const { signSessionJwt } = await import(resolve(root, 'apps/api/dist/common/auth/session-jwt.js'));

// issuer/audience come from the SAME schema the API validates against —
// the minter can never drift from the guard's expectations.
const authDefaults = AppConfigSchema.shape.auth.parse({});
const issuer = process.env.AUTH_JWT_ISSUER ?? authDefaults.jwtIssuer;
const audience = process.env.AUTH_JWT_AUDIENCE ?? authDefaults.jwtAudience;

const prisma = createPrismaClient();
try {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, email: true, displayName: true, status: true },
  });
  if (user === null) {
    fail(`no user with email "${EMAIL}". Seed first: \`pnpm db:seed\` or create the user via /v1/auth/register.`);
  }
  if (user.status !== 'ACTIVE') {
    fail(`user "${EMAIL}" has status ${user.status} — the AuthGuard would reject the token anyway.`);
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { role: true, organization: { select: { id: true, slug: true, name: true } } },
  });

  const now = Math.floor(Date.now() / 1000);
  const token = signSessionJwt(
    { sub: user.id, typ: 'access', iss: issuer, aud: audience, iat: now, exp: now + TTL_SEC },
    secret,
  );

  if (EXPORT_MODE) {
    console.log(`export ACA_TOKEN='${token}'`);
    if (membership !== null) console.log(`export ACA_ORG_ID='${membership.organization.id}'`);
    console.log(`export ACA_USER_ID='${user.id}'`);
  } else {
    console.log('');
    console.log(`  user    ${user.email} (${user.displayName ?? '—'})`);
    console.log(`  org     ${membership === null ? '— (no active membership)' : `${membership.organization.name} [${membership.organization.slug}] — role ${membership.role}`}`);
    console.log(`  expires ${new Date((now + TTL_SEC) * 1000).toISOString()} (ttl ${TTL_SEC}s)`);
    console.log('');
    console.log('ACA_TOKEN=' + token);
    if (membership !== null) console.log('ACA_ORG_ID=' + membership.organization.id);
    console.log('ACA_USER_ID=' + user.id);
    console.log('');
    console.log('Try it:');
    console.log(`  eval "$(pnpm --silent dev:token -- --export)"`);
    console.log(`  curl -s http://localhost:3000/v1/organizations/$ACA_ORG_ID -H "Authorization: Bearer $ACA_TOKEN"`);
    console.log('  # or paste the token into Swagger UI → Authorize: http://localhost:3000/docs');
  }
} finally {
  await prisma.$disconnect();
}
