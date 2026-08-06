#!/usr/bin/env bash
# apply-migration.sh — Applies Prisma migrations / schema push and generates client for AutoCreator AI.
set -euo pipefail

export PATH="$PATH:/usr/local/lib/node_modules/corepack/shims"

echo "▸ [apply-migration.sh] Starting database migration & client generation..."

# Load .env or .env.local if present
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
elif [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Set defaults if environment variables are not already exported
export DATABASE_URL="${DATABASE_URL:-postgresql://aca:aca_dev_pw@localhost:5432/autocreator}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export AUTH_JWT_SECRET="${AUTH_JWT_SECRET:-dev-only-insecure-local-secret-change-me-0123456789abcdef}"

echo "▸ [apply-migration.sh] Generating Prisma client..."
pnpm --filter @aca/database exec prisma generate

echo "▸ [apply-migration.sh] Applying database schema / migration..."
if [ -d "packages/database/prisma/migrations" ] && [ "$(ls -A packages/database/prisma/migrations 2>/dev/null)" ]; then
  pnpm --filter @aca/database exec prisma migrate deploy
else
  pnpm --filter @aca/database exec prisma db push --skip-generate
fi

echo "▸ [apply-migration.sh] Seeding database..."
pnpm --filter @aca/database seed || true

echo "✔ [apply-migration.sh] Completed successfully!"
