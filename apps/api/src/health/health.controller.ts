/**
 * Health surface (requirement 8; ADR-025):
 *   GET /health       — liveness surface with build/runtime facts (public)
 *   GET /health/live  — ultra-cheap alive probe for kubelet liveness (public)
 *   GET /health/ready — readiness: postgres SELECT 1 + redis PING, each with an
 *                       800 ms timeout; any dependency down → 503 PLATFORM_ERROR
 *                       (the orchestrator stops routing traffic to this pod).
 *
 * Probes are REAL queries (not connection-pool heuristics): a ready pod must
 * be able to serve its dependencies NOW.
 */
import { Controller, Get, HttpCode, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Redis } from 'ioredis';
import type { AppConfig } from '@aca/config';
import type { DbClient } from '@aca/database';
import { ApiError } from '../common/errors/api-error.js';
import { Public } from '../common/auth/auth.guard.js';
import { PRISMA } from '../common/prisma.provider.js';
import { API_CONFIG, REDIS } from '../common/redis.provider.js';

const BOOT_TIME = Date.now();

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} probe timed out after ${ms}ms`)), ms)),
  ]);
}

export interface ReadinessChecks {
  postgres: 'up' | 'down';
  redis: 'up' | 'down';
}

// VERSION_NEUTRAL: ops probes (/health, /health/live, /health/ready) must not
// move when the public API versions — load balancers and URIs pin the plain
// path (caught live: URI versioning + defaultVersion '1' silently moved these
// to /v1/health and plain /health answered 404).
@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(API_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  @HttpCode(200)
  @ApiOperation({ operationId: 'healthStatus', summary: 'Service status: version, uptime, environment' })
  @ApiResponse({ status: 200, description: 'Service is running', schema: { example: { status: 'ok', service: 'apps/api', version: '0.1.0', environment: 'production', uptimeSec: 3612, timestamp: '2026-08-02T12:00:00.000Z' } } })
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      service: this.config.serviceName,
      version: this.config.version,
      environment: this.config.nodeEnv,
      uptimeSec: Math.floor((Date.now() - BOOT_TIME) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('live')
  @HttpCode(200)
  @ApiOperation({ operationId: 'healthLive', summary: 'Liveness probe (no dependency checks)' })
  @ApiResponse({ status: 200, description: 'Process is alive', schema: { example: { status: 'alive' } } })
  live(): Record<string, string> {
    return { status: 'alive' };
  }

  @Public()
  @Get('ready')
  @HttpCode(200)
  @ApiOperation({ operationId: 'healthReady', summary: 'Readiness probe: postgres SELECT 1 + redis PING (800ms budget each)' })
  @ApiResponse({ status: 200, description: 'All dependencies reachable', schema: { example: { status: 'ready', checks: { postgres: 'up', redis: 'up' } } } })
  @ApiResponse({ status: 503, description: 'A dependency is DOWN (problem+json)' })
  async ready(): Promise<Record<string, unknown>> {
    const checks: ReadinessChecks = { postgres: 'down', redis: 'down' };
    const failures: string[] = [];

    await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 800, 'postgres')
        .then(() => (checks.postgres = 'up'))
        .catch((err: unknown) => failures.push(`postgres: ${err instanceof Error ? err.message : 'unknown'}`)),
      withTimeout(this.redis.ping(), 800, 'redis')
        .then((pong) => {
          checks.redis = pong === 'PONG' ? 'up' : 'down';
          if (pong !== 'PONG') failures.push(`redis: unexpected PING reply ${pong}`);
        })
        .catch((err: unknown) => failures.push(`redis: ${err instanceof Error ? err.message : 'unknown'}`)),
    ]);

    if (failures.length > 0) {
      throw new ApiError('PLATFORM_ERROR', 'Service Unavailable', {
        status: 503,
        detail: 'readiness probes failed',
        meta: { checks, failures },
      });
    }
    return { status: 'ready', checks };
  }

  @Public()
  @Get('providers')
  @HttpCode(200)
  @ApiOperation({ operationId: 'healthProviders', summary: 'Provider configuration status (env-level, NO secrets) — configured / not_configured' })
  @ApiResponse({
    status: 200,
    description: 'Per-provider configured flag',
    schema: { example: { openai: { configured: true }, runway: { configured: false } } },
  })
  providers(): Record<string, { configured: boolean; requiredEnv: string }> {
    const ai = this.config.ai;
    const has = (v: string | undefined): boolean => typeof v === 'string' && v.length > 0;
    return {
      openai: { configured: has(ai.openaiApiKey), requiredEnv: 'OPENAI_API_KEY' },
      groq: { configured: has(ai.groqApiKey), requiredEnv: 'GROQ_API_KEY' },
      gemini: { configured: has(ai.geminiApiKey), requiredEnv: 'GEMINI_API_KEY' },
      openrouter: { configured: has(ai.openrouterApiKey), requiredEnv: 'OPENROUTER_API_KEY' },
      pollinations: { configured: has(ai.pollinationsApiKey), requiredEnv: 'POLLINATIONS_API_KEY' },
      runway: { configured: has(ai.runwayApiKey), requiredEnv: 'RUNWAY_API_KEY' },
      luma: { configured: has(ai.lumaApiKey), requiredEnv: 'LUMA_API_KEY' },
      'fal-kling': { configured: has(ai.falKey), requiredEnv: 'FAL_KEY' },
      stability: { configured: has(ai.stabilityApiKey), requiredEnv: 'STABILITY_API_KEY' },
      replicate: { configured: has(ai.replicateApiToken), requiredEnv: 'REPLICATE_API_TOKEN' },
      elevenlabs: { configured: has(ai.elevenlabsApiKey), requiredEnv: 'ELEVENLABS_API_KEY' },
      youtube: { configured: has(this.config.platforms.googleClientId) && has(this.config.platforms.googleClientSecret), requiredEnv: 'GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET' },
      tiktok: { configured: has(this.config.platforms.tiktokClientKey) && has(this.config.platforms.tiktokClientSecret), requiredEnv: 'TIKTOK_CLIENT_KEY,TIKTOK_CLIENT_SECRET' },
      instagram: { configured: has(this.config.platforms.metaAppId) && has(this.config.platforms.metaAppSecret), requiredEnv: 'META_APP_ID,META_APP_SECRET' },
      stripe: { configured: has(this.config.billing.stripeSecretKey), requiredEnv: 'STRIPE_SECRET_KEY' },
    };
  }
}
