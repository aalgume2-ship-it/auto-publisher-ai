# Production Dockerfile for the API process.
# Run on AWS ECS Fargate / EC2 / App Runner.
#
# Build:
#   docker build -t autocreator-api:latest -f Dockerfile .
# Run (with env from Secrets Manager / Parameter Store):
#   docker run --rm -p 3000:3000 \
#     -e DATABASE_URL=... -e REDIS_URL=... -e AUTH_JWT_SECRET=... \
#     autocreator-api:latest
#
# The same image can be used to run the worker — override the command:
#   docker run --rm autocreator-api:latest node apps/worker/dist/main.js
#
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# pnpm via Corepack.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace metadata first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json prisma.config.ts ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/events/package.json ./packages/events/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/video-engine/package.json ./packages/video-engine/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

# Install deps (ignore-scripts skips ffmpeg-static postinstall; the
# runtime image installs ffmpeg via apt for production reliability).
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Now copy the rest of the source.
COPY packages ./packages
COPY apps ./apps
COPY infra ./infra
COPY scripts ./scripts

# Generate the Prisma client (must run before API build).
RUN pnpm --filter @aca/database exec prisma generate

# Build every package the API needs at runtime.
RUN pnpm --filter @aca/shared build
RUN pnpm --filter @aca/config build
RUN pnpm --filter @aca/logger build
RUN pnpm --filter @aca/events build
RUN pnpm --filter @aca/database build
RUN pnpm --filter @aca/auth build
RUN pnpm --filter @aca/video-engine build
RUN pnpm --filter @aca/api build
RUN pnpm --filter @aca/worker build

# ──────────────────────────── runtime ────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# System ffmpeg/ffprobe for video rendering. apt-get is reliable on
# bookworm-slim; we do not depend on npm-bundled ffmpeg-static.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# pnpm via Corepack in the runtime too — we use pnpm exec at runtime
# in some scripts.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy built artifacts.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# The default container command is the API. The worker process is
# launched with the same image by overriding CMD at task-definition
# time (see infra/aws/ecs-task-api.json + infra/aws/ecs-task-worker.json).
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
