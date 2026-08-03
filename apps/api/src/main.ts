/**
 * apps/api bootstrap (ADR-025):
 *   1. loadConfig() — fail closed BEFORE anything listens
 *   2. initTelemetry() — OTel registered before the first request
 *   3. Nest + Fastify with URI versioning /v1 (additive-only policy, API.md §1)
 *   4. OpenAPI document generated from the same decorators that enforce
 *      behavior (docs can never drift) — served at /docs + /openapi.json
 *   5. graceful shutdown: SIGTERM → close HTTP → flush telemetry
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@aca/config';
import { createLogger } from '@aca/logger';
import { AppModule } from './app.module.js';
import { initTelemetry } from './common/telemetry/telemetry.js';
import { registerLenientJsonBodyParser } from './common/http/json-body.js';
import { registerAuthUserComponent, registerProblemDetailsComponent } from './common/http/problem-details.openapi.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig(); // throws ConfigError listing ALL problems
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
    { logger: false, rawBody: true }, // our own logger everywhere; rawBody for webhook signature checks
  );
  // empty-body + json content-type → 200-class handling (public-API interop);
  // malformed payloads stay strict 400 (see common/http/json-body.ts)
  registerLenientJsonBodyParser(app, { bodyLimitBytes: config.http.requestBodyLimitMb * 1024 * 1024 });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  app.enableCors({ origin: config.http.corsOrigins.length > 0 ? config.http.corsOrigins : false });

  // OpenAPI — generated from code, enforced by contract tests (snapshot next turns)
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
  // Shared components — controllers reference them via shared consts; without
  // registration Swagger UI shows "Could not resolve pointer" errors.
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

  // Dev-only preview wiring aid: surface demo ids in RUNTIME logs (preDeploy
  // seed logs are not reachable via the Render logs API), letting operators
  // mint demo-session JWTs for hosted previews without direct DB access.
  // Never runs in production; failure is non-fatal for boot.
  if (config.nodeEnv !== 'production') {
    try {
      const { createPrismaClient } = await import('@aca/database');
      const prisma = createPrismaClient();
      const demo = await prisma.organization.findUnique({
        where: { slug: 'demo-org' },
        select: { id: true, members: { where: { role: 'OWNER' }, select: { userId: true }, take: 1 } },
      });
      if (demo) {
        logger.info(
          { module: 'bootstrap', demoWiring: { demoOrgId: demo.id, demoUserId: demo.members[0]?.userId ?? null } },
          'demo.wiring.ids',
        );
      }
      await prisma.$disconnect();
    } catch (err: unknown) {
      logger.warn({ module: 'bootstrap', err }, 'demo.wiring.ids.unavailable');
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
