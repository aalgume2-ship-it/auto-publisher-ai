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
import { PROBLEM } from '../../common/http/problem-details.openapi.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { OrgParamsSchema } from './organizations.dto.js';
import { BillingProfileBody, BillingProfileDoc, BillingPlansDoc, CheckoutSessionBody, CheckoutSessionBodyDoc, CheckoutSessionDoc, PutBillingProfileBodyDoc, SubscriptionResponseDoc } from './billing.dto.js';
import { OrgBillingService } from './billing.service.js';

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

  @Get('plans')
  @RequiresCapabilities('billing.view')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'listBillingPlans', summary: 'List public plans available for checkout' })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Public plans', schema: BillingPlansDoc })
  listPlans(@Param('orgId') _orgId: string) {
    return this.billing.listPublicPlans();
  }

  @Put('checkout-session')
  @HttpCode(200)
  @RequiresCapabilities('billing.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: CheckoutSessionBody })
  @ApiOperation({ operationId: 'createCheckoutSession', summary: 'Create a Stripe Checkout session for the selected plan' })
  @ApiParam(ORG_PARAM)
  @ApiBody({ schema: CheckoutSessionBodyDoc })
  @ApiOkResponse({ description: 'Checkout session', schema: CheckoutSessionDoc })
  createCheckoutSession(@Param('orgId') orgId: string, @Body() body: CheckoutSessionBody) {
    return this.billing.createCheckoutSession(orgId, body);
  }
}
