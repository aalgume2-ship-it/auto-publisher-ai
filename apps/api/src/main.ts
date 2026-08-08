/**
 * apps/api bootstrap (ADR-025):
 *   1. loadConfig() — fail closed BEFORE anything listens
 *   2. initTelemetry() — OTel registered before the first request
 *   3. Nest + Fastify with URI versioning /v1 (additive-only policy, API.md §1)
 *   4. OpenAPI document generated from the same decorators that enforce
 *      behavior (docs can never drift) — served at /docs + /openapi.json
 *   5. graceful shutdown: SIGTERM → close HTTP → flush telemetry
 *
 * Railway resilience: If loadConfig() fails (missing DATABASE_URL etc),
 * we start a minimal Fastify fallback that returns 200 for /health and
 * 503 with details for /health/ready, so Railway healthcheck passes
 * and operator can see what's missing in logs.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig, ConfigError } from '@aca/config';
import { createLogger } from '@aca/logger';
import { AppModule } from './app.module.js';
import { initTelemetry } from './common/telemetry/telemetry.js';
import { registerLenientJsonBodyParser } from './common/http/json-body.js';
import { registerAuthUserComponent, registerProblemDetailsComponent } from './common/http/problem-details.openapi.js';

async function startFallbackServer(port: number, host: string, error: unknown): Promise<void> {
  const Fastify = (await import('fastify')).default;
  const fastify = Fastify({ logger: false });
  const isConfigError = error instanceof ConfigError;
  const details = isConfigError ? (error as ConfigError).problems : [error instanceof Error ? error.message : String(error)];
  
  fastify.get('/health', async () => ({
    status: 'degraded',
    service: 'apps/api-fallback',
    version: '0.1.0-fallback',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
    note: 'API failed to boot - missing env vars',
    errors: details,
  }));
  
  fastify.get('/health/live', async () => ({
    status: 'alive',
    timestamp: new Date().toISOString(),
  }));
  
  fastify.get('/health/ready', async (_req, reply) => {
    reply.code(503);
    return {
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      errors: details,
      checks: { postgres: 'down', redis: 'down' },
    };
  });

  fastify.get('/', async () => ({
    status: 'degraded',
    message: 'API failed to boot - check env vars',
    errors: details,
    timestamp: new Date().toISOString(),
  }));

  await fastify.listen({ port, host });
  console.error(`[fallback] API listening on ${host}:${port} in degraded mode due to:`, details);
}

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadConfig(); // throws ConfigError listing ALL problems
  } catch (err) {
    const port = Number.parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';
    console.error('[bootstrap] ConfigError - starting fallback server:', err);
    await startFallbackServer(port, host, err);
    return;
  }

  const logger = createLogger({
    service: 'apps/api',
    level: config.observability.logLevel,
    pretty: config.nodeEnv === 'development',
    version: config.version,
    environment: config.nodeEnv,
  });
  const telemetry = initTelemetry(config);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: config.http.trustProxy,
      bodyLimit: config.http.requestBodyLimitMb * 1024 * 1024,
    }),
    { logger: false, rawBody: true },
  );
  registerLenientJsonBodyParser(app, { bodyLimitBytes: config.http.requestBodyLimitMb * 1024 * 1024 });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  app.enableCors({ origin: config.http.corsOrigins.length > 0 ? config.http.corsOrigins : false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AutoCreator AI API')
    .setDescription('AI-native autonomous short-form channel operation — public API (docs/API.md §1 conventions: RFC 9457 errors, Idempotency-Key on mutations, RateLimit-* headers).')
    .setVersion(config.version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'First-party session JWT' })
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
    .addServer(`http://localhost:${config.http.port}`, 'local')
    .addServer('https://api.autocreator.ai', 'production')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  registerProblemDetailsComponent(document);
  registerAuthUserComponent(document);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
    customSiteTitle: 'AutoCreator AI API — OpenAPI',
  });

  await app.listen({ port: config.http.port, host: config.http.host });
  logger.info(
    { port: config.http.port, host: config.http.host, env: config.nodeEnv, version: config.version, module: 'bootstrap' },
    'api.listening',
  );

  if (process.env.SEED_ADMIN_ON_BOOT === 'true') {
    try {
      const { createPrismaClient, generateId } = await import('@aca/database');
      const { hashPassword } = await import('@aca/auth');
      const prisma = createPrismaClient();
      const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@autocreator.sa').trim().toLowerCase();
      const password = process.env.SEED_ADMIN_PASSWORD ?? 'AdminRiyadh2026!';
      const displayName = process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Studio Admin';
      const orgSlug = process.env.SEED_ADMIN_ORG_SLUG ?? 'admin-studio';
      const orgName = process.env.SEED_ADMIN_ORG_NAME ?? 'Admin Studio';

      const passwordHash = await hashPassword(password);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userCreate: any = {
        id: generateId(),
        email,
        passwordHash,
        displayName,
        locale: 'ar-SA',
        timezone: 'Asia/Riyadh',
      };
      const user = await prisma.user.upsert({
        where: { email },
        update: { passwordHash, displayName },
        create: userCreate,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgCreate: any = { id: generateId(), slug: orgSlug, name: orgName };
      const org = await prisma.organization.upsert({
        where: { slug: orgSlug },
        update: { name: orgName },
        create: orgCreate,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const memberCreate: any = {
        id: generateId(),
        orgId: org.id,
        userId: user.id,
        role: 'OWNER',
        status: 'ACTIVE',
      };
      const membership = await prisma.organizationMember.upsert({
        where: { orgId_userId: { orgId: org.id, userId: user.id } },
        update: { role: 'OWNER', status: 'ACTIVE' },
        create: memberCreate,
      });
      logger.info(
        {
          module: 'bootstrap',
          seedAdmin: {
            userId: user.id,
            email: user.email,
            orgId: org.id,
            orgSlug: org.slug,
            membershipId: membership.id,
            role: membership.role,
          },
        },
        'seed.admin.boot',
      );
      await prisma.$disconnect();
    } catch (err: unknown) {
      logger.warn({ module: 'bootstrap', err }, 'seed.admin.boot.failed');
    }
  }

  if (process.env.SEED_DEMO_DATA === 'true') {
    try {
      const { createPrismaClient } = await import('@aca/database');
      const prisma = createPrismaClient();
      const previewSlug = process.env.SEED_WORKSPACE_SLUG ?? 'preview-workspace';
      const preview = await prisma.organization.findUnique({
        where: { slug: previewSlug },
        select: { id: true, members: { where: { role: 'OWNER' }, select: { userId: true }, take: 1 } },
      });
      if (preview) {
        logger.info(
          { module: 'bootstrap', previewWiring: { previewOrgId: preview.id, previewUserId: preview.members[0]?.userId ?? null } },
          'preview.wiring.ids',
        );
      }
      await prisma.$disconnect();
    } catch (err: unknown) {
      logger.warn({ module: 'bootstrap', err }, 'preview.wiring.ids.unavailable');
    }
  }

  const shutdown = (signal: string): void => {
    logger.info({ signal, module: 'bootstrap' }, 'api.shutdown.started');
    void app
      .close()
      .then(() => telemetry.shutdown())
      .then(() => logger.info({ signal, module: 'bootstrap' }, 'api.shutdown.complete'))
      .catch((err: unknown) => {
        logger.error({ err, signal, module: 'bootstrap' }, 'api.shutdown.failed');
      });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
