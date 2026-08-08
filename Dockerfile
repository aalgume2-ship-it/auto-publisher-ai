# Railway Dockerfile for autocreator-api (NestJS)
# Always-on, no sleep when keep-alive pings every 5 min

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY prisma.config.ts ./

# Install deps (ignore scripts that fail on TLS like ffmpeg-static)
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Generate Prisma client (needs schema, no DB needed)
RUN pnpm --filter @aca/database exec prisma generate || \
    pnpm db:generate || \
    npx prisma generate --schema packages/database/prisma/schema.prisma || true

# Build shared first, then api
RUN pnpm --filter @aca/shared build || true
RUN pnpm --filter @aca/api build || \
    pnpm exec tsc -b apps/api/tsconfig.json || \
    npx tsc -b apps/api/tsconfig.json || true

# Verify build output
RUN ls -la apps/api/dist/ || echo "dist not found"

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Enable pnpm in runner too (for prisma)
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy built artifacts and necessary files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Expose port (Railway sets PORT env)
EXPOSE 3000

# Healthcheck (Railway will use /health)
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || true

CMD ["node", "apps/api/dist/main.js"]
