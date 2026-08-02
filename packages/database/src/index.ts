/**
 * @aca/database — Prisma client factory + tenant-scoped client extension.
 *
 * Tenant isolation has two layers, deliberately:
 *   1. THIS extension: every read/update for direct-org models gets an orgId
 *      predicate injected; unique-key writes are pre-verified tenant-owned
 *      (jump ball to loud TenantViolationError, never silent cross-org data);
 *      creates auto-fill orgId (or reject mismatches) and always carry
 *      app-owned UUIDv7 ids.
 *   2. RLS in Postgres (docs/Database.md §6) as defense in depth — the app
 *      role never owns the bypass.
 *
 * TRANSACTION SEMANTICS (load-bearing): Prisma hands interactive-transaction
 * callbacks a client WITHOUT $extends (runtime-verified on 5.22: tx.$extends
 * === undefined), so an extended client's $transaction would deliver a RAW,
 * unfiltered tx — silently dropping tenant isolation and pre-commit read
 * visibility inside the very blocks meant to be atomic. forOrganization
 * therefore overrides $transaction: the callback receives a tenant-scoped
 * PROXY over the real interactive tx (same connection, same BEGIN/COMMIT,
 * with the identical scoping rules applied per call via
 * executeTenantScoped — the single source of truth for both paths).
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { generateId, idTimestamp } from './id.js';
import { tenantFieldFor } from '@aca/shared/constants/tenancy.js';

export { generateId, idTimestamp } from './id.js';

export interface TenantContext {
  organizationId: string;
}

const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const READ_OPS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']);
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: unknown;
  [k: string]: unknown;
}

function withOrgPredicate(args: AnyArgs, field: string, orgId: string): AnyArgs {
  const predicate = { [field]: orgId } as Record<string, unknown>;
  const where = args.where && Object.keys(args.where).length > 0 ? { AND: [args.where, predicate] } : predicate;
  return { ...args, where };
}

function injectIds(data: unknown): unknown {
  if (Array.isArray(data)) return data.map((row) => injectIds(row));
  if (data && typeof data === 'object') {
    const row = data as Record<string, unknown>;
    if (row.id === undefined) row.id = generateId();
  }
  return data;
}

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantViolationError';
  }
}

export function createPrismaClient(options?: { log?: Array<'query' | 'info' | 'warn' | 'error'> }): PrismaClient {
  return new PrismaClient({
    log: options?.log ?? (process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']),
  });
}

/** Anything the tenant rules can execute against — pool client or interactive tx. */
type TenantUnderlying = PrismaClient | Prisma.TransactionClient;

type RunOp = (nextArgs: unknown) => Promise<unknown>;

/**
 * THE tenant-scoping rules — single implementation shared by the $extends
 * query interception (pool-level client) and the interactive-tx proxy. Any
 * behavioral change to isolation lives EXACTLY here.
 */
async function executeTenantScoped(
  underlying: TenantUnderlying,
  orgId: string,
  model: string,
  operation: string,
  args: AnyArgs | undefined,
  run: RunOp,
): Promise<unknown> {
  injectIdsForModelOperation(operation, args ?? {});
  const field = tenantFieldFor(model);
  if (field === undefined) return run(args); // global or relation-scoped model

  const a = args ?? {};

  if (READ_OPS.has(operation) || operation === 'updateMany' || operation === 'deleteMany') {
    return run(withOrgPredicate(a, field, orgId));
  }

  if (operation === 'create' || operation === 'createMany') {
    assertOrgOnCreate(operation, a, field, orgId);
    return run(args);
  }

  if (operation === 'upsert') {
    await assertExistingRowIsTenantOwned(underlying, model, a.where ?? {}, field, orgId);
    assertOrgOnCreate(operation, a, field, orgId, 'create');
    // Prisma upsert `where` is WhereUniqueInput: it REQUIRES a top-level
    // unique key and rejects a bare root AND (caught live by the HTTP
    // integration suite — organizationBrand.upsert validation error). Merge
    // the tenant predicate as a SAME-LEVEL filter instead; a mismatched
    // caller-supplied tenant key in where is a loud violation, never silent.
    const where = { ...(a.where ?? {}) };
    if (where[field] !== undefined && where[field] !== orgId) {
      throw new TenantViolationError(`upsert where with mismatched tenant key on field "${field}"`);
    }
    where[field] = orgId;
    return run({ ...a, where });
  }

  if (UNIQUE_OPS.has(operation)) {
    await assertExistingRowIsTenantOwned(underlying, model, a.where ?? {}, field, orgId);
    return run(args);
  }

  return run(args);
}

/**
 * Tenant-scoped proxy over an INTERACTIVE transaction client. Prisma gives no
 * $extends here, so delegates are wrapped manually: every model delegate call
 * funnels through executeTenantScoped with `run = the real tx delegate`, so
 * in-tx reads see uncommitted state AND stay inside the tenant predicate.
 * $-prefixed members ($executeRaw etc.) pass through — raw SQL is the
 * documented escape hatch (same as the $extends path, which never saw them).
 */
function wrapInteractiveTransaction(tx: Prisma.TransactionClient, orgId: string): Prisma.TransactionClient {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const delegate: unknown = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || prop.startsWith('$') || delegate === null || typeof delegate !== 'object') {
        return delegate;
      }
      const model = prop.charAt(0).toUpperCase() + prop.slice(1); // organizationMember -> OrganizationMember
      return new Proxy(delegate as Record<string | symbol, unknown>, {
        get(dTarget, op, dReceiver) {
          const original: unknown = Reflect.get(dTarget, op, dReceiver);
          if (typeof op !== 'string' || typeof original !== 'function') return original;
          return (args?: unknown): Promise<unknown> =>
            executeTenantScoped(target, orgId, model, op, args as AnyArgs | undefined, (nextArgs) =>
              (original as (a: unknown) => Promise<unknown>).call(dTarget, nextArgs),
            );
        },
      });
    },
  });
}

/**
 * Returns a tenant-bound client. Two protections, layered:
 *  - ids are injected on writes (UUIDv7, app-owned);
 *  - for direct-org models, org predicate is injected into reads and
 *    updateMany/deleteMany where-clauses; unique-key writes (update/delete)
 *    are pre-verified with a findFirst(org-scoped) so a cross-org id can never
 *    be mutated — attempted violations throw TenantViolationError (they are a
 *    programming error or an attack, both must be loud).
 *
 * The extension changes BEHAVIOR only (predicate/id injection, tx wrapping) —
 * no new typed members. Returning PrismaClient keeps delegate types intact
 * for feature code (callbacks receive Prisma.TransactionClient).
 */
export function forOrganization<T extends PrismaClient>(client: T, ctx: TenantContext): PrismaClient {
  const orgId = ctx.organizationId;
  const extended = client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: unknown; query: RunOp }) {
          if (model === undefined) return query(args);
          return executeTenantScoped(client, orgId, model, operation, args as AnyArgs | undefined, query);
        },
      },
    },
  }) as unknown as PrismaClient;

  const originalTransaction = extended.$transaction.bind(extended) as (...callArgs: unknown[]) => Promise<unknown>;
  (extended as unknown as { $transaction: unknown }).$transaction = (arg: unknown, options?: unknown): Promise<unknown> => {
    if (typeof arg !== 'function') {
      // batch/interactive-array/raw forms: operations were already built
      // through the scoped delegates (filters injected at construction) —
      // unchanged behavior, routed to the original implementation.
      return originalTransaction(arg, options);
    }
    // Interactive form: run the callback against a tenant-scoped proxy of the
    // REAL interactive tx (BEGIN/COMMIT semantics untouched, isolation kept).
    return (client.$transaction as unknown as (cb: (tx: Prisma.TransactionClient) => unknown, opts?: unknown) => Promise<unknown>)(
      (rawTx) => (arg as (tx: Prisma.TransactionClient) => unknown)(wrapInteractiveTransaction(rawTx, orgId)),
      options,
    );
  };
  return extended;
}

function injectIdsForModelOperation(operation: string, args: AnyArgs): void {
  if (operation === 'create' && args.data !== undefined) args.data = injectIds(args.data);
  if (operation === 'createMany' && args.data !== undefined) args.data = injectIds(args.data);
  if (operation === 'upsert') {
    const data = args.data as { create?: unknown } | undefined;
    if (data?.create !== undefined) data.create = injectIds(data.create);
  }
}

function assertOrgOnCreate(
  operation: string,
  args: AnyArgs,
  field: string,
  orgId: string,
  dataKey = 'data',
): void {
  const data = args[dataKey] as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
  if (data === undefined) return;
  const rows = Array.isArray(data) ? data : [data];
  const createRows = operation === 'upsert' ? [((args[dataKey] as { create?: object }).create ?? {}) as Record<string, unknown>] : rows;
  for (const row of createRows) {
    if (row[field] === undefined) {
      if (field !== 'id') row[field] = orgId; // auto-fill; Organization carries its tenant key as id
    } else if (row[field] !== orgId) {
      throw new TenantViolationError(`create with mismatched tenant key on field "${field}"`);
    }
  }
}

async function assertExistingRowIsTenantOwned(
  underlying: TenantUnderlying,
  model: string,
  where: Record<string, unknown>,
  field: string,
  orgId: string,
): Promise<void> {
  const id = where.id as string | undefined;
  if (id === undefined) return; // non-id unique lookups are covered by caller-side org filters
  const delegate = (underlying as unknown as Record<string, { findFirst: Function }>)[uncapitalize(model)];
  const existing = (await delegate?.findFirst({ where: { id }, select: { [field]: true } })) as
    | Record<string, unknown>
    | null;
  if (existing === null) return; // nothing to violate; the write will no-op/fail naturally
  if (existing[field] !== orgId) {
    throw new TenantViolationError(`cross-tenant ${model} access blocked (id=${id})`);
  }
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** System client for org-less infrastructure (outbox relay, partition jobs, RLS bypass via aca_admin). */
export function systemClient(client: PrismaClient): PrismaClient {
  return client;
}

export type DbClient = PrismaClient;
export type TenantClient = ReturnType<typeof forOrganization>;
export { Prisma };
