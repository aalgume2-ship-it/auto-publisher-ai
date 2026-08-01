import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, redactFields, REDACTED } from '../src/index.js';

function capture(): { stream: Writable; lines: () => Array<Record<string, unknown>> } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe('@aca/logger', () => {
  it('emits structured JSON with service/version/env base fields', () => {
    const c = capture();
    const log = createLogger({ service: 'apps/api', version: '1.2.3', environment: 'test', destination: c.stream });
    log.info({ reqId: 'r-1' }, 'hello');
    const [line] = c.lines();
    expect(line?.service).toBe('apps/api');
    expect(line?.version).toBe('1.2.3');
    expect(line?.env).toBe('test');
    expect(line?.msg).toBe('hello');
    expect(line?.reqId).toBe('r-1');
    expect(typeof line?.time).toBe('string');
  });

  it('level filtering works', () => {
    const c = capture();
    const log = createLogger({ service: 'svc', level: 'warn', destination: c.stream });
    log.debug({ a: 1 }, 'hidden');
    log.info({ a: 1 }, 'hidden too');
    log.warn({ a: 1 }, 'shown');
    expect(c.lines()).toHaveLength(1);
    expect(c.lines()[0]?.msg).toBe('shown');
  });

  it('child bindings persist; secrets are structurally redacted on every path', () => {
    const c = capture();
    const root = createLogger({ service: 'svc', destination: c.stream });
    const child = root.child({ module: 'billing', providerApiKey: 'sk_live_123' });
    child.error({ err: new Error('boom'), nested: { clientSecret: 's3cr3t', ok: 1 } }, 'failed');
    const [line] = c.lines();
    expect(line?.module).toBe('billing');
    expect(line?.providerApiKey).toBe(REDACTED);
    expect((line?.nested as Record<string, unknown>)?.clientSecret).toBe(REDACTED);
    expect((line?.nested as Record<string, unknown>)?.ok).toBe(1);
    expect(typeof (line?.err as Record<string, unknown>)?.message).toBe('string');
  });

  it('redactFields erases url-embedded credentials without touching normal text', () => {
    const out = redactFields({
      db: 'postgresql://aca:p4ss@db:5432/aca',
      note: 'postgresql is great',
      redisUrl: 'redis://:s3cr3t@redis:6379/0',
    });
    expect(out['db']).toBe(`postgresql://aca:${'<redacted>'}@db:5432/aca`);
    expect(out['note']).toBe('postgresql is great');
    expect(out['redisUrl']).toBe(`redis://:${'<redacted>'}@redis:6379/0`);
  });

  it('satisfies the @aca/events Logger port shape (obj-first)', () => {
    interface EventsLogger {
      debug(obj: Record<string, unknown>, msg: string): void;
      info(obj: Record<string, unknown>, msg: string): void;
      warn(obj: Record<string, unknown>, msg: string): void;
      error(obj: Record<string, unknown>, msg: string): void;
    }
    const log: ReturnType<typeof createLogger> = createLogger({ service: 'svc', destination: capture().stream });
    const compat: EventsLogger = log;
    expect(typeof compat.info).toBe('function');
    expect(typeof compat.error).toBe('function');
  });
});
