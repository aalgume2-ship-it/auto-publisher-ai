/**
 * Environment schema — the single place where process.env is read.
 * Rule (Architecture §16 / Doppler): services NEVER touch process.env
 * directly; they receive a typed AppConfig. Secrets appear here by NAME only
 * (values come from the secret manager at runtime); the redactor erases them
 * from any log surface.
 */
import { z } from 'zod';

const intFromEnv = (def?: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number.parseInt(s, 10))
    .optional()
    .pipe(z.number().int().optional())
    .transform((n) => n ?? def);

const boolFromEnv = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((s) => (s === undefined ? def : s === 'true' || s === '1'));

export const AppConfigSchema = z.object({
  nodeEnv: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  serviceName: z.string().min(1).default('aca-service'),
  version: z.string().default('0.0.0-dev'),

  http: z.object({
    port: intFromEnv(3000).pipe(z.number().int().min(1).max(65535)),
    host: z.string().default('0.0.0.0'),
    corsOrigins: z
      .string()
      .optional()
      .transform((s) => (s === undefined || s === '' ? [] : s.split(',').map((o) => o.trim()))),
    trustProxy: boolFromEnv(true),
    requestBodyLimitMb: intFromEnv(2).pipe(z.number().int().min(1).max(100)),
  })
    .default({}),

  database: z.object({
    url: z.string().startsWith('postgresql://'),
    shadowUrl: z.string().startsWith('postgresql://').optional(),
    poolMax: intFromEnv(10).pipe(z.number().int().min(1).max(200)),
  }),

  redis: z.object({
    url: z.string().startsWith('redis://'),
    prefix: z.string().default('aca'),
  }),

  events: z.object({
    redisUrl: z.string().startsWith('redis://').optional(),
    shardCount: intFromEnv(64).pipe(z.number().int().min(1).max(256)),
    streamMaxLen: intFromEnv(1_000_000).pipe(z.number().int().min(1_000)),
  })
    .default({}),

  observability: z.object({
    otlpEndpoint: z.string().url().optional(),
    otlpHeaders: z.string().optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    serviceNamespace: z.string().default('autocreator'),
  })
    .default({}),

  secrets: z.object({
    /** Doppler project/config identifiers (values live in Doppler, never here). */
    dopplerProject: z.string().optional(),
    dopplerConfig: z.string().optional(),
    /** KMS key id for the envelope vault (ARN or alias). */
    kmsKeyId: z.string().optional(),
  })
    .default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/** process.env key mapping — explicit and complete (no wildcard passthrough). */
export const ENV_MAP = {
  NODE_ENV: 'nodeEnv',
  SERVICE_NAME: 'serviceName',
  APP_VERSION: 'version',
  PORT: 'http.port',
  HOST: 'http.host',
  CORS_ORIGINS: 'http.corsOrigins',
  TRUST_PROXY: 'http.trustProxy',
  REQUEST_BODY_LIMIT_MB: 'http.requestBodyLimitMb',
  DATABASE_URL: 'database.url',
  SHADOW_DATABASE_URL: 'database.shadowUrl',
  DATABASE_POOL_MAX: 'database.poolMax',
  REDIS_URL: 'redis.url',
  REDIS_PREFIX: 'redis.prefix',
  EVENTS_REDIS_URL: 'events.redisUrl',
  EVENTS_SHARD_COUNT: 'events.shardCount',
  EVENTS_STREAM_MAXLEN: 'events.streamMaxLen',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'observability.otlpEndpoint',
  OTEL_EXPORTER_OTLP_HEADERS: 'observability.otlpHeaders',
  LOG_LEVEL: 'observability.logLevel',
  OTEL_SERVICE_NAMESPACE: 'observability.serviceNamespace',
  DOPPLER_PROJECT: 'secrets.dopplerProject',
  DOPPLER_CONFIG: 'secrets.dopplerConfig',
  KMS_KEY_ID: 'secrets.kmsKeyId',
} as const satisfies Record<string, string>;

export const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'REDIS_URL'] as const;
