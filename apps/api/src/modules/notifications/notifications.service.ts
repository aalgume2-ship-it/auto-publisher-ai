/**
 * NotificationsService — the per-USER notification surface.
 *
 * Why per-user and not per-org: the Prisma model (`Notification.userId`) is
 * tied to a user, not an organization. The /:orgId path segment in the URL
 * is the access-control anchor — the TenantGuard verifies the caller is a
 * member of that org; the rows returned are filtered by the caller's userId
 * (which the controller passes in explicitly from the verified session).
 * Cross-tenant reads are therefore impossible by construction.
 *
 * The membership check is duplicated here (not just the TenantGuard) as
 * defense-in-depth: if a future refactor changes the guard's behavior, the
 * service still enforces it. The check is cheap (one indexed lookup).
 *
 * Concurrency: marking one row read is a conditional update on
 * `readAt IS NULL` so the timestamp is only set on the transition. The row
 * count returned by `markAllRead` is the count of rows that ACTUALLY
 * transitioned (so the UI can decrement the badge by exactly that number).
 */
import { Inject, Injectable } from '@nestjs/common';
import { type DbClient } from '@aca/database';
import { apiErrors } from '../../common/errors/api-error.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { DomainOperations } from '../../common/telemetry/domain-operations.js';
import type { ListNotificationsQuery } from './notifications.dto.js';

const MODULE = 'notifications';

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data === null || typeof row.data !== 'object' ? (row.data as Record<string, unknown> | null) : (row.data as Record<string, unknown>),
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PRISMA) private readonly db: DbClient,
    private readonly ops: DomainOperations,
  ) {}

  /**
   * Verify the caller is a member of `orgId`. Returns nothing; throws 403
   * if not a member. This is what makes the per-user rows safe to return
   * through an org-scoped path. The TenantGuard already enforces this at
   * the guard layer; this is a second line of defense.
   */
  private async assertCallerIsMember(orgId: string, userId: string): Promise<void> {
    const member = await this.db.organizationMember.findFirst({
      where: { orgId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (member === null) {
      // Mask as 404 (membership oracle defense) — same shape TenantGuard emits.
      throw apiErrors.notFound('Organization');
    }
  }

  async list(orgId: string, userId: string, query: ListNotificationsQuery): Promise<{ items: NotificationDto[]; unreadCount: number; nextCursor: string | null }> {
    return this.ops.measure(MODULE, 'list', async () => {
      await this.assertCallerIsMember(orgId, userId);

      const where = {
        userId,
        ...(query.unreadOnly === true ? { readAt: null } : {}),
        ...(query.cursor !== undefined ? { createdAt: { lt: new Date(query.cursor) } } : {}),
      };

      const rows = await this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const nextCursor = rows.length > query.limit && page.length > 0
        ? (page[page.length - 1]?.createdAt.toISOString() ?? null)
        : null;

      // Unread count is independent of pagination — it is the badge number.
      // Computed in a single aggregate, no N+1.
      const unreadCount = await this.db.notification.count({
        where: { userId, readAt: null },
      });

      return {
        items: page.map(toNotificationDto),
        unreadCount,
        nextCursor,
      };
    });
  }

  /**
   * Mark a single notification as read. Idempotent: a second call returns
   * the same `readAt` and does NOT transition again (the `updateMany` filter
   * requires `readAt IS NULL`).
   */
  async markRead(orgId: string, userId: string, notificationId: string): Promise<{ id: string; readAt: string }> {
    return this.ops.measure(MODULE, 'markRead', async () => {
      await this.assertCallerIsMember(orgId, userId);

      // Ownership check FIRST (don't leak existence to non-owners).
      const owned = await this.db.notification.findFirst({
        where: { id: notificationId, userId },
        select: { id: true },
      });
      if (owned === null) throw apiErrors.notFound('Notification');

      const now = new Date();
      const updated = await this.db.notification.updateMany({
        where: { id: notificationId, userId, readAt: null },
        data: { readAt: now },
      });
      if (updated.count === 0) {
        // Already read — return the existing readAt (idempotent semantics).
        const existing = await this.db.notification.findUniqueOrThrow({
          where: { id: notificationId },
          select: { readAt: true },
        });
        return { id: notificationId, readAt: (existing.readAt ?? now).toISOString() };
      }
      return { id: notificationId, readAt: now.toISOString() };
    });
  }

  /**
   * Mark all the caller's unread notifications as read. Returns the count of
   * rows that ACTUALLY transitioned, so the UI can decrement the badge by
   * exactly that number.
   */
  async markAllRead(orgId: string, userId: string): Promise<{ updated: number }> {
    return this.ops.measure(MODULE, 'markAllRead', async () => {
      await this.assertCallerIsMember(orgId, userId);

      const now = new Date();
      const result = await this.db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: now },
      });
      return { updated: result.count };
    });
  }
}
