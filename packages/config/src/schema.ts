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

  auth: z
    .object({
      /**
       * First-party session-JWT verification (ADR-025 interim until @aca/auth).
       * The secret VALUE is injected by the secret manager at runtime (Doppler),
       * never committed; redacted from every log surface by both redactors.
       * Services that need it fail closed at bootstrap when absent.
       */
      jwtSecret: z.string().min(32).optional(),
      jwtIssuer: z.string().default('https://api.autocreator.ai'),
      jwtAudience: z.string().default('aca-first-party'),
      /** seconds; HMAC-verified access tokens are short-lived */
      accessTokenTtlSec: intFromEnv(900).pipe(z.number().int().min(60).max(86_400)),
      /** seconds; refresh tokens are session-lifetime (default 30 days, rotated on every use) */
      refreshTokenTtlSec: intFromEnv(2_592_000).pipe(z.number().int().min(86_400).max(31_536_000)),
      /** ms; retry-safe window accepting the PREVIOUS refresh hash (Okta-style rotation grace) */
      refreshGraceMs: intFromEnv(45_000).pipe(z.number().int().min(0).max(300_000)),
      passwordMinLength: intFromEnv(12).pipe(z.number().int().min(8).max(128)),
      totpIssuer: z.string().default('AutoCreator AI'),
      /** AES-256-GCM at-rest key for TOTP secrets (32 bytes hex). Optional at parse; MFA paths fail closed without it. */
      totpEncryptionKey: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
      totpKeyId: z.string().default('local-v1'),
    })
    .default({}),

  secrets: z.object({
    /** Doppler project/config identifiers (values live in Doppler, never here). */
    dopplerProject: z.string().optional(),
    dopplerConfig: z.string().optional(),
    /** KMS key id for the envelope vault (ARN or alias). */
    kmsKeyId: z.string().optional(),
    /**
     * Master key (32 bytes hex) for the platform token vault used to encrypt
     * channel OAuth tokens (ChannelCredential.ciphertext) at rest — AES-256-GCM
     * envelope `v1.<keyId>.<iv>.<tag>.<ct>` (same wire format as @aca/auth TOTP).
     * Optional at parse; channel-link paths fail CLOSED without it.
     */
    masterKey: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
    masterKeyId: z.string().default('vault-v1'),
  })
    .default({}),

  /**
   * Publishing-platform OAuth clients (Roadmap Module-2 'Channels'). Values are
   * runtime secrets (Render env / Doppler), referenced here by name only.
   * When absent the OAuth start endpoint answers 503 PLATFORM_ERROR naming the
   * exact env keys to provision — a real configuration state, never a stub.
   */
  platforms: z
    .object({
      googleClientId: z.string().min(1).optional(),
      googleClientSecret: z.string().min(1).optional(),
      /** Full callback URL registered in Google Cloud Console (defaults to PUBLIC_API_URL derivation). */
      googleOauthRedirectUri: z.string().url().optional(),
    })
    .default({}),

  /**
   * AI provider credentials (Roadmap Module 'video engine'). Zero-key default:
   * when OPENAI_API_KEY is unset the pipeline runs on the key-less providers
   * (Pollinations text/image + gTTS voice) — 100% real generation, free tier.
   */
  ai: z
    .object({
      openaiApiKey: z.string().min(1).optional(),
      openaiModel: z.string().default('gpt-4o-mini'),
      openaiTtsVoice: z.string().default('alloy'),
    })
    .default({}),

  /** Public base URLs (used to build OAuth callbacks + post-callback redirects). */
  urls: z
    .object({
      publicApi: z.string().url().optional(),
      publicWeb: z.string().url().optional(),
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
  AUTH_JWT_SECRET: 'auth.jwtSecret',
  AUTH_JWT_ISSUER: 'auth.jwtIssuer',
  AUTH_JWT_AUDIENCE: 'auth.jwtAudience',
  AUTH_ACCESS_TOKEN_TTL_SEC: 'auth.accessTokenTtlSec',
  AUTH_REFRESH_TOKEN_TTL_SEC: 'auth.refreshTokenTtlSec',
  AUTH_REFRESH_GRACE_MS: 'auth.refreshGraceMs',
  AUTH_PASSWORD_MIN_LENGTH: 'auth.passwordMinLength',
  AUTH_TOTP_ISSUER: 'auth.totpIssuer',
  AUTH_TOTP_ENCRYPTION_KEY: 'auth.totpEncryptionKey',
  AUTH_TOTP_KEY_ID: 'auth.totpKeyId',
  DOPPLER_PROJECT: 'secrets.dopplerProject',
  DOPPLER_CONFIG: 'secrets.dopplerConfig',
  KMS_KEY_ID: 'secrets.kmsKeyId',
  SECRETS_MASTER_KEY: 'secrets.masterKey',
  SECRETS_MASTER_KEY_ID: 'secrets.masterKeyId',
  GOOGLE_CLIENT_ID: 'platforms.googleClientId',
  GOOGLE_CLIENT_SECRET: 'platforms.googleClientSecret',
  GOOGLE_OAUTH_REDIRECT_URI: 'platforms.googleOauthRedirectUri',
  OPENAI_API_KEY: 'ai.openaiApiKey',
  OPENAI_MODEL: 'ai.openaiModel',
  OPENAI_TTS_VOICE: 'ai.openaiTtsVoice',
  PUBLIC_API_URL: 'urls.publicApi',
  PUBLIC_WEB_URL: 'urls.publicWeb',
} as const satisfies Record<string, string>;

export const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'REDIS_URL'] as const;
