import { describe, expect, it, vi } from 'vitest';
import { AuditService, resolveAuditActor, type AuditTx } from '../src/common/audit/audit.service.js';
import { REQUEST_CONTEXT, type RequestContextState } from '../src/common/context/request-context.js';

function ctxWith(patch: Partial<RequestContextState>): RequestContextState {
  return {
    requestId: 'req-1',
    correlationId: 'corr-1',
    traceId: 'a'.repeat(32),
    route: null,
    principal: null,
    userId: null,
    organizationId: null,
    membership: null,
    ip: '203.0.113.10',
    userAgent: 'vitest-agent/1.0',
    ...patch,
  };
}

function fakeTx() {
  const create = vi.fn().mockResolvedValue({});
  const tx: AuditTx = { auditLog: { create } };
  return { tx, create };
}

describe('resolveAuditActor (pure)', () => {
  it('maps user principal to USER/<userId>', () => {
    expect(resolveAuditActor({ kind: 'user', userId: 'u-1' })).toEqual({ actorType: 'USER', actorId: 'u-1' });
  });
  it('maps apikey principal to API_KEY/<keyId>', () => {
    expect(resolveAuditActor({ kind: 'apikey', apiKeyId: 'k-9' })).toEqual({ actorType: 'API_KEY', actorId: 'k-9' });
  });
  it('maps absent principal to SYSTEM/null', () => {
    expect(resolveAuditActor(null)).toEqual({ actorType: 'SYSTEM', actorId: null });
  });
});

describe('AuditService.record', () => {
  it('writes one audit row with actor/ip/userAgent taken from request context (not arguments)', async () => {
    const { tx, create } = fakeTx();
    const svc = new AuditService();
    const ctx = ctxWith({ principal: { kind: 'user', userId: 'user-7', sessionId: 's-1' } });
    await REQUEST_CONTEXT.run(ctx, () =>
      svc.record(tx, { orgId: 'org-1', action: 'team.created', entityType: 'Team', entityId: 't-1', metadata: { name: 'Core' } }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({
      orgId: 'org-1',
      actorId: 'user-7',
      actorType: 'USER',
      action: 'team.created',
      entityType: 'Team',
      entityId: 't-1',
      ip: '203.0.113.10',
      userAgent: 'vitest-agent/1.0',
      metadata: { name: 'Core' },
    });
  });

  it('omits metadata key when not provided and records SYSTEMactor outside a request scope', async () => {
    const { tx, create } = fakeTx();
    const svc = new AuditService();
    await svc.record(tx, { orgId: null, action: 'system.bootstrap', entityType: 'System' });
    const arg = create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data['actorType']).toBe('SYSTEM');
    expect(arg.data['actorId']).toBeNull();
    expect('metadata' in arg.data).toBe(false);
  });

  it('propagates tx errors (caller aborts the whole transaction)', async () => {
    const tx: AuditTx = { auditLog: { create: vi.fn().mockRejectedValue(new Error('db gone')) } };
    const svc = new AuditService();
    await expect(svc.record(tx, { orgId: 'o', action: 'x.y', entityType: 'X' })).rejects.toThrow('db gone');
  });
});
