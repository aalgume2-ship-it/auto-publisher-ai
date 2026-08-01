/**
 * @aca/config — load & validate environment into a typed AppConfig.
 * Fails CLOSED: every missing/invalid variable listed in ONE error (no
 * trickle of boot failures), secrets redacted structurally for logs.
 */
import { AppConfigSchema, ENV_MAP, REQUIRED_ENV_KEYS, type AppConfig } from './schema.js';

export { AppConfigSchema, ENV_MAP, REQUIRED_ENV_KEYS, type AppConfig };

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`invalid environment (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** config section → the env var whose absence produces a section-level issue */
const SECTION_ENV = { database: 'DATABASE_URL', redis: 'REDIS_URL' } as const;

function setPath(target: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i] as string;
    node[key] = (node[key] ?? {}) as Record<string, unknown>;
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1] as string] = value;
}

/**
 * Builds the raw config object from an env record using the explicit map,
 * then zod-validates it (coercions/defaults live in the schema).
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): AppConfig {
  const problems: string[] = [];
  for (const key of REQUIRED_ENV_KEYS) {
    if (env[key] === undefined || env[key] === '') problems.push(`${key} is required but missing`);
  }

  const raw: Record<string, unknown> = {};
  for (const [envKey, path] of Object.entries(ENV_MAP)) {
    const value = env[envKey];
    if (value !== undefined && value !== '') setPath(raw, path, value);
  }

  const parsed = AppConfigSchema.safeParse(raw);
  if (!parsed.success) {
    problems.push(
      ...parsed.error.issues.map((i) => {
        const issuePath = i.path.join('.');
        // section-level issues (e.g. missing `redis` object) map to the env
        // key REQUIRES that section
        const sectionEnv =
          i.path.length === 1 && issuePath in SECTION_ENV
            ? SECTION_ENV[issuePath as keyof typeof SECTION_ENV]
            : undefined;
        const envKey =
          sectionEnv ?? Object.entries(ENV_MAP).find(([, path]) => path === issuePath)?.[0];
        if (envKey === undefined) return `${issuePath}: ${i.message}`;
        const requiredNote = (REQUIRED_ENV_KEYS as readonly string[]).includes(envKey)
          ? i.path.length === 1
            ? ' is required but missing'
            : ' is required but invalid'
          : '';
        return `${envKey}${requiredNote} (${issuePath}): ${i.message}`;
      }),
    );
    throw new ConfigError(problems);
  }
  if (problems.length > 0) throw new ConfigError(problems);
  return parsed.data;
}

/* ---------------- redaction ---------------- */

const SECRET_KEY_PATTERN = /(secret|token|password|apikey|api[_-]?key|private[_-]?key|clientsecret|signing[_-]?secret)/i;
const REDACTED = '<redacted>';

/** Deep-copies config with secret-looking values erased — safe for logs/health endpoints. */
export function redactConfig(config: unknown): unknown {
  if (config === null || typeof config !== 'object') return config;
  if (Array.isArray(config)) return config.map(redactConfig);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key) && (typeof value === 'string' || typeof value === 'number')) {
      // leaf values under secret-looking keys are erased; object subtrees are
      // recursed into (the `secrets` section holds identifiers only — see schema)
      out[key] = REDACTED;
    } else if (key === 'url' && typeof value === 'string') {
      out[key] = redactUrlCredentials(value);
    } else {
      out[key] = redactConfig(value);
    }
  }
  return out;
}

/** postgresql://user:pass@host → postgresql://user:<redacted>@host (user part may be empty) */
export function redactUrlCredentials(url: string): string {
  return url.replace(/(\w[\w-]*):\/\/([^:@/?]*):([^@/?]+)@/, `$1://$2:${REDACTED}@`);
}
