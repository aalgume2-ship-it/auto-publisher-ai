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
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
    customSiteTitle: 'AutoCreator AI API — OpenAPI',
  });

  await app.listen({ port: config.http.port, host: config.http.host });
  logger.info(
    { port: config.http.port, host: config.http.host, env: config.nodeEnv, version: config.version, module: 'bootstrap' },
    'api.listening',
  );

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
