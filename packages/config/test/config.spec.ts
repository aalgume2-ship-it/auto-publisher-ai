import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, redactConfig, redactUrlCredentials } from '../src/index.js';

const BASE = {
  DATABASE_URL: 'postgresql://aca:secret@localhost:5432/aca',
  REDIS_URL: 'redis://localhost:6379/0',
};

describe('loadConfig', () => {
  it('applies defaults with only required vars present', () => {
    const cfg = loadConfig({ ...BASE });
    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.http.port).toBe(3000);
    expect(cfg.events.shardCount).toBe(64);
    expect(cfg.events.streamMaxLen).toBe(1_000_000);
    expect(cfg.observability.logLevel).toBe('info');
    expect(cfg.database.poolMax).toBe(10);
    expect(cfg.auth.jwtIssuer).toBe('https://api.autocreator.ai');
    expect(cfg.auth.accessTokenTtlSec).toBe(900);
  });

  it('coerces ints/bools/lists from env strings', () => {
    const cfg = loadConfig({
      ...BASE,
      PORT: '8080',
      EVENTS_SHARD_COUNT: '128',
      TRUST_PROXY: 'false',
      CORS_ORIGINS: 'https://a.app, https://b.app',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'production',
    });
    expect(cfg.http.port).toBe(8080);
    expect(cfg.events.shardCount).toBe(128);
    expect(cfg.http.trustProxy).toBe(false);
    expect(cfg.http.corsOrigins).toEqual(['https://a.app', 'https://b.app']);
    expect(cfg.observability.logLevel).toBe('debug');
    expect(cfg.nodeEnv).toBe('production');
  });

  it('fails closed: ALL problems reported in one error', () => {
    try {
      loadConfig({ PORT: 'not-a-number', DATABASE_URL: 'mysql://x' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const problems = (err as ConfigError).problems;
      expect(problems.some((p) => p.includes('DATABASE_URL is required'))).toBe(true);
      expect(problems.some((p) => p.includes('REDIS_URL is required'))).toBe(true);
      expect(problems.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects malformed urls and out-of-range values', () => {
    expect(() => loadConfig({ ...BASE, EVENTS_SHARD_COUNT: '999' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...BASE, DATABASE_URL: 'http://nope' })).toThrow(ConfigError);
  });
});

describe('redaction', () => {
  it('masks credentials in urls and secret-looking keys', () => {
    expect(redactUrlCredentials('postgresql://aca:p4ss@db:5432/aca')).toBe(
      'postgresql://aca:<redacted>@db:5432/aca',
    );
    const cfg = loadConfig({
      DATABASE_URL: 'postgresql://aca:p4ss@localhost:5432/aca',
      REDIS_URL: 'redis://localhost:6379/0',
      KMS_KEY_ID: 'alias/aca-vault',
      DOPPLER_CONFIG: 'prd',
      AUTH_JWT_SECRET: 's'.repeat(32),
    });
    const safe = redactConfig(cfg) as Record<string, unknown>;
    expect(JSON.stringify(safe)).not.toContain('p4ss');
    expect(JSON.stringify(safe)).not.toContain('aca:p4ss');
    const auth = safe['auth'] as Record<string, unknown>;
    expect(auth['jwtSecret']).toBe('<redacted>');
    const secrets = safe['secrets'] as Record<string, unknown>;
    expect(secrets['kmsKeyId']).toBe('alias/aca-vault'); // key NAME is not a secret
    const db = safe['database'] as Record<string, unknown>;
    expect(db['url']).toBe('postgresql://aca:<redacted>@localhost:5432/aca');
    // but unredacted original keeps working (redaction is a copy)
    expect(cfg.database.url).toBe('postgresql://aca:p4ss@localhost:5432/aca');
  });
});
