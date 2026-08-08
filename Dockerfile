# Railway Dockerfile for autocreator-api (NestJS)
# Always-on, no sleep when keep-alive pings every 5 min

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy entire repo (need all workspaces for pnpm)
COPY . .

# Install deps ignoring scripts that fail on TLS (ffmpeg-static)
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Generate Prisma client
RUN pnpm --filter @aca/database exec prisma generate || \
    pnpm db:generate || \
    npx prisma generate --schema packages/database/prisma/schema.prisma || true

# Build shared and api
RUN pnpm --filter @aca/shared build || true
RUN pnpm --filter @aca/api build || pnpm exec tsc -b apps/api/tsconfig.json || true

# Verify
RUN ls -la apps/api/dist/ || echo "dist not found" && ls -la packages/shared/dist/ || true

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
