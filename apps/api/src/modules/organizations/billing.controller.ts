/**
 * OrgBillingController — billing profile + subscription read (API.md §4.5).
 * Checkout/plan changes are the billing-provider module's surface (Module 12);
 * nothing here mutates subscription state — by design.
 */
import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { OrgParamsSchema } from './organizations.dto.js';
import { BillingProfileBody, BillingProfileDoc, PutBillingProfileBodyDoc, SubscriptionResponseDoc } from './billing.dto.js';
import { OrgBillingService } from './billing.service.js';

const PROBLEM = { $ref: '#/components/schemas/ProblemDetails' };
const ORG_PARAM = { name: 'orgId' as const, format: 'uuid' };

@ApiTags('billing')
@Controller({ path: 'organizations/:orgId', version: '1' })
@TenantRequired()
export class OrgBillingController {
  constructor(private readonly billing: OrgBillingService) {}

  @Get('billing-profile')
  @RequiresCapabilities('billing.view')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'getOrganizationBillingProfile', summary: 'Legal/tax billing profile (billing.view); all-null fields when absent' })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Billing profile (null fields when never set)', schema: BillingProfileDoc })
  @ApiForbiddenResponse({ description: 'Missing billing.view capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  getBillingProfile(@Param('orgId') orgId: string) {
    return this.billing.getBillingProfile(orgId);
  }

  @Put('billing-profile')
  @HttpCode(200)
  @RequiresCapabilities('billing.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: BillingProfileBody })
  @ApiOperation({
    operationId: 'putOrganizationBillingProfile',
    summary: 'Upsert billing profile (OWNER: billing.manage); billingEmail required on first create. Values never logged.',
  })
  @ApiParam(ORG_PARAM)
  @ApiBody({ schema: PutBillingProfileBodyDoc })
  @ApiOkResponse({ description: 'Upserted billing profile', schema: BillingProfileDoc })
  @ApiBadRequestResponse({ description: 'Validation failed (billingEmail required on create)', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing billing.manage (OWNER only)', content: { 'application/problem+json': { schema: PROBLEM } } })
  putBillingProfile(@Param('orgId') orgId: string, @Body() body: BillingProfileBody) {
    return this.billing.putBillingProfile(orgId, body);
  }

  @Get('subscription')
  @RequiresCapabilities('billing.view')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'getOrganizationSubscription', summary: 'Current subscription + embedded plan + AI credit balance (billing.view)' })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Subscription, plan and credit balance', schema: SubscriptionResponseDoc })
  @ApiNotFoundResponse({ description: 'No subscription for this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing billing.view capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  getSubscription(@Param('orgId') orgId: string) {
    return this.billing.getSubscription(orgId);
  }
}
