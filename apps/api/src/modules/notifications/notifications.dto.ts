/**
 * Notifications module — DTOs (zod truth + OpenAPI doc shapes, co-evolved).
 *
 * Endpoints (all under /v1/organizations/:orgId/notifications):
 *   GET    /                  list the caller's notifications for the org context
 *   PATCH  /:notificationId/read  mark one as read (idempotent)
 *   PATCH  /read-all          mark all unread as read (returns the count)
 *
 * Scope: notifications are per-USER, not per-ORG. The /:orgId path segment
 * is the access-control anchor (caller must be a member of that org); the
 * rows are filtered by the caller's userId. This matches the Prisma model
 * (`Notification.userId` + `NotificationPreference.userId`).
 */
import { z } from 'zod';
import { UuidV7Schema } from '@aca/shared';

/* ----------------------------------------------------------- zod (truth) */

export const NotificationParamsSchema = z.object({
  orgId: UuidV7Schema,
  notificationId: UuidV7Schema,
});

export const NotificationIdParamsSchema = z.object({
  orgId: UuidV7Schema,
});

export const ListNotificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** When present, only return rows with createdAt strictly less than this. */
  cursor: z.string().datetime().optional(),
  /** When true, return only unread rows. Default false. */
  unreadOnly: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuery>;

/* ----------------------------------------------------- OpenAPI doc shapes */

export const NotificationDoc = {
  type: 'object' as const,
  required: ['id', 'type', 'title', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid', example: '019fc720-8fea-7cd3-a1b2-390aaf0d2f71' },
    type: {
      type: 'string',
      enum: ['PIPELINE', 'PUBLISHING', 'BILLING', 'SECURITY', 'SYSTEM', 'MARKETPLACE', 'TEAM'],
      example: 'PUBLISHING',
    },
    title: { type: 'string', example: 'Your video is ready' },
    body: { type: 'string', nullable: true, example: 'Render completed in 3m 42s.' },
    data: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
      example: { videoId: '019fc720-8fea-7cd3-a1b2-390aaf0d2f71' },
    },
    readAt: { type: 'string', format: 'date-time', nullable: true, example: null },
    createdAt: { type: 'string', format: 'date-time', example: '2026-08-05T13:15:00.000Z' },
  },
};

export const NotificationListDoc = {
  type: 'object' as const,
  required: ['items', 'unreadCount'],
  properties: {
    items: { type: 'array', items: NotificationDoc },
    unreadCount: { type: 'integer', example: 3 },
    nextCursor: { type: 'string', format: 'date-time', nullable: true, example: null },
  },
};

export const MarkReadDoc = {
  type: 'object' as const,
  required: ['id', 'readAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    readAt: { type: 'string', format: 'date-time' },
  },
};

export const MarkAllReadDoc = {
  type: 'object' as const,
  required: ['updated'],
  properties: {
    updated: { type: 'integer', example: 4, description: 'Count of rows whose readAt transitioned from null to a timestamp in this call' },
  },
};
