/**
 * Raw binary body parser (application/octet-stream) for large media imports.
 *
 * Voice packs (Piper ONNX, up to ~120MB) and stock footage clips arrive as
 * raw streams, not base64-in-JSON — halving bandwidth and keeping the JSON
 * body limit free for its actual job. Registered beside the lenient JSON
 * parser so both boot paths (main.ts + integration kit) share it.
 */
import type { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';

/** Runtime shape the adapter guarantees (see registerLenientJsonBodyParser). */
type RawBodyParserFn = (req: unknown, body: Buffer, done: (err: Error | null, result?: unknown) => void) => void;

const passthroughParser: RawBodyParserFn = (_req, body, done) => {
  done(null, body);
};

export function registerRawBinaryBodyParser(app: NestFastifyApplication, options: { bodyLimitBytes: number }): void {
  const adapter = app.getHttpAdapter() as unknown as FastifyAdapter;
  adapter.useBodyParser('application/octet-stream', true, { bodyLimit: options.bodyLimitBytes }, passthroughParser as never);
}
