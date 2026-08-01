#!/usr/bin/env bash
# dev-bootstrap — one-shot local environment setup for AutoCreator AI.
# Brings up the compose data plane, waits for health, runs migrations + seed,
# and generates the Prisma client. Idempotent: safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "▸ Starting local data plane (docker compose)…"
docker compose up -d postgres redis minio minio-init mailpit clamav jaeger bullboard

echo "▸ Waiting for Postgres…"
until docker compose exec -T postgres pg_isready -U aca >/dev/null 2>&1; do sleep 1; done
echo "▸ Waiting for Redis…"
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do sleep 1; done

export DATABASE_URL="${DATABASE_URL:-postgresql://aca:aca_dev_pw@localhost:5432/autocreator}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:9000}"
export S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-aca}"
export S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-aca_dev_secret}"
export S3_BUCKET_ASSETS="${S3_BUCKET_ASSETS:-aca-assets}"
export S3_BUCKET_RENDERS="${S3_BUCKET_RENDERS:-aca-renders}"
export S3_BUCKET_LOGS="${S3_BUCKET_LOGS:-aca-logs}"
export JWT_PRIVATE_KEY="${JWT_PRIVATE_KEY:-$(cat infra/secrets/dev-jwt-private.pem 2>/dev/null || echo MISSING)}"
export JWT_PUBLIC_KEY="${JWT_PUBLIC_KEY:-$(cat infra/secrets/dev-jwt-public.pem 2>/dev/null || echo MISSING)}"
export KMS_KEY_ID="${KMS_KEY_ID:-dev-key-1}"

echo "▸ Generating Prisma client…"
pnpm --filter @aca/database exec prisma generate

echo "▸ Applying migrations…"
pnpm --filter @aca/database exec prisma migrate deploy

echo "▸ Seeding platform data (plans, system workflow, personas, voices, first-party plugin registry, feature flags)…"
pnpm --filter @aca/database seed

echo "✔ Bootstrap complete. Run: pnpm dev"
