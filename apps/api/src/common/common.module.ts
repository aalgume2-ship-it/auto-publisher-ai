/**
 * CommonModule — @Global platform providers shared by every feature module
 * (ADR-025 composition). Being global, it is imported ONCE by AppModule;
 * feature modules do NOT re-provide these (singleton discipline: HttpMetrics
 * must hold THE registry that /metrics renders and middleware observes).
 */
import { Global, Module } from '@nestjs/common';
import { loadConfig } from '@aca/config';
import { PrismaService, prismaProvider, PRISMA, TENANT_CLIENT, tenantClientProvider } from './prisma.provider.js';
import { API_CONFIG, REDIS, RedisService, redisProvider } from './redis.provider.js';
import { HttpMetrics } from './telemetry/http-metrics.js';
import { DomainOperations } from './telemetry/domain-operations.js';
import { AuditService } from './audit/audit.service.js';
import { OUTBOX_WRITER, outboxWriterProvider } from './events/outbox.provider.js';

const PROVIDERS = [
  { provide: API_CONFIG, useFactory: () => loadConfig() },
  PrismaService,
  prismaProvider,
  tenantClientProvider,
  RedisService,
  redisProvider,
  HttpMetrics,
  DomainOperations,
  AuditService,
  outboxWriterProvider,
];

@Global()
@Module({
  providers: PROVIDERS,
  exports: [
    API_CONFIG,
    PRISMA,
    TENANT_CLIENT,
    RedisService,
    REDIS,
    HttpMetrics,
    DomainOperations,
    AuditService,
    OUTBOX_WRITER,
  ],
})
export class CommonModule {}
