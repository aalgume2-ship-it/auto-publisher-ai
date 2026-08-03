/** VideosController — series, generation, streams, scheduling (thin rule). */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { requestContext } from '../../common/context/request-context.js';
import { VideosService } from './videos.service.js';
import { AssetStore } from './asset-store.js';
import { AutopilotService, AutopilotBodySchema, type AutopilotBody } from './autopilot.service.js';
import {
  AssetParamsSchema,
  CreateSeriesBody,
  CreateSeriesBodyDoc,
  GenerateVideoBody,
  GenerateVideoBodyDoc,
  OrgParamsSchema,
  ScheduleBody,
  ScheduleBodyDoc,
  SeriesDoc,
  SeriesParamsSchema,
  TaskParamsSchema,
  VideoListQuerySchema,
  VideoParamsSchema,
} from './videos.dto.js';
import { readFile } from 'node:fs/promises';

@ApiTags('videos')
@ApiUnauthorizedResponse({ description: 'Missing/invalid credentials', content: { 'application/problem+json': { schema: PROBLEM } } })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', content: { 'application/problem+json': { schema: PROBLEM } } })
@Controller({ path: 'organizations/:orgId', version: '1' })
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly store: AssetStore,
    private readonly autopilot: AutopilotService,
  ) {}

  /* ------------------------------------------------------------- autopilot */

  @Post('series/:seriesId/autopilot')
  @HttpCode(200)
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: SeriesParamsSchema, body: AutopilotBodySchema })
  @ApiOperation({
    operationId: 'setAutopilot',
    summary: 'Toggle the REAL autopilot for a series (keywords × posts/day, optional auto-publish to linked channels)',
  })
  setAutopilot(@Param() params: { orgId: string; seriesId: string }, @Body() body: AutopilotBody) {
    return this.autopilot.upsertConfig(params.orgId, params.seriesId, body);
  }

  @Get('series/:seriesId/autopilot')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: SeriesParamsSchema })
  @ApiOperation({ operationId: 'getAutopilot', summary: 'Autopilot config of a series' })
  getAutopilot(@Param() params: { orgId: string; seriesId: string }) {
    return this.autopilot.getConfig(params.orgId, params.seriesId);
  }

  /* --------------------------------------------------------------- series */

  @Post('series')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('project.create')
  @UseZod({ params: OrgParamsSchema, body: CreateSeriesBody })
  @ApiOperation({ operationId: 'createSeries', summary: 'Create a series (container for auto-generated shorts)' })
  @ApiCreatedResponse({ description: 'Series created', schema: SeriesDoc })
  createSeries(@Param() params: { orgId: string }, @Body() body: CreateSeriesBody) {
    return this.videos.createSeries(params.orgId, body);
  }

  @Get('series')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'listSeries', summary: 'List series of the org' })
  @ApiOkResponse({ description: 'Series list' })
  listSeries(@Param() params: { orgId: string }) {
    return this.videos.listSeries(params.orgId);
  }

  @Get('series/:seriesId')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: SeriesParamsSchema })
  @ApiOperation({ operationId: 'getSeries', summary: 'Series detail' })
  getSeries(@Param() params: { orgId: string; seriesId: string }) {
    return this.videos.getSeries(params.orgId, params.seriesId);
  }

  /* ---------------------------------------------------------------- videos */

  @Post('series/:seriesId/videos')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: SeriesParamsSchema, body: GenerateVideoBody })
  @ApiOperation({
    operationId: 'generateVideo',
    summary: 'Generate a real short end-to-end (script → voice → scenes → render)',
    description: 'Creates the video row and enqueues the generation worker. Poll GET videos/:id until status=READY.',
  })
  @ApiCreatedResponse({ description: 'Generation enqueued' })
  generate(@Param() params: { orgId: string; seriesId: string }, @Body() body: GenerateVideoBody) {
    const ctx = requestContext();
    return this.videos.startGeneration(params.orgId, params.seriesId, body, ctx.userId);
  }

  @Get('videos')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: OrgParamsSchema, query: VideoListQuerySchema })
  @ApiOperation({ operationId: 'listVideos', summary: 'List videos (filterable by series/status)' })
  listVideos(@Param() params: { orgId: string }, @Query() query: { seriesId?: string; status?: string }) {
    return this.videos.listVideos(params.orgId, query);
  }

  @Get('videos/:videoId')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: VideoParamsSchema })
  @ApiOperation({ operationId: 'getVideo', summary: 'Full video detail (script, scenes, renditions, posts)' })
  getVideo(@Param() params: { orgId: string; videoId: string }) {
    return this.videos.getVideo(params.orgId, params.videoId);
  }

  /** Browser <video> source — HTTP Range aware so seeking works. */
  @Get('videos/:videoId/stream')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: VideoParamsSchema })
  @ApiOperation({ operationId: 'streamVideo', summary: 'Stream the rendered MP4 (Range-aware)' })
  async stream(@Param() params: { orgId: string; videoId: string }, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const { storageKey } = await this.videos.renditionFile(params.orgId, params.videoId);
    return this.sendFile(reply, this.store.fullPath(storageKey), 'video/mp4', req.headers.range);
  }

  @Get('assets/:assetId/content')
  @TenantRequired()
  @UseZod({ params: AssetParamsSchema })
  @ApiOperation({ operationId: 'assetContent', summary: 'Serve a generated asset (image/audio/subtitle) with its real mime type' })
  async asset(@Param() params: { orgId: string; assetId: string }, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const file = await this.videos.assetFile(params.orgId, params.assetId);
    return this.sendFile(reply, this.store.fullPath(file.storageKey), file.mimeType, req.headers.range);
  }

  private async sendFile(reply: FastifyReply, path: string, mime: string, range?: string): Promise<FastifyReply> {
    const buf = await readFile(path);
    const m = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
      if (start < buf.byteLength && end >= start) {
        return reply
          .status(206)
          .headers({ 'content-type': mime, 'content-range': `bytes ${start}-${end}/${buf.byteLength}`, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' })
          .send(buf.subarray(start, end + 1));
      }
    }
    return reply
      .headers({ 'content-type': mime, 'content-length': String(buf.byteLength), 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' })
      .send(buf);
  }

  /* ------------------------------------------------------------ scheduling */

  @Post('videos/:videoId/schedule')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('publish.execute')
  @UseZod({ params: VideoParamsSchema, body: ScheduleBody })
  @ApiOperation({
    operationId: 'scheduleVideo',
    summary: 'Schedule (or immediately start) YouTube publishing of a READY video',
    description: '409 CONFLICT until the video reaches READY; 201 returns the publishing task.',
  })
  @ApiCreatedResponse({ description: 'Publishing task created' })
  @ApiConflictResponse({ description: 'Video not READY yet', content: { 'application/problem+json': { schema: PROBLEM } } })
  schedule(@Param() params: { orgId: string; videoId: string }, @Body() body: ScheduleBody) {
    return this.videos.schedule(params.orgId, params.videoId, body);
  }

  @Get('posts')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: OrgParamsSchema })
  @ApiOperation({ operationId: 'listPosts', summary: 'Publishing tasks (scheduled, uploading, published, failed)' })
  listPosts(@Param() params: { orgId: string }) {
    return this.videos.listPosts(params.orgId);
  }

  @Delete('posts/:taskId')
  @TenantRequired()
  @RequiresCapabilities('publish.execute')
  @UseZod({ params: TaskParamsSchema })
  @ApiOperation({ operationId: 'cancelPost', summary: 'Cancel a not-yet-published task' })
  @ApiBadRequestResponse({ description: 'Already published', content: { 'application/problem+json': { schema: PROBLEM } } })
  cancelPost(@Param() params: { orgId: string; taskId: string }) {
    return this.videos.cancelPost(params.orgId, params.taskId);
  }
}
