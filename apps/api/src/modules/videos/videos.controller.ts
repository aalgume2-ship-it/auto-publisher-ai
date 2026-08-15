/** VideosController — series, generation, streams, scheduling (thin rule). */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Req } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
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
import { AssetStore } from '@aca/video-engine';
import { AutopilotService, AutopilotBodySchema, type AutopilotBody } from './autopilot.service.js';
import { z } from 'zod';
import {
  AssetParamsSchema,
  CreateSeriesBody,
  GenerateVideoBody,
  OrgParamsSchema,
  PresignUploadBody,
  ConfirmS3Body,
  AssetDoc,
  AssetListQuerySchema,
  ScheduleBody,
  SeriesDoc,
  SeriesParamsSchema,
  TaskParamsSchema,
  UpdateAssetMetaBody,
  UpdateAssetMetaBodyDoc,
  UploadAssetBody,
  UploadAssetBodyDoc,
  VideoListQuerySchema,
  VideoParamsSchema,
} from './videos.dto.js';

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

  @Post('videos/:videoId/regenerate')
  @HttpCode(202)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: VideoParamsSchema })
  @ApiOperation({
    operationId: 'regenerateVideo',
    summary: 'Re-run the generation pipeline for an existing video (idempotent worker re-entry)',
    description: '409 while a run is in flight or after publish; 202 + jobId otherwise.',
  })
  @ApiAcceptedResponse({ description: 'Generation re-enqueued' })
  @ApiConflictResponse({ description: 'Already running or published', content: { 'application/problem+json': { schema: PROBLEM } } })
  regenerate(@Param() params: { orgId: string; videoId: string }) {
    return this.videos.regenerate(params.orgId, params.videoId);
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
    return this.sendFile(reply, storageKey, 'video/mp4', req.headers.range);
  }

  @Get('videos/:videoId/stream-chunk')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @ApiOperation({ operationId: 'streamVideoChunk', summary: 'Read a binary-safe Base64 chunk of the rendered MP4' })
  async streamChunk(
    @Param() params: { orgId: string; videoId: string },
    @Query('offset') offsetRaw?: string,
  ) {
    const { storageKey } = await this.videos.renditionFile(params.orgId, params.videoId);
    const buf = await this.store.read(storageKey);
    const chunkBytes = 512 * 1024;
    const requested = Number.parseInt(offsetRaw ?? '0', 10);
    const offset = Number.isFinite(requested) ? Math.max(0, Math.min(requested, buf.byteLength)) : 0;
    const end = Math.min(offset + chunkBytes, buf.byteLength);
    return {
      offset,
      nextOffset: end,
      totalBytes: buf.byteLength,
      done: end >= buf.byteLength,
      base64: buf.subarray(offset, end).toString('base64'),
    };
  }

  @Get('assets/:assetId/content')
  @TenantRequired()
  @UseZod({ params: AssetParamsSchema })
  @ApiOperation({ operationId: 'assetContent', summary: 'Serve a generated asset (image/audio/subtitle) with its real mime type' })
  async asset(@Param() params: { orgId: string; assetId: string }, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const file = await this.videos.assetFile(params.orgId, params.assetId);
    return this.sendFile(reply, file.storageKey, file.mimeType, req.headers.range);
  }

  @Get('assets')
  @TenantRequired()
  @RequiresCapabilities('asset.view')
  @UseZod({ params: OrgParamsSchema, query: AssetListQuerySchema })
  @ApiOperation({ operationId: 'listAssets', summary: 'List uploaded/generated assets of the workspace' })
  @ApiOkResponse({ description: 'Asset list', schema: { type: 'object', properties: { items: { type: 'array', items: AssetDoc } } } })
  listAssets(@Param() params: { orgId: string }, @Query() query: { kind?: 'IMAGE' | 'VIDEO_CLIP' | 'AUDIO' | 'BRAND' }) {
    return this.videos.listAssets(params.orgId, query);
  }

  @Post('uploads/presign')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('asset.upload')
  @UseZod({ params: OrgParamsSchema, body: PresignUploadBody })
  @ApiOperation({ operationId: 'presignUpload', summary: 'Presigned S3 PUT URL for direct browser upload (falls back to database tier when S3 is unconfigured)' })
  presignUpload(@Param() params: { orgId: string }, @Body() body: z.infer<typeof PresignUploadBody>) {
    return this.videos.presignUpload(params.orgId, body);
  }

  @Post('assets/confirm-s3')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('asset.upload')
  @UseZod({ params: OrgParamsSchema, body: ConfirmS3Body })
  @ApiOperation({ operationId: 'confirmS3Upload', summary: 'Create the asset row after a direct S3 PUT (presigned upload)' })
  confirmS3(@Param() params: { orgId: string }, @Body() body: z.infer<typeof ConfirmS3Body>) {
    return this.videos.confirmS3Upload(params.orgId, body);
  }

  @Post('assets/upload')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('asset.upload')
  @UseZod({ params: OrgParamsSchema, body: UploadAssetBody })
  @ApiOperation({ operationId: 'uploadAsset', summary: 'Upload an image / video / audio file into durable workspace storage' })
  @ApiCreatedResponse({ description: 'Asset stored', schema: AssetDoc })
  @ApiBody({ schema: UploadAssetBodyDoc })
  uploadAsset(@Param() params: { orgId: string }, @Body() body: UploadAssetBody) {
    return this.videos.uploadAsset(params.orgId, body);
  }

  @Patch('assets/:assetId')
  @TenantRequired()
  @RequiresCapabilities('asset.upload')
  @UseZod({ params: AssetParamsSchema, body: UpdateAssetMetaBody })
  @ApiOperation({ operationId: 'updateAssetMeta', summary: 'Update asset organization metadata such as folder and tags' })
  @ApiOkResponse({ description: 'Updated asset', schema: AssetDoc })
  @ApiBody({ schema: UpdateAssetMetaBodyDoc })
  updateAssetMeta(@Param() params: { orgId: string; assetId: string }, @Body() body: UpdateAssetMetaBody) {
    return this.videos.updateAssetMeta(params.orgId, params.assetId, body);
  }

  @Delete('assets/:assetId')
  @TenantRequired()
  @RequiresCapabilities('asset.delete')
  @UseZod({ params: AssetParamsSchema })
  @ApiOperation({ operationId: 'deleteAsset', summary: 'Delete an uploaded asset from the workspace library' })
  deleteAsset(@Param() params: { orgId: string; assetId: string }) {
    return this.videos.deleteAsset(params.orgId, params.assetId);
  }

  private async sendFile(reply: FastifyReply, storageKey: string, mime: string, range?: string): Promise<FastifyReply> {
    // AssetStore.read is disk-cache-first with a durable Postgres blob fallback,
    // so stream/content keep working after an ephemeral-disk wipe + cold boot.
    const buf = await this.store.read(storageKey);
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

  /* ------------------------------------------------- video operations ---- */

  @Post('videos/:videoId/upscale')
  @HttpCode(202)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: VideoParamsSchema })
  @ApiOperation({ operationId: 'upscaleVideo', summary: 'Upscale the READY rendition to 2160p (real ffmpeg render job → new rendition)' })
  upscale(@Param() params: { orgId: string; videoId: string }) {
    return this.videos.enqueueOperation(params.orgId, params.videoId, 'render', 'video.upscale', { operation: 'upscale' });
  }

  @Post('videos/:videoId/extend')
  @HttpCode(202)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: VideoParamsSchema })
  @ApiOperation({ operationId: 'extendVideo', summary: 'Extend the video (regenerate with a longer target duration)' })
  extend(@Param() params: { orgId: string; videoId: string }) {
    return this.videos.enqueueOperation(params.orgId, params.videoId, 'generation', 'video.extend', { operation: 'extend' });
  }

  @Post('videos/:videoId/remix')
  @HttpCode(202)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: VideoParamsSchema })
  @ApiOperation({ operationId: 'remixVideo', summary: 'Remix the video (regenerate with the same keyword, new seed)' })
  remix(@Param() params: { orgId: string; videoId: string }) {
    return this.videos.enqueueOperation(params.orgId, params.videoId, 'generation', 'video.remix', { operation: 'remix' });
  }

  @Post('videos/:videoId/thumbnail')
  @HttpCode(202)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: VideoParamsSchema })
  @ApiOperation({ operationId: 'generateThumbnail', summary: 'Extract a real thumbnail frame from the rendition (ffmpeg)' })
  thumbnail(@Param() params: { orgId: string; videoId: string }) {
    return this.videos.enqueueOperation(params.orgId, params.videoId, 'thumbnail', 'video.thumbnail', { operation: 'thumbnail' });
  }
}
