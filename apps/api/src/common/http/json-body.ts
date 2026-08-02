/**
 * Lenient-but-strict JSON body parsing (public-API interop).
 *
 * Stock fastify rejects EMPTY bodies that carry `content-type: application/json`
 * with FST_ERR_CTP_EMPTY_JSON_BODY (verified live: any DELETE/POST-without-body
 * from a generated client — swagger/openapi generators habitually send the
 * header unconditionally — is answered 400 before the request ever reaches Nest).
 * For a PUBLIC api that is an interop failure, not a feature: the fix is the
 * official Nest API `adapter.useBodyParser('application/json', rawBody, opts,
 * parser)` with a parser that maps empty/whitespace bodies to undefined and
 * keeps strict JSON for everything else (malformed payloads still fail 400 at
 * the transport layer, same behavior class as stock).
 *
 * Registered EXACTLY here and called from both boot paths (main.ts + the
 * integration kit) so the two can never drift. useBodyParser marks parsers as
 * registered, so Nest's own init-time parser registration does NOT override
 * us, and its parseAs:'buffer' + rawBody capture (webhook signature
 * verification) is preserved.
 *
 * Typing note: @nestjs/platform-fastify vendors its OWN nested fastify, so
 * fastify's public FastifyBodyParser type is a DIFFERENT nominal identity
 * under NodeNext. The runtime contract (request wrapper, Buffer body, done
 * callback) is what the adapter actually invokes; parameters are therefore
 * typed to the runtime truth and the function is asserted once at the seam.
 */
import type { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';

/** Runtime shape the adapter guarantees (see registerUrlencodedContentParser/internal useBodyParser). */
type JsonBodyParserFn = (req: unknown, body: Buffer, done: (err: Error | null, result?: unknown) => void) => void;

const lenientJsonParser: JsonBodyParserFn = (_req, body, done) => {
  const text = body.toString('utf8');
  if (text.trim() === '') {
    done(null, undefined);
    return;
  }
  try {
    done(null, JSON.parse(text));
  } catch (cause) {
    done(cause as Error, undefined); // parser errors surface as 400 at the transport layer (stock behavior class)
  }
};

export function registerLenientJsonBodyParser(app: NestFastifyApplication, options: { bodyLimitBytes: number }): void {
  // app.useBodyParser's NestApplication typing truncates the adapter's full
  // (type, rawBody, options, parser) signature — invoke the typed adapter
  // method via the generic interface. Semantics identical (it passes through).
  const adapter = app.getHttpAdapter() as unknown as FastifyAdapter;
  adapter.useBodyParser('application/json', true, { bodyLimit: options.bodyLimitBytes }, lenientJsonParser as never);
}
