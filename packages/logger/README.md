# @aca/logger

Structured JSON logging port (L2). **pino is the transport behind OUR `Logger` interface** — swappable without touching consumers (same discipline as the ports in Architecture §16).

## Design rules

- Every app creates ONE root logger at boot via `createLogger` and binds children per module/request (`logger.child({...})`).
- Output is JSON by default; pretty single-line output is opt-in for local dev.
- **OTel-correlated**: `traceId`/`spanId` are injected from the active span when one exists.
- **Structural redaction**: secret-looking keys and credentials embedded in URLs (`user:pass@`) are erased before anything is written — redaction happens in the fields, not after serialization.
- Satisfies the `Logger` port declared by `@aca/events` (`{debug,info,warn,error}(fields, msg)`), so the event backbone can log through it without a dependency cycle.

## API

```ts
import { createLogger } from '@aca/logger';

const log = createLogger({ service: 'apps/api', level: 'info' });
log.info({ port: 3000 }, 'server listening');
const req = log.child({ requestId, orgId });
req.error({ err }, 'request failed');
```

- `createLogger({ service, level?, pretty?, destination?, version?, environment? })`
- `redactFields(fields)` — exported for reuse (tests, edge surfaces).

## Development

```bash
pnpm --filter @aca/logger build
pnpm --filter @aca/logger test
```
