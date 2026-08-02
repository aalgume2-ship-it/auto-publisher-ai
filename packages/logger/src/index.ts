/**
 * @aca/logger — the structured logging port (L2).
 *
 * pino is the transport behind OUR interface (swappable without touching
 * consumers — same discipline as §16 ports). Every app creates ONE root
 * logger at boot (`createLogger`) and binds children per module/request.
 * Log shape is JSON, OTel-correlated (`traceId` injected from active span
 * when present), structurally redacted for secret-looking keys and
 * credentials-in-URLs.
 *
 * Satisfies the Logger port declared by @aca/events ({debug,info,warn,error}(obj,msg)).
 *
 * pino interop note: pino ships `export = pino` (CJS). Under NodeNext the
 * shape of named/default type imports DRIFTED between 9.x releases (CI proved
 * 9.6 vs 9.14 disagree), so we take the runtime-stable default import and
 * bind it through ONE explicit factory interface — runtime behavior is
 * identical on every 9.x (module.exports IS the factory with statics).
 */
import pinoPkg, {
  type DestinationStream,
  type Level,
  type Logger as PinoLogger,
} from 'pino';
import { trace, context } from '@opentelemetry/api';

interface PinoFactory {
  (options?: Record<string, unknown>, stream?: DestinationStream): PinoLogger;
  transport(opts: { target: string; options?: Record<string, unknown> }): DestinationStream;
  stdSerializers: { err: (e: unknown) => unknown };
  stdTimeFunctions: { isoTime: unknown };
}
const pino = pinoPkg as unknown as PinoFactory;

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(fields: LogFields, msg: string): void;
  info(fields: LogFields, msg: string): void;
  warn(fields: LogFields, msg: string): void;
  error(fields: LogFields, msg: string): void;
  /** Binds fields to every subsequent line (module name, request id, org…). */
  child(bindings: LogFields): Logger;
}

/* ---------------- redaction ---------------- */

const SECRET_KEY_PATTERN =
  /(secret|token|password|apikey|api[_-]?key|private[_-]?key|clientsecret|signing[_-]?secret|authorization|ciphertext)/i;
export const REDACTED = '<redacted>';

function redactValue(value: unknown, keyHint: string | null): unknown {
  if (keyHint !== null && SECRET_KEY_PATTERN.test(keyHint)) return REDACTED;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') {
      // erase user:pass@ credentials that sneaked into string fields (user part may be empty)
      return value.replace(/(\w[\w-]*):\/\/([^:@/?]*):([^@/?]+)@/g, `$1://$2:${REDACTED}@`);
    }
    return value;
  }
  if (value instanceof Error) {
    return value; // serialized separately by pino's err serializer
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, null));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactValue(v, k);
  }
  return out;
}

export function redactFields(fields: LogFields): LogFields {
  return redactValue(fields, null) as LogFields;
}

/* ---------------- logger ---------------- */

export interface LoggerOptions {
  /** Deployable identity (apps/api, apps/worker…). */
  service: string;
  level?: Level;
  /** Pretty single-line output for local dev (default: only in development). */
  pretty?: boolean;
  destination?: DestinationStream;
  version?: string;
  environment?: string;
}

function otelTraceBindings(): LogFields {
  const sc = trace.getSpan(context.active())?.spanContext();
  if (sc === undefined) return {};
  return { traceId: sc.traceId, spanId: sc.spanId };
}

class PinoLoggerAdapter implements Logger {
  constructor(private readonly inner: PinoLogger) {}

  private line(level: Level, fields: LogFields, msg: string): void {
    const merged = { ...redactFields(fields), ...otelTraceBindings() };
    this.inner[level](merged, msg);
  }
  debug(fields: LogFields, msg: string): void {
    this.line('debug', fields, msg);
  }
  info(fields: LogFields, msg: string): void {
    this.line('info', fields, msg);
  }
  warn(fields: LogFields, msg: string): void {
    this.line('warn', fields, msg);
  }
  error(fields: LogFields, msg: string): void {
    this.line('error', fields, msg);
  }
  child(bindings: LogFields): Logger {
    return new PinoLoggerAdapter(this.inner.child(redactFields(bindings)));
  }
}

export function createLogger(opts: LoggerOptions): Logger {
  const level = opts.level ?? 'info';
  const base = {
    service: opts.service,
    version: opts.version ?? '0.0.0-dev',
    env: opts.environment ?? process.env['NODE_ENV'] ?? 'development',
  };
  if (opts.pretty === true) {
    const transport = pino.transport({
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,version' },
    });
    return new PinoLoggerAdapter(
      pino(
        { level, base, timestamp: pino.stdTimeFunctions.isoTime, serializers: { err: pino.stdSerializers.err } },
        opts.destination ?? transport,
      ),
    );
  }
  return new PinoLoggerAdapter(
    pino(
      {
        level,
        base,
        timestamp: pino.stdTimeFunctions.isoTime,
        serializers: { err: pino.stdSerializers.err },
      },
      opts.destination,
    ),
  );
}
