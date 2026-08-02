/**
 * @aca/database — Prisma client factory + tenant enforcement extension.
 *
 * Two hard rules (docs/Architecture.md §6.2):
 *   1. Every tenant-scoped model query MUST go through `forOrganization(...)`.
 *   2. Ids are minted by `generateId()` (UUIDv7) at write time — schema provides
 *      no DB-side defaults.
 *
 * The extension enforces org predicates for models that carry the tenant key
 * DIRECTLY. Models whose tenancy is inherited through a relation (TeamMember→Team,
 * Script→Video, PipelineStepRun→PipelineRun, analytics day-rows, …) must be
 * reached through an org-scoped parent query — domain services own that rule and
 * the CI suite `test/tenancy.spec.ts` locks it in against regressions.
 *
 * Models with NULLABLE orgId (Workflow/AiEmployee system defaults, global
 * memory) are excluded here on purpose: they are read through system paths.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { tenantFieldFor } from '@aca/shared/constants/tenancy.js';
import { generateId } from './id.js';

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

/**
 * Returns a tenant-bound client. Two protections, layered:
 *  - ids are injected on writes (UUIDv7, app-owned);
 *  - for direct-org models, org predicate is injected into reads and
 *    updateMany/deleteMany where-clauses; unique-key writes (update/delete)
 *    are pre-verified with a findFirst(org-scoped) so a cross-org id can never
 *    be mutated — attempted violations throw TenantViolationError (they are a
 *    programming error or an attack, both must be loud).
 */
export function forOrganization<T extends PrismaClient>(client: T, ctx: TenantContext): PrismaClient {
  const orgId = ctx.organizationId;
  // The extension changes BEHAVIOR only (predicate/id injection) — no new
  // typed members. Returning PrismaClient keeps delegate types intact for
  // feature code (incl. $transaction -> Prisma.TransactionClient).
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          injectIdsForModelOperation(operation, (args as AnyArgs) ?? {});
          const field = model ? tenantFieldFor(model) : undefined;
          if (!field) return query(args); // global or relation-scoped model

          const a = (args ?? {}) as AnyArgs;

          if (READ_OPS.has(operation) || operation === 'updateMany' || operation === 'deleteMany') {
            return query(withOrgPredicate(a, field, orgId));
          }

          if (operation === 'create' || operation === 'createMany') {
            assertOrgOnCreate(operation, a, field, orgId);
            return query(args);
          }

          if (operation === 'upsert') {
            await assertExistingRowIsTenantOwned(client, model!, a.where ?? {}, field, orgId);
            assertOrgOnCreate(operation, a, field, orgId, 'create');
            return query(withOrgPredicate(a, field, orgId));
          }

          if (UNIQUE_OPS.has(operation)) {
            await assertExistingRowIsTenantOwned(client, model!, a.where ?? {}, field, orgId);
            return query(args);
          }

          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
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
  client: PrismaClient,
  model: string,
  where: Record<string, unknown>,
  field: string,
  orgId: string,
): Promise<void> {
  const id = where.id as string | undefined;
  if (id === undefined) return; // non-id unique lookups are covered by caller-side org filters
  const delegate = (client as unknown as Record<string, { findFirst: Function }>)[uncapitalize(model)];
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
