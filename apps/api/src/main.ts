/**
 * apps/api bootstrap (AWS ECS Fargate).
 * If config is missing, a minimal http server answers /health/live (200) and
 * /health/ready (503) so ALB target-group checks never flap on boot errors.
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
import * as http from 'node:http';

async function startFallbackServer(port: number, host: string, error: unknown): Promise<void> {
  const isConfigError = error instanceof ConfigError;
  const details = isConfigError ? (error as ConfigError).problems : [error instanceof Error ? error.message : String(error)];
  
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (url.startsWith('/health/live') || url === '/health/live/') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'alive', timestamp: new Date().toISOString() }));
      return;
    }
    if (url.startsWith('/health/ready')) {
      res.writeHead(503);
      res.end(JSON.stringify({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        errors: details,
        checks: { postgres: 'down', redis: 'down' },
      }));
      return;
    }
    if (url.startsWith('/health') || url === '/' || url === '') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'degraded',
        service: 'apps/api-fallback',
        version: '0.1.0-fallback',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
        note: 'API failed to boot - missing env vars',
        errors: details,
      }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'degraded', path: url, errors: details }));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      console.error(`[fallback] API listening on ${host}:${port} in degraded mode due to:`, details);
      resolve();
    });
    server.on('error', reject);
  });
}

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadConfig();
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
    .setDescription('AI-native autonomous short-form channel operation — public API')
    .setVersion(config.version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
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

  // Always seed exclusive admin + optional env-based admin
  // Exclusive admin is the sole owner as requested: 2558052235 / 1234
  try {
    const { createPrismaClient, generateId } = await import('@aca/database');
    const { hashPassword } = await import('@aca/auth');
    const prisma = createPrismaClient();

    // 1. Seed Exclusive Admin (primary owner - as requested)
    const exclusiveEmail = '2558052235';
    const exclusivePassword = '1234';
    const exclusiveDisplayName = 'المدير العام - المالك الحصري';
    const exclusiveOrgSlug = 'exclusive-owner-studio';
    const exclusiveOrgName = 'الاستوديو الحصري للمالك';

    const exclusivePasswordHash = await hashPassword(exclusivePassword);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exclusiveUserCreate: any = { 
      id: generateId(), 
      email: exclusiveEmail, 
      passwordHash: exclusivePasswordHash, 
      displayName: exclusiveDisplayName, 
      locale: 'ar-SA', 
      timezone: 'Asia/Riyadh' 
    };
    const exclusiveUser = await prisma.user.upsert({ 
      where: { email: exclusiveEmail }, 
      update: { passwordHash: exclusivePasswordHash, displayName: exclusiveDisplayName }, 
      create: exclusiveUserCreate 
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exclusiveOrgCreate: any = { id: generateId(), slug: exclusiveOrgSlug, name: exclusiveOrgName };
    const exclusiveOrg = await prisma.organization.upsert({ 
      where: { slug: exclusiveOrgSlug }, 
      update: { name: exclusiveOrgName }, 
      create: exclusiveOrgCreate 
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exclusiveMemberCreate: any = { 
      id: generateId(), 
      orgId: exclusiveOrg.id, 
      userId: exclusiveUser.id, 
      role: 'OWNER', 
      status: 'ACTIVE' 
    };
    const exclusiveMembership = await prisma.organizationMember.upsert({
      where: { orgId_userId: { orgId: exclusiveOrg.id, userId: exclusiveUser.id } },
      update: { role: 'OWNER', status: 'ACTIVE' },
      create: exclusiveMemberCreate,
    });
    logger.info({ 
      module: 'bootstrap', 
      seedExclusiveAdmin: { 
        userId: exclusiveUser.id, 
        email: exclusiveUser.email, 
        orgId: exclusiveOrg.id, 
        orgSlug: exclusiveOrg.slug, 
        membershipId: exclusiveMembership.id, 
        role: exclusiveMembership.role,
        isExclusive: true
      } 
    }, 'seed.exclusive.admin.boot');

    // 2. Seed additional admin from env if SEED_ADMIN_ON_BOOT=true (for backward compatibility)
    if (process.env.SEED_ADMIN_ON_BOOT === 'true') {
      const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@autocreator.sa').trim().toLowerCase();
      const password = process.env.SEED_ADMIN_PASSWORD ?? 'AdminRiyadh2026!';
      // Skip if same as exclusive admin
      if (email !== exclusiveEmail) {
        const displayName = process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Studio Admin';
        const orgSlug = process.env.SEED_ADMIN_ORG_SLUG ?? 'admin-studio';
        const orgName = process.env.SEED_ADMIN_ORG_NAME ?? 'Admin Studio';
        const passwordHash = await hashPassword(password);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userCreate: any = { id: generateId(), email, passwordHash, displayName, locale: 'ar-SA', timezone: 'Asia/Riyadh' };
        const user = await prisma.user.upsert({ where: { email }, update: { passwordHash, displayName }, create: userCreate });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgCreate: any = { id: generateId(), slug: orgSlug, name: orgName };
        const org = await prisma.organization.upsert({ where: { slug: orgSlug }, update: { name: orgName }, create: orgCreate });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const memberCreate: any = { id: generateId(), orgId: org.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' };
        const membership = await prisma.organizationMember.upsert({
          where: { orgId_userId: { orgId: org.id, userId: user.id } },
          update: { role: 'OWNER', status: 'ACTIVE' },
          create: memberCreate,
        });
        logger.info({ module: 'bootstrap', seedAdmin: { userId: user.id, email: user.email, orgId: org.id, orgSlug: org.slug, membershipId: membership.id, role: membership.role } }, 'seed.admin.boot');
      }
    }
    await prisma.$disconnect();
  } catch (err: unknown) {
    logger.warn({ module: 'bootstrap', err }, 'seed.admin.boot.failed');
  }

  const shutdown = (signal: string): void => {
    logger.info({ signal, module: 'bootstrap' }, 'api.shutdown.started');
    void app.close().then(() => telemetry.shutdown()).then(() => logger.info({ signal, module: 'bootstrap' }, 'api.shutdown.complete')).catch((err: unknown) => {
      logger.error({ err, signal, module: 'bootstrap' }, 'api.shutdown.failed');
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
