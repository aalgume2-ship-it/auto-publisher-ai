/**
 * Tenant-scope extension unit tests — direct coverage for the platform's
 * isolation backbone (previously exercised only indirectly behind fakes,
 * which is how the interactive-tx isolation collapse shipped unnoticed).
 *
 * Fakes model the contract precisely: a queryable target whose delegates
 * record (model, operation, args) and return canned rows; no Prisma runtime.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { UuidV7Schema } from '@aca/shared';
import { TenantViolationError, forOrganization } from '../src/index.js';

const ORG = '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55';
const OTHER_ORG = '0190844f-9f30-7000-8000-2f8f6a1c4e99';
const TEAM_ID = '0190844f-9f31-7c3a-9b1d-2f8f6a1c4e77';

interface DelegateCall {
  model: string;
  op: string;
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
}

/** Builds a fake queryable (tx-shaped): every delegate call is recorded. */
function fakeUnderlying(rows: Record<string, Record<string, unknown> | null> = {}) {
  const calls: DelegateCall[] = [];
  const delegates = new Map<string, unknown>();
  const makeDelegate = (model: string): unknown =>
    new Proxy(
      {},
      {
        get: (_t, op) =>
          typeof op !== 'string'
            ? undefined
            : async (args?: DelegateCall['args']): Promise<unknown> => {
                calls.push({ model, op, args });
                if (op === 'findFirst' || op === 'findUnique') return rows[model] ?? null;
                return { ok: true };
              },
      },
    );
  const raw = new Proxy(
    { $marker: 'raw-tx' },
    {
      get: (t, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop.startsWith('$')) return t[prop as '$marker'];
        let d = delegates.get(prop);
        if (d === undefined) {
          d = makeDelegate(prop.charAt(0).toUpperCase() + prop.slice(1));
          delegates.set(prop, d);
        }
        return d;
      },
    },
  );
  return { raw: raw as unknown as import('@prisma/client').Prisma.TransactionClient, calls };
}

/**
 * Calls forOrganization's $transaction override with a fake interactive tx and
 * returns { tx, calls } — mirrors what Prisma does: pool client executes the
 * callback with the raw interactive tx.
 */
async function inScopedTx<T>(
  fn: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
  rows: Record<string, Record<string, unknown> | null> = {},
): Promise<{ calls: DelegateCall[]; result: T }> {
  const underlying = fakeUnderlying(rows);
  let txCb: ((tx: import('@prisma/client').Prisma.TransactionClient) => unknown) | undefined;
  const fakeClient = {
    $extends: (def: unknown) => ({
      __def: def,
      $transaction: (batch: unknown) => batch,
    }),
    $transaction: (cb: unknown) => {
      txCb = cb as typeof txCb;
    },
  };
  const scoped = forOrganization(fakeClient as unknown as PrismaClient, { organizationId: ORG });
  // The override stores its wrapper via the pool client's $transaction; register
  // it with a capture callback, drive it once with the fake raw tx, then run the
  // actual test body against the captured (wrapped) tx.
  let captured: import('@prisma/client').Prisma.TransactionClient | undefined;
  void (scoped.$transaction as unknown as (cb: (tx: import('@prisma/client').Prisma.TransactionClient) => void) => unknown)((
    tx,
  ) => {
    captured = tx;
  });
  if (txCb === undefined) throw new Error('override did not route through the pool client');
  txCb(underlying.raw); // wrapper executes the capture callback with the wrapped tx
  if (captured === undefined) throw new Error('wrapper never invoked the callback');
  const result = await fn(captured);
  return { calls: underlying.calls, result };
}

describe('tenant-scope interactive-tx wrapper', () => {
  it('injects the org predicate into reads INSIDE transactions (isolation does not collapse)', async () => {
    const { calls } = await inScopedTx(async (tx) => {
      await tx.team.findFirst({ where: { id: TEAM_ID } });
    });
    expect(calls[0]?.args?.where).toEqual({ AND: [{ id: TEAM_ID }, { orgId: ORG }] });
  });

  it('auto-fills orgId and injects a UUIDv7 id on create', async () => {
    const { calls } = await inScopedTx(async (tx) => {
      await tx.team.create({ data: { name: 'Shorts Squad' } });
    });
    const data = calls[0]?.args?.data ?? {};
    expect(data['orgId']).toBe(ORG);
    expect(UuidV7Schema.safeParse(data['id']).success).toBe(true);
  });

  it('rejects create with a mismatched tenant key (loud, never silent)', async () => {
    await expect(
      inScopedTx(async (tx) => {
        await tx.team.create({ data: { orgId: OTHER_ORG, name: 'x' } });
      }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it('pre-verifies ownership for unique-key writes — cross-org id throws, in-org proceeds', async () => {
    // row belongs to OTHER_ORG: the pre-check findFirst runs against the SAME tx
    await expect(
      inScopedTx(
        async (tx) => {
          await tx.team.update({ where: { id: TEAM_ID }, data: { name: 'hijacked' } });
        },
        { Team: { orgId: OTHER_ORG } },
      ),
    ).rejects.toBeInstanceOf(TenantViolationError);

    const { calls } = await inScopedTx(
      async (tx) => {
        await tx.team.update({ where: { id: TEAM_ID }, data: { name: 'legit' } });
      },
      { Team: { orgId: ORG } },
    );
    // pre-check read + the actual update, both on the tx
    expect(calls.map((c) => c.op)).toEqual(['findFirst', 'update']);
    expect(calls[1]?.args?.where).toEqual({ id: TEAM_ID });
  });

  it('non-tenant models (OutboxEvent) pass through unscoped — with id injection still applied', async () => {
    const { calls } = await inScopedTx(async (tx) => {
      await tx.outboxEvent.create({ data: { type: 'aca.organization.created' } });
    });
    const data = calls[0]?.args?.data ?? {};
    expect('orgId' in data).toBe(false); // infra table: never org-filtered by design
    expect(UuidV7Schema.safeParse(data['id']).success).toBe(true); // app-owned ids everywhere
  });

  it('$-prefixed members pass through untouched (raw SQL stays the documented escape hatch)', async () => {
    const { result } = await inScopedTx(async (tx) => (tx as unknown as { $marker: string }).$marker);
    expect(result).toBe('raw-tx');
  });

  it('updateMany/deleteMany carry the org predicate', async () => {
    const { calls } = await inScopedTx(async (tx) => {
      await tx.project.updateMany({ where: { teamId: TEAM_ID }, data: { teamId: null } });
    });
    expect(calls[0]?.args?.where).toEqual({ AND: [{ teamId: TEAM_ID }, { orgId: ORG }] });
  });
});

describe('forOrganization.$transaction override shape', () => {
  it('routes interactive callbacks through the POOL client (real BEGIN/COMMIT preserved)', async () => {
    let sawOptions: unknown;
    const fakeClient = {
      $extends: () => ({ $transaction: (batch: unknown) => batch }),
      $transaction: (_cb: unknown, options?: unknown) => {
        sawOptions = options;
        return Promise.resolve('TX-RESULT');
      },
    };
    const scoped = forOrganization(fakeClient as unknown as PrismaClient, { organizationId: ORG });
    const result = await (scoped.$transaction as unknown as (cb: () => string, o?: unknown) => Promise<string>)(
      () => 'inner',
      { timeout: 5000 },
    );
    expect(result).toBe('TX-RESULT');
    expect(sawOptions).toEqual({ timeout: 5000 }); // tx options survive the override
  });

  it('non-function (batch/array) forms pass to the original implementation untouched', async () => {
    const batchSeen: unknown[] = [];
    const fakeClient = {
      $extends: () => ({
        $transaction: (batch: unknown) => {
          batchSeen.push(batch);
          return Promise.resolve(batch);
        },
      }),
      $transaction: () => {
        throw new Error('pool client $transaction must NOT be used for batch form');
      },
    };
    const scoped = forOrganization(fakeClient as unknown as PrismaClient, { organizationId: ORG });
    await (scoped.$transaction as unknown as (batch: unknown[]) => Promise<unknown>)(['a', 'b']);
    expect(batchSeen).toEqual([['a', 'b']]);
  });
});
