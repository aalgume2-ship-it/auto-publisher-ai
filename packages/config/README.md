# @aca/config

Environment loading & validation — **the single place where `process.env` is read** (L1; depends only on `@aca/shared` for typing).

## Design rules

- Services never touch `process.env` directly; they receive a typed `AppConfig` produced once at boot.
- Secrets appear here by **name only** (Doppler project/config, KMS key id) — values are injected by the secret manager at runtime.
- **Fails closed**: every missing/invalid variable is collected and reported in ONE `ConfigError` — no trickle of boot failures.
- The env→config mapping is explicit and complete (`ENV_MAP`); there is no wildcard passthrough.

## API

```ts
import { loadConfig, redactConfig, ConfigError } from '@aca/config';

const config = loadConfig(); // throws ConfigError listing ALL problems
```

- `loadConfig(env?)` — builds a raw object from the explicit `ENV_MAP`, then zod-validates (coercions/defaults live in the schema). Required vars: `DATABASE_URL`, `REDIS_URL`; everything else has safe defaults.
- `redactConfig(config)` — deep copy safe for logs/health endpoints: secret-looking leaf values erased, URL credentials (`user:pass@`) masked.
- `redactUrlCredentials(url)` — masks `scheme://user:pass@host` → `scheme://user:<redacted>@host` (user part may be empty).

## Development

```bash
pnpm --filter @aca/config build
pnpm --filter @aca/config test
```
