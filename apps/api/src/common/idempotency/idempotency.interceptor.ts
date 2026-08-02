/**
 * IdempotencyInterceptor — Postgres-backed Idempotency-Key handling for
 * mutating routes (requirement: idempotency on every route that creates or
 * modifies data; ADR-025; docs/API.md §1).
 *
 * Semantics (IdempotencyRecord table = source of truth, survives Redis flush):
 *   - @Idempotent() requires the `Idempotency-Key` header (400 otherwise).
 *   - First use: insert IN_FLIGHT with a lease and run the handler; on success
 *     the response (status + body) is STORED; on error the record is DELETED
 *     (failures are never cached — retrying after a 5xx is legitimate).
 *   - Replay with SAME requestHash: stored response returned byte-identically
 *     with `Idempotency-Replayed: true`.
 *   - Replay with DIFFERENT requestHash, or concurrent same-key while
 *     IN_FLIGHT (inside lease): 409 IDEMPOTENCY_CONFLICT.
 *   - Stale lease (crashed between claim and completion): the next same-key
 *     request claims the record and re-runs — exactly the crash-recovery the
 *     lease exists for.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  Inject,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { EMPTY, Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { generateId, type DbClient } from '@aca/database';
import { apiErrors } from '../errors/api-error.js';
import { requestContext } from '../context/request-context.js';
import { PRISMA } from '../prisma.provider.js';

export const IDEMPOTENT_KEY = 'aca:idempotent';

export interface IdempotentOptions {
  /** lease for the IN_FLIGHT claim, ms (default 30s) */
  leaseMs?: number;
  /** retention of COMPLETED records, ms (default 24h) */
  ttlMs?: number;
}

export const Idempotent = (opts: IdempotentOptions = {}) => SetMetadata(IDEMPOTENT_KEY, opts);

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Deterministic canonical JSON (sorted keys, no whitespace) for requestHash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

export function requestHashOf(parts: { body: unknown; params: unknown; query: unknown }): string {
  return createHash('sha256').update(canonicalJson(parts), 'utf8').digest('hex');
}

function actorHashOf(): string {
  const ctx = requestContext();
  const id =
    ctx.principal?.kind === 'user'
      ? `u:${ctx.principal.userId}`
      : ctx.principal?.kind === 'apikey'
        ? `k:${ctx.principal.apiKeyId}`
        : `ip:${ctx.ip}`;
  return createHash('sha256').update(id, 'utf8').digest('hex');
}

export interface ExistingRecordDecision {
  action: 'replay' | 'conflict' | 'claim';
  reason?: string;
}

/** Pure replay/conflict decision over an existing record (unit-tested directly). */
export function decideExistingRecord(
  record: { state: string; requestHash: string; lockedUntil: Date | null },
  requestHash: string,
  now: Date,
): ExistingRecordDecision {
  if (record.state === 'COMPLETED') {
    if (record.requestHash !== requestHash) {
      return { action: 'conflict', reason: 'same Idempotency-Key used with a different request payload' };
    }
    return { action: 'replay' };
  }
  // IN_FLIGHT
  if (record.lockedUntil !== null && record.lockedUntil.getTime() > now.getTime()) {
    return { action: 'conflict', reason: 'a request with this Idempotency-Key is still in progress' };
  }
  return { action: 'claim' }; // stale lease → claim and re-run
}

type ExistingRecord = {
  id: string;
  state: string;
  requestHash: string;
  statusCode: number | null;
  responseBody: unknown;
  lockedUntil: Date | null;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const opts = this.reflector.getAllAndOverride<IdempotentOptions>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (opts === undefined) return next.handle();

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const headerVal = req.headers['idempotency-key'];
    const key = typeof headerVal === 'string' && headerVal !== '' ? headerVal : undefined;
    if (key === undefined) {
      throw apiErrors.validationFailed([{ path: 'Idempotency-Key', code: 'invalid_type', message: 'Idempotency-Key header is required on this route' }]);
    }

    const scope = `${req.method} ${req.routeOptions?.url ?? req.url.split('?')[0] ?? ''}`;
    const actorHash = actorHashOf();
    const requestHash = requestHashOf({ body: req.body ?? null, params: req.params ?? {}, query: req.query ?? {} });
    const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
    const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;

    return from(this.begin(scope, key, actorHash, requestHash, leaseMs)).pipe(
      mergeMap((begin) => {
        if (begin.action === 'replay') {
          // REPLAY = verbatim response: the stored SERIALIZED bytes go out
          // untouched. Never let Nest/Fastify re-serialize a parsed object —
          // any parse/serialize round-trip (or a jsonb column's key reorder)
          // defeats the byte-identical replay contract (API.md §1).
          reply.header('content-type', 'application/json; charset=utf-8');
          if (begin.statusCode !== null) void reply.code(begin.statusCode);
          reply.header('Idempotency-Replayed', 'true');
          void reply.send(begin.responseBody ?? 'null');
          return EMPTY; // response already sent — no value must reach the route
        }
        if (begin.action === 'conflict') {
          throw apiErrors.idempotencyConflict(begin.reason ?? 'idempotency conflict');
        }
        const recordId = begin.recordId;
        return next.handle().pipe(
          mergeMap((body: unknown) => {
            const declaredCode =
              this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ??
              (req.method === 'POST' ? 201 : 200);
            return from(
              this.prisma.idempotencyRecord.update({
                where: { id: recordId },
                data: {
                  state: 'COMPLETED',
                  statusCode: declaredCode,
                  // store the exact wire bytes (fastify serializes handler
                  // results with JSON.stringify — this is byte-for-byte what
                  // the first caller receives, hence what replays must be)
                  responseBody: JSON.stringify(body ?? null),
                  lockedUntil: null,
                  completedAt: new Date(),
                  expiresAt: new Date(Date.now() + ttlMs),
                },
              }),
            ).pipe(mergeMap(() => of(body)));
          }),
          catchError((err: unknown) =>
            // failures are NOT cached: delete the claim so the client can retry
            from(this.prisma.idempotencyRecord.deleteMany({ where: { id: recordId } })).pipe(
              mergeMap(() => throwError(() => err)),
            ),
          ),
        );
      }),
    );
  }

  private async begin(
    scope: string,
    key: string,
    actorHash: string,
    requestHash: string,
    leaseMs: number,
  ): Promise<
    | { action: 'run'; recordId: string }
    | { action: 'replay'; statusCode: number | null; responseBody: string | null }
    | { action: 'conflict'; reason: string }
  > {
    const now = new Date();
    try {
      const created = await this.prisma.idempotencyRecord.create({
        data: {
          id: generateId(),
          scope,
          key,
          actorHash,
          requestHash,
          state: 'IN_FLIGHT',
          lockedUntil: new Date(now.getTime() + leaseMs),
          expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS),
        },
        select: { id: true },
      });
      return { action: 'run', recordId: created.id };
    } catch (err: unknown) {
      // structural P2002 check (unique violation) — avoids instanceof fragility
      // across prisma client boundary layers; name+code together are unambiguous
      const e = err as { name?: unknown; code?: unknown } | null;
      const isUniqueRace = typeof e === 'object' && e !== null && e.name === 'PrismaClientKnownRequestError' && e.code === 'P2002';
      if (!isUniqueRace) throw err;
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_actorHash_key: { scope, actorHash, key } },
      select: { id: true, state: true, requestHash: true, statusCode: true, responseBody: true, lockedUntil: true },
    });
    if (existing === null) throw apiErrors.internal(); // P2002 but row vanished — inconsistent

    const verdict = decideExistingRecord(existing as ExistingRecord, requestHash, now);
    if (verdict.action === 'replay') {
      return { action: 'replay', statusCode: existing.statusCode, responseBody: existing.responseBody };
    }
    if (verdict.action === 'conflict') {
      return { action: 'conflict', reason: verdict.reason ?? 'idempotency conflict' };
    }
    // claim the stale lease
    const claimed = await this.prisma.idempotencyRecord.updateMany({
      where: { id: existing.id, state: 'IN_FLIGHT', lockedUntil: { lt: now } },
      data: { lockedUntil: new Date(now.getTime() + leaseMs), requestHash },
    });
    if (claimed.count === 0) {
      return { action: 'conflict', reason: 'a request with this Idempotency-Key is still in progress' };
    }
    return { action: 'run', recordId: existing.id };
  }
}
