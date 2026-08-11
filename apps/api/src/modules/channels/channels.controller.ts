/** ChannelsController — org channel management + YouTube & TikTok OAuth endpoints. */
import { Controller, Delete, Get, HttpCode, Param, Post, Query, Redirect } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { Public } from '../../common/auth/auth.guard.js';
import { PROBLEM } from '../../common/http/problem-details.openapi.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { requestContext } from '../../common/context/request-context.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ChannelListDoc, ChannelParamsSchema, OauthCallbackQuerySchema, OrgParamsSchema, YoutubeLinkDoc } from './channels.dto.js';
import { ChannelsService } from './channels.service.js';

@ApiTags('channels')
@ApiUnauthorizedResponse({ description: 'Missing/invalid credentials', content: { 'application/problem+json': { schema: PROBLEM } } })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', content: { 'application/problem+json': { schema: PROBLEM } } })
@Controller({ path: '', version: '1' })
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get('organizations/:orgId/channels')
  @TenantRequired()
  @RequiresCapabilities('channel.view')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'listChannels', summary: 'List linked channels (tokens never leave the vault)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiOkResponse({ description: 'Linked channels', schema: ChannelListDoc })
  list(@Param() params: { orgId: string }) {
    return this.channels.list(params.orgId);
  }

  @Post('organizations/:orgId/channels/youtube/link')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('channel.connect')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({
    operationId: 'startYoutubeLink',
    summary: 'Start YouTube OAuth linking — returns the Google consent URL',
    description: '503 until GOOGLE_CLIENT_ID/SECRET are provisioned on the API (exact keys named in the error detail).',
  })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Google consent URL', schema: YoutubeLinkDoc })
  @ApiServiceUnavailableResponse({ description: 'OAuth client not configured', content: { 'application/problem+json': { schema: PROBLEM } } })
  startYoutubeLink(@Param() params: { orgId: string }) {
    const ctx = requestContext();
    return this.channels.startYoutubeLink(params.orgId, ctx.userId ?? '');
  }

  @Post('organizations/:orgId/channels/tiktok/link')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('channel.connect')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({
    operationId: 'startTikTokLink',
    summary: 'Start TikTok OAuth linking — returns the TikTok consent URL (PKCE)',
    description: '503 until TIKTOK_CLIENT_KEY/SECRET are provisioned on the API (exact keys named in the error detail).',
  })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'TikTok consent URL', schema: YoutubeLinkDoc })
  @ApiServiceUnavailableResponse({ description: 'OAuth client not configured', content: { 'application/problem+json': { schema: PROBLEM } } })
  startTikTokLink(@Param() params: { orgId: string }) {
    const ctx = requestContext();
    return this.channels.startTikTokLink(params.orgId, ctx.userId ?? '');
  }

  /** Public by necessity: Google redirects the BROWSER here (state carries the org/user binding, HMAC-signed). */
  @Get('channels/oauth/youtube/callback')
  @Public()
  @UseZod({ query: OauthCallbackQuerySchema })
  @ApiOperation({ operationId: 'youtubeOauthCallback', summary: 'YouTube OAuth redirect target — stores the encrypted credential, redirects back to the web app' })
  @ApiOkResponse({ description: 'Redirect to the web app dashboard' })
  @ApiBadRequestResponse({ description: 'Invalid code/state', content: { 'application/problem+json': { schema: PROBLEM } } })
  @Redirect()
  async youtubeCallback(@Query() query: { code?: string; state?: string; error?: string }) {
    if (query.error) {
      throw new ApiError('FORBIDDEN', 'Google consent denied', { detail: `google returned error=${query.error} — grant the youtube scopes to link` });
    }
    const { redirectTo } = await this.channels.completeYoutubeCallback(query.code, query.state);
    return { url: redirectTo };
  }

  @Get('channels/oauth/tiktok/callback')
  @Public()
  @UseZod({ query: OauthCallbackQuerySchema })
  @ApiOperation({ operationId: 'tiktokOauthCallback', summary: 'TikTok OAuth redirect target — stores the encrypted credential, redirects back to the web app' })
  @ApiOkResponse({ description: 'Redirect to the web app dashboard' })
  @ApiBadRequestResponse({ description: 'Invalid code/state', content: { 'application/problem+json': { schema: PROBLEM } } })
  @Redirect()
  async tiktokCallback(@Query() query: { code?: string; state?: string; error?: string }) {
    if (query.error) {
      throw new ApiError('FORBIDDEN', 'TikTok consent denied', { detail: `tiktok returned error=${query.error} — grant the video scopes to link` });
    }
    const { redirectTo } = await this.channels.completeTikTokCallback(query.code, query.state);
    return { url: redirectTo };
  }

  @Delete('organizations/:orgId/channels/:channelId')
  @HttpCode(200)
  @TenantRequired()
  @RequiresCapabilities('channel.disconnect')
  @UseZod({ params: ChannelParamsSchema })
  @ApiOperation({ operationId: 'disconnectChannel', summary: 'Disconnect a channel (revokes platform grant best-effort, deletes the vaulted credential)' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiParam({ name: 'channelId', format: 'uuid' })
  @ApiOkResponse({ description: 'Disconnected', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  @ApiResponse({ status: 404, description: 'Channel not found', content: { 'application/problem+json': { schema: PROBLEM } } })
  disconnect(@Param() params: { orgId: string; channelId: string }) {
    return this.channels.disconnect(params.orgId, params.channelId);
  }
}
