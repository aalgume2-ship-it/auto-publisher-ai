/** SettingsController — org self-service integrations (AI keys, Google OAuth). */
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import {
  AiProviderParamsSchema,
  IntegrationsDoc,
  OrgParamsSchema,
  SaveAiKeyBodySchema,
  SaveGoogleOAuthBodySchema,
  SavedIntegrationDoc,
  VideoProviderParamsSchema,
} from './settings.dto.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@ApiUnauthorizedResponse({ description: 'Missing/invalid credentials', content: { 'application/problem+json': { schema: PROBLEM } } })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', content: { 'application/problem+json': { schema: PROBLEM } } })
@Controller({ path: 'organizations/:orgId/settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('integrations')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({
    operationId: 'getIntegrations',
    summary: 'Integration status: AI LLM providers + Google OAuth (masked hints only — secrets never leave the vault)',
  })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiOkResponse({ description: 'Integration status', schema: IntegrationsDoc })
  getIntegrations(@Param() params: { orgId: string }) {
    return this.settings.getIntegrations(params.orgId);
  }

  @Put('integrations/ai/:provider')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: AiProviderParamsSchema, body: SaveAiKeyBodySchema })
  @ApiOperation({
    operationId: 'saveAiKey',
    summary: 'Validate an AI provider key LIVE, then store it encrypted; the script stage uses it immediately',
    description: '400 when the provider itself rejects the key — invalid keys are never persisted.',
  })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiParam({ name: 'provider', enum: ['openai', 'groq', 'gemini', 'openrouter', 'pollinations'] })
  @ApiOkResponse({ description: 'Key validated + stored', schema: SavedIntegrationDoc })
  @ApiBadRequestResponse({ description: 'Provider rejected the key', content: { 'application/problem+json': { schema: PROBLEM } } })
  saveAiKey(@Param() params: { orgId: string; provider: string }, @Body() body: { apiKey: string }) {
    return this.settings.saveAiKey(params.orgId, params.provider, body.apiKey);
  }

  @Delete('integrations/ai/:provider')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: AiProviderParamsSchema })
  @ApiOperation({ operationId: 'deleteAiKey', summary: 'Remove a stored AI provider key (hard delete)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  deleteAiKey(@Param() params: { orgId: string; provider: string }) {
    return this.settings.deleteAiKey(params.orgId, params.provider);
  }

  @Put('integrations/video/:provider')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: VideoProviderParamsSchema, body: SaveAiKeyBodySchema })
  @ApiOperation({
    operationId: 'saveVideoKey',
    summary: 'Validate an AI VIDEO provider key (Runway / Luma / Kling-via-fal) WITHOUT spending a generation credit, then store it encrypted — enables moving-scene clips',
    description: 'Probe: bogus task id ⇒ 401/403 rejects the key; 200/404/422/429 proves it. 400 when the provider rejects.',
  })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiParam({ name: 'provider', enum: ['runway', 'luma', 'fal-kling'] })
  @ApiOkResponse({ description: 'Key validated + stored', schema: SavedIntegrationDoc })
  @ApiBadRequestResponse({ description: 'Provider rejected the key', content: { 'application/problem+json': { schema: PROBLEM } } })
  saveVideoKey(@Param() params: { orgId: string; provider: string }, @Body() body: { apiKey: string }) {
    return this.settings.saveVideoKey(params.orgId, params.provider, body.apiKey);
  }

  @Delete('integrations/video/:provider')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: VideoProviderParamsSchema })
  @ApiOperation({ operationId: 'deleteVideoKey', summary: 'Remove a stored video provider key (reverts the engine to stills)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  deleteVideoKey(@Param() params: { orgId: string; provider: string }) {
    return this.settings.deleteVideoKey(params.orgId, params.provider);
  }

  @Put('integrations/oauth/google')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: OrgParamsSchema, body: SaveGoogleOAuthBodySchema })
  @ApiOperation({
    operationId: 'saveGoogleOAuth',
    summary: 'Validate a Google OAuth client (id+secret) against Google live, then store it encrypted — enables YouTube linking for this org',
  })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiOkResponse({ description: 'Client validated + stored', schema: SavedIntegrationDoc })
  @ApiBadRequestResponse({ description: 'Google rejected the client pair', content: { 'application/problem+json': { schema: PROBLEM } } })
  saveGoogleOAuth(@Param() params: { orgId: string }, @Body() body: { clientId: string; clientSecret: string }) {
    return this.settings.saveGoogleOAuth(params.orgId, body.clientId, body.clientSecret);
  }

  @Delete('integrations/oauth/google')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'deleteGoogleOAuth', summary: 'Remove the stored Google OAuth client (YouTube linking falls back to env config)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  deleteGoogleOAuth(@Param() params: { orgId: string }) {
    return this.settings.deleteGoogleOAuth(params.orgId);
  }
}
