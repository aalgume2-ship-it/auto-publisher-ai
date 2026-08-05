/**
 * NotificationsController — /v1/organizations/:orgId/notifications (per-user inbox).
 *
 * Three endpoints, all tenant-anchored (the /:orgId path is the access-control
 * anchor — the TenantGuard verifies membership; the rows are per-userId):
 *   GET   /                — list (paged, newest first)
 *   PATCH /:notificationId/read  — mark one read (idempotent)
 *   PATCH /read-all        — mark all read, returns the transition count
 *
 * Capability gate: `project.view` — every org member can see their own
 * notifications. (No new capability needed; reusing the same gate the
 * dashboard uses for read-only views.)
 *
 * The controller reads the caller's `userId` from the request context and
 * passes it explicitly to the service. This keeps the service testable
 * without faking the AsyncLocalStorage, and matches the pattern used by
 * VideosController.generate (which also passes `ctx.userId` explicitly).
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { PROBLEM } from '../../common/http/problem-details.openapi.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { apiErrors } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/context/request-context.js';
import { OrgParamsSchema } from '../organizations/organizations.dto.js';
import {
  ListNotificationsQuery,
  MarkAllReadDoc,
  MarkReadDoc,
  NotificationIdParamsSchema,
  NotificationListDoc,
  NotificationParamsSchema,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

const ORG_PARAM = { name: 'orgId' as const, format: 'uuid' };
const NOTIF_PARAM = { name: 'notificationId' as const, format: 'uuid' };

/** Extract the caller's userId from the request context or throw 401. */
function callerUserId(): string {
  const id = requestContext().userId;
  if (id === null) throw apiErrors.unauthenticated();
  return id;
}

@ApiTags('notifications')
@ApiUnauthorizedResponse({ description: 'Missing/invalid credentials', content: { 'application/problem+json': { schema: PROBLEM } } })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', content: { 'application/problem+json': { schema: PROBLEM } } })
@Controller({ path: 'organizations/:orgId/notifications', version: '1' })
@TenantRequired()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequiresCapabilities('project.view')
  @UseZod({ params: OrgParamsSchema, query: ListNotificationsQuery })
  @ApiOperation({
    operationId: 'listNotifications',
    summary: "List the caller's notifications for this org context (paged, newest first)",
  })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Notification page', schema: NotificationListDoc })
  list(
    @Param('orgId') orgId: string,
    @Query() query: ListNotificationsQuery,
  ) {
    return this.notifications.list(orgId, callerUserId(), query);
  }

  @Patch(':notificationId/read')
  @HttpCode(200)
  @RequiresCapabilities('project.view')
  @UseZod({ params: NotificationParamsSchema })
  @ApiOperation({
    operationId: 'markNotificationRead',
    summary: 'Mark one notification as read (idempotent — repeated calls return the original readAt)',
  })
  @ApiParam(ORG_PARAM)
  @ApiParam(NOTIF_PARAM)
  @ApiOkResponse({ description: 'Marked read (or already was)', schema: MarkReadDoc })
  @ApiNotFoundResponse({ description: 'Notification not visible to this user', content: { 'application/problem+json': { schema: PROBLEM } } })
  markRead(
    @Param() params: { orgId: string; notificationId: string },
  ) {
    return this.notifications.markRead(params.orgId, callerUserId(), params.notificationId);
  }

  @Patch('read-all')
  @HttpCode(200)
  @RequiresCapabilities('project.view')
  @UseZod({ params: NotificationIdParamsSchema })
  @ApiOperation({
    operationId: 'markAllNotificationsRead',
    summary: "Mark all of the caller's unread notifications as read; returns the count of rows that actually transitioned",
  })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Bulk mark-read result', schema: MarkAllReadDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  markAllRead(
    @Param() params: { orgId: string },
    // Body is intentionally accepted-but-unused so the web client's
    // `api.patch(path, {}, token)` call shape works without a custom header.
    @Body() _body: Record<string, never> = {},
  ) {
    return this.notifications.markAllRead(params.orgId, callerUserId());
  }
}
