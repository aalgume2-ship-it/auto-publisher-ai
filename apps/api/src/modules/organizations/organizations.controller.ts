/**
 * OrganizationsController — organization entity + settings routes (API.md §4.1/§4.5).
 * THIN BY RULE (requirement: no business logic in controllers): each handler
 * reads authenticated facts from RequestContext, calls exactly one service
 * method, returns its result. Validation: @UseZod. Authorization: guard chain
 * metadata. Documentation: @nestjs/swagger with the doc schemas from *.dto.ts.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { requestContext } from '../../common/context/request-context.js';
import {
  CreateOrganizationBody,
  CreateOrganizationBodyDoc,
  OrgParamsSchema,
  OrganizationDoc,
  SecurityPolicyBody,
  SecurityPolicyBodyDoc,
  SettingsDoc,
  UpdateOrganizationBody,
  UpdateOrganizationBodyDoc,
  UpdateSettingsBody,
  UpdateSettingsBodyDoc,
} from './organizations.dto.js';
import { OrganizationsService } from './organizations.service.js';

const PROBLEM = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('organizations')
@Controller({ path: 'organizations', version: '1' })
@ApiUnauthorizedResponse({ description: 'Missing/invalid credentials', content: { 'application/problem+json': { schema: PROBLEM } } })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (RateLimit-* headers carry the budget)', content: { 'application/problem+json': { schema: PROBLEM } } })
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /* ---------------------------------------------------------- entity */

  @Post()
  @HttpCode(201)
  @Idempotent()
  @UseZod({ body: CreateOrganizationBody })
  @ApiOperation({
    operationId: 'createOrganization',
    summary: 'Create an organization (caller becomes OWNER)',
    description: 'User-JWT only. Slug auto-derives from name when omitted (numeric suffix on collision).',
  })
  @ApiBody({ schema: CreateOrganizationBodyDoc })
  @ApiCreatedResponse({ description: 'Organization created', schema: OrganizationDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'Provided slug already taken', content: { 'application/problem+json': { schema: PROBLEM } } })
  createOrganization(@Body() body: CreateOrganizationBody) {
    const ctx = requestContext();
    return this.organizations.createOrganization(
      { kind: ctx.principal?.kind ?? 'user', userId: ctx.userId },
      body,
    );
  }

  @Get(':orgId')
  @TenantRequired()
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'getOrganization', summary: 'Organization detail with member/team/department counts' })
  @ApiParam({ name: 'orgId', format: 'uuid', example: '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b' })
  @ApiOkResponse({ description: 'Organization detail', schema: OrganizationDoc })
  @ApiNotFoundResponse({ description: 'Not a member / does not exist (indistinguishable)', content: { 'application/problem+json': { schema: PROBLEM } } })
  getOrganization(@Param('orgId') orgId: string) {
    return this.organizations.getOrganization(orgId);
  }

  @Patch(':orgId')
  @TenantRequired()
  @RequiresCapabilities('org.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: UpdateOrganizationBody })
  @ApiOperation({ operationId: 'updateOrganization', summary: 'Update organization profile fields (org.manage)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiBody({ schema: UpdateOrganizationBodyDoc })
  @ApiOkResponse({ description: 'Updated organization', schema: OrganizationDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing org.manage capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiNotFoundResponse({ description: 'Not a member / does not exist', content: { 'application/problem+json': { schema: PROBLEM } } })
  updateOrganization(@Param('orgId') orgId: string, @Body() body: UpdateOrganizationBody) {
    return this.organizations.updateOrganization(orgId, body);
  }

  /* ---------------------------------------------------------- settings */

  @Get(':orgId/settings')
  @TenantRequired()
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'getOrganizationSettings', summary: 'Organization settings (timezone, locale, security policy)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiOkResponse({ description: 'Settings', schema: SettingsDoc })
  @ApiNotFoundResponse({ description: 'Not a member / does not exist', content: { 'application/problem+json': { schema: PROBLEM } } })
  getSettings(@Param('orgId') orgId: string) {
    return this.organizations.getSettings(orgId);
  }

  @Patch(':orgId/settings')
  @TenantRequired()
  @RequiresCapabilities('org.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: UpdateSettingsBody })
  @ApiOperation({ operationId: 'updateOrganizationSettings', summary: 'Update general settings (org.manage)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiBody({ schema: UpdateSettingsBodyDoc })
  @ApiOkResponse({ description: 'Updated settings', schema: SettingsDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing org.manage capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  updateSettings(@Param('orgId') orgId: string, @Body() body: UpdateSettingsBody) {
    return this.organizations.updateSettings(orgId, body);
  }

  @Patch(':orgId/settings/security-policy')
  @TenantRequired()
  @RequiresCapabilities('security.policy.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: SecurityPolicyBody })
  @ApiOperation({
    operationId: 'updateOrganizationSecurityPolicy',
    summary: 'Update security policy (OWNER: security.policy.manage)',
    description: 'Whitelist-merge against { enforceSso, enforceMfa, sessionMaxHours, ipAllowListEnabled }; unknown keys are dropped.',
  })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiBody({ schema: SecurityPolicyBodyDoc })
  @ApiOkResponse({ description: 'Updated settings', schema: SettingsDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing security.policy.manage capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  updateSecurityPolicy(@Param('orgId') orgId: string, @Body() body: SecurityPolicyBody) {
    return this.organizations.updateSecurityPolicy(orgId, body);
  }
}
