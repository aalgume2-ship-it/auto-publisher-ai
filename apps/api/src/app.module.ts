/**
 * AppModule — the composition root (ADR-025). Infrastructure providers live in
 * the @Global CommonModule (imported below); feature modules (v1 controllers/
 * services) are added UNDER this shell and consume CommonModule by token.
 *
 * Registration ORDER IS BEHAVIOR:
 *   middleware: RequestContextMiddleware ('*') — FIRST, wraps all
 *   APP_FILTER: ProblemDetailsFilter — the single error exit door
 *   APP_INTERCEPTOR: LoggingInterceptor → IdempotencyInterceptor
 *   APP_GUARD order: Auth → Tenant → Rbac → Entitlements → Credits → RateLimit
 */
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { CommonModule } from './common/common.module.js';
import { RequestContextMiddleware } from './common/context/request-context.middleware.js';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter.js';
import { AuthGuard } from './common/auth/auth.guard.js';
import { TenantGuard } from './common/auth/tenant.guard.js';
import { RbacGuard } from './common/guards/rbac.guard.js';
import { EntitlementsGuard } from './common/guards/entitlements.guard.js';
import { CreditsGuard } from './common/guards/credits.guard.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard.js';
import { LoggingInterceptor } from './common/http/logging.interceptor.js';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor.js';
import { HealthController } from './health/health.controller.js';
import { MetricsController } from './metrics/metrics.controller.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';

@Module({
  imports: [CommonModule, OrganizationsModule],
  controllers: [HealthController, MetricsController],
  providers: [
    Reflector,
    // single error exit door
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // guard chain — EXECUTION ORDER = registration order (ADR-025)
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: EntitlementsGuard },
    { provide: APP_GUARD, useClass: CreditsGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    // interceptors
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
