import { describe, expect, it } from 'vitest';
import { planReplay, REPLAY_BATCH } from '../src/replay.js';

describe('replay planner (pure)', () => {
  it('composes filters and bounds', () => {
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-08-01T00:00:00Z');
    const plan = planReplay({ type: 'aca.video.generated', orgId: '8c9d0e1f-2a3b-4c5d-9e6f-7a8b9c0d1e2f', from, to, limit: 1000 });
    const where = plan.where as { AND: Array<Record<string, unknown>> };
    expect(where.AND).toContainEqual({ publishedAt: { not: null } });
    expect(where.AND).toContainEqual({ type: 'aca.video.generated' });
    expect(where.AND).toContainEqual({ orgId: '8c9d0e1f-2a3b-4c5d-9e6f-7a8b9c0d1e2f' });
    expect(where.AND).toContainEqual({ occurredAt: { gte: from, lte: to } });
    expect(plan.take).toBe(REPLAY_BATCH);
    expect(plan.orderBy).toEqual([{ id: 'asc' }]);
  });

  it('uses uuidv7 id-cursor with skip for exact pagination', () => {
    const plan = planReplay({ aggregateId: 'a-1' }, '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55');
    expect(plan.cursor).toEqual({ id: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55' });
    expect(plan.skip).toBe(1);
    expect(plan.orderBy).toEqual([{ id: 'asc' }]); // time-monotonic ids — safe cursor order
  });

  it('refuses scope-less replays (library default protects the journal)', () => {
    expect(() => planReplay({})).toThrow(/requires at least one filter/);
  });

  it('only replays rows that actually reached the bus', () => {
    const plan = planReplay({ type: 'aca.flags.changed' });
    const where = plan.where as { AND: Array<Record<string, unknown>> };
    expect(where.AND[0]).toEqual({ publishedAt: { not: null } });
  });

  it('single-side time bounds work', () => {
    const from = new Date('2026-07-15T00:00:00Z');
    const plan = planReplay({ orgId: 'x', from });
    const where = plan.where as { AND: Array<Record<string, { gte?: Date; lte?: Date }>> };
    const bound = where.AND.find((c) => 'occurredAt' in c) as { occurredAt: { gte?: Date; lte?: Date } };
    expect(bound.occurredAt.gte).toBe(from);
    expect(bound.occurredAt.lte).toBeUndefined();
  });
});
