/**
 * DomainsController — /organizations/:orgId/domains routes (API.md §5).
 * Registration + verification + deletion are OWNER-only (domain.manage
 * resolves to OWNER in ROLE_CAPABILITIES); listing is any org member.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
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
} from '@nestjs/swagger';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { OrgParamsSchema } from './organizations.dto.js';
import { CreateDomainBody, CreateDomainBodyDoc, DomainDoc, DomainParamsSchema, DomainRegisteredDoc } from './domains.dto.js';
import { DomainsService } from './domains.service.js';

const PROBLEM = { $ref: '#/components/schemas/ProblemDetails' };
const ORG_PARAM = { name: 'orgId' as const, format: 'uuid' };
const DOMAIN_PARAM = { name: 'domainId' as const, format: 'uuid' };

@ApiTags('domains')
@Controller({ path: 'organizations/:orgId/domains', version: '1' })
@TenantRequired()
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'listOrganizationDomains', summary: 'List custom domains (any org member)' })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Domains', schema: { type: 'object', properties: { data: { type: 'array', items: DomainDoc } } } })
  listDomains(@Param('orgId') orgId: string) {
    return this.domains.listDomains(orgId);
  }

  @Post()
  @HttpCode(201)
  @RequiresCapabilities('domain.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: CreateDomainBody })
  @ApiOperation({ operationId: 'registerOrganizationDomain', summary: 'Register a custom domain (OWNER) — issues the DNS verification challenge' })
  @ApiParam(ORG_PARAM)
  @ApiBody({ schema: CreateDomainBodyDoc })
  @ApiCreatedResponse({ description: 'Registered; verification challenge issued', schema: DomainRegisteredDoc })
  @ApiBadRequestResponse({ description: 'Domain hostname invalid', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing domain.manage (OWNER only)', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'Domain already registered (globally unique)', content: { 'application/problem+json': { schema: PROBLEM } } })
  registerDomain(@Param('orgId') orgId: string, @Body() body: CreateDomainBody) {
    return this.domains.registerDomain(orgId, body);
  }

  @Post(':domainId/verify')
  @HttpCode(200)
  @RequiresCapabilities('domain.manage')
  @Idempotent()
  @UseZod({ params: DomainParamsSchema })
  @ApiOperation({
    operationId: 'verifyOrganizationDomain',
    summary: 'Verify domain ownership via the DNS TXT challenge (OWNER); 409 with meta.host/meta.expected when unsatisfied',
  })
  @ApiParam(ORG_PARAM)
  @ApiParam(DOMAIN_PARAM)
  @ApiOkResponse({ description: 'Domain ACTIVE', schema: DomainDoc })
  @ApiNotFoundResponse({ description: 'Domain not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'DNS challenge not satisfied (DOMAIN_VERIFICATION_FAILED)', content: { 'application/problem+json': { schema: PROBLEM } } })
  verifyDomain(@Param('orgId') orgId: string, @Param('domainId') domainId: string) {
    return this.domains.verifyDomain(orgId, domainId);
  }

  @Delete(':domainId')
  @RequiresCapabilities('domain.manage')
  @Idempotent()
  @UseZod({ params: DomainParamsSchema })
  @ApiOperation({ operationId: 'deleteOrganizationDomain', summary: 'Remove a custom domain (OWNER)' })
  @ApiParam(ORG_PARAM)
  @ApiParam(DOMAIN_PARAM)
  @ApiOkResponse({ description: 'Removed', schema: { type: 'object', properties: { deleted: { type: 'boolean', example: true } } } })
  @ApiNotFoundResponse({ description: 'Domain not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  deleteDomain(@Param('orgId') orgId: string, @Param('domainId') domainId: string) {
    return this.domains.deleteDomain(orgId, domainId);
  }
}
