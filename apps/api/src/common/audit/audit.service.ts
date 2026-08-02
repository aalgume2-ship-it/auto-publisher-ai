/**
 * AuditService — security/financial mutation journaling (ADR-027d audit-inline rule).
 *
 * RULES:
 *  - record() writes the audit_logs row INSIDE the caller's transaction —
 *    mutation + audit commit together or not at all. Never fire-and-forget.
 *  - Actor/ip/userAgent come from RequestContext (the middleware/guard-minted
 *    truth), NEVER from arguments — a caller cannot spoof who they are.
 *  - actions use the `entity.verb_past` shape: 'team.created', 'brand.reset'.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@aca/database';
import { maybeRequestContext } from '../context/request-context.js';

/** The audit writer needs only the auditLog delegate of a real Prisma transaction. */
export type AuditTx = Pick<Prisma.TransactionClient, 'auditLog'>;

export type AuditActor = { actorType: 'USER' | 'API_KEY' | 'SYSTEM' | 'OAUTH_APP' | 'SCIM'; actorId: string | null };

export interface AuditEntry {
  /** null only for platform-level actions with no org context (rare in this module). */
  orgId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Maps the request principal to an audit actor — pure (unit-tested). */
export function resolveAuditActor(principal: {
  kind: 'user' | 'apikey';
  userId?: string;
  apiKeyId?: string;
} | null): AuditActor {
  if (principal === null) return { actorType: 'SYSTEM', actorId: null };
  if (principal.kind === 'user') return { actorType: 'USER', actorId: principal.userId ?? null };
  return { actorType: 'API_KEY', actorId: principal.apiKeyId ?? null };
}

@Injectable()
export class AuditService {
  /**
   * Writes one audit row inside `tx`. Id is minted by the tenant-extension id
   * injector when running on a tenant tx (callers do not set ids).
   */
  async record(tx: AuditTx, entry: AuditEntry): Promise<void> {
    const ctx = maybeRequestContext();
    const actor = resolveAuditActor(ctx?.principal ?? null);
    const data: Prisma.AuditLogUncheckedCreateInput = {
      orgId: entry.orgId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    };
    if (entry.metadata !== undefined) {
      data.metadata = entry.metadata as Prisma.InputJsonValue;
    }
    // id is minted by the tenant-extension injector on tenant txs; on plain
    // txs Prisma generates nothing (schema has no default) — injectors cover
    // all module call sites, so no fallback here by design.
    await tx.auditLog.create({ data });
  }
}
