# AutoCreator AI — monorepo build (legacy single-image Dockerfile; production uses Dockerfile.api / Dockerfile.worker for AWS ECS)
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace definition first for caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json prisma.config.ts ./

# Copy all package.json files required by the API dependency graph so pnpm can
# resolve workspace:* dependencies during the install layer (Railway uses this
# legacy root Dockerfile for autocreator-api).
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/events/package.json ./packages/events/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/video-engine/package.json ./packages/video-engine/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

# Install without frozen lockfile and ignore scripts (ffmpeg-static needs network)
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Now copy rest of source
COPY packages ./packages
COPY apps ./apps
COPY infra ./infra
COPY scripts ./scripts

# Generate Prisma client
RUN pnpm --filter @aca/database exec prisma generate || true

# Build the complete API workspace dependency graph. Do not hide build errors:
# a green container image must contain a valid dist/main.js and video engine.
RUN pnpm --filter @aca/shared build
RUN pnpm --filter @aca/config build
RUN pnpm --filter @aca/logger build
RUN pnpm --filter @aca/events build
RUN pnpm --filter @aca/database build
RUN pnpm --filter @aca/auth build
RUN pnpm --filter @aca/video-engine build
RUN pnpm --filter @aca/api build

RUN test -f apps/api/dist/main.js && ls -lh apps/api/dist/

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
