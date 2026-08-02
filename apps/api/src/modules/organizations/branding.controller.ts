/**
 * BrandingController — white-label tenant routes (API.md §5).
 * BrandingResolveController — the PUBLIC portal resolver (separate base path,
 * @Public + dedicated rate-limit bucket; exposes brand-safe fields only).
 */
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.guard.js';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { OrgParamsSchema } from './organizations.dto.js';
import { BrandDoc, BrandingResolveDoc, BrandingResolveQuery, PutBrandBody, PutBrandBodyDoc } from './branding.dto.js';
import { BrandingService } from './branding.service.js';

const PROBLEM = { $ref: '#/components/schemas/ProblemDetails' };
const ORG_PARAM = { name: 'orgId' as const, format: 'uuid' };

@ApiTags('branding')
@Controller({ path: 'organizations/:orgId/brand', version: '1' })
@TenantRequired()
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'getOrganizationBrand', summary: 'Brand config (falls back to platform defaults)' })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Brand config', schema: BrandDoc })
  getBrand(@Param('orgId') orgId: string) {
    return this.branding.getBrand(orgId);
  }

  @Put()
  @RequiresCapabilities('brand.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: PutBrandBody })
  @ApiOperation({
    operationId: 'putOrganizationBrand',
    summary: 'Upsert brand config (brand.manage); hidePoweredBy=true requires the whiteLabel plan feature',
  })
  @ApiParam(ORG_PARAM)
  @ApiBody({ schema: PutBrandBodyDoc })
  @ApiOkResponse({ description: 'Upserted brand config', schema: BrandDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing brand.manage or plan lacks whiteLabel (hidePoweredBy)', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiNotFoundResponse({ description: 'Referenced logo/favicon asset not in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  putBrand(@Param('orgId') orgId: string, @Body() body: PutBrandBody) {
    return this.branding.putBrand(orgId, body);
  }

  @Post('reset')
  @HttpCode(200)
  @RequiresCapabilities('brand.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'resetOrganizationBrand', summary: 'Revert brand to platform defaults (brand.manage)' })
  @ApiParam(ORG_PARAM)
  @ApiOkResponse({ description: 'Platform defaults', schema: BrandDoc })
  @ApiForbiddenResponse({ description: 'Missing brand.manage capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  resetBrand(@Param('orgId') orgId: string) {
    return this.branding.resetBrand(orgId);
  }
}

@ApiTags('branding')
@Controller({ path: 'branding', version: '1' })
export class BrandingResolveController {
  constructor(private readonly branding: BrandingService) {}

  @Get('resolve')
  @Public()
  @RateLimit('brandingResolve')
  @UseZod({ query: BrandingResolveQuery })
  @ApiOperation({
    operationId: 'resolveBranding',
    summary: 'PUBLIC: resolve brand by custom-domain host (used by the portal runtime at request time)',
  })
  @ApiQuery({ name: 'host', required: true, type: 'string', example: 'portal.noor.example' })
  @ApiOkResponse({ description: 'Resolved brand + org slug + default locale', schema: BrandingResolveDoc })
  @ApiNotFoundResponse({ description: 'No ACTIVE PORTAL domain for this host', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiTooManyRequestsResponse({ description: 'Public bucket exhausted', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiBadRequestResponse({ description: 'host query missing/invalid', content: { 'application/problem+json': { schema: PROBLEM } } })
  resolve(@Query('host') host: string) {
    return this.branding.resolveByHost(host);
  }
}
