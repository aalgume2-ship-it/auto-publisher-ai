/** DubbingController — dub a READY video into another language (real pipeline). */
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { requestContext } from '../../common/context/request-context.js';
import { DubbingApiService } from './dubbing.service.js';

const OrgParams = z.object({ orgId: z.string().uuid() });
const VideoParams = z.object({ orgId: z.string().uuid(), videoId: z.string().uuid() });
const JobParams = z.object({ orgId: z.string().uuid(), jobId: z.string().uuid() });

export const CreateDubBody = z.object({
  targetLanguage: z.string().min(2).max(8).default('en'),
  voiceId: z.string().uuid().optional(),
});

@ApiTags('dubbing')
@Controller({ path: 'organizations/:orgId', version: '1' })
export class DubbingController {
  constructor(private readonly dubbing: DubbingApiService) {}

  @Post('videos/:videoId/dub')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: VideoParams, body: CreateDubBody })
  @ApiOperation({ operationId: 'dubVideo', summary: 'Dub a READY video (translate + voice + re-render via worker). Poll GET dubs/:jobId.' })
  dub(@Param() params: { orgId: string; videoId: string }, @Body() body: z.infer<typeof CreateDubBody>) {
    const ctx = requestContext();
    return this.dubbing.start(params.orgId, params.videoId, body, ctx.userId);
  }

  @Get('dubs')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: OrgParams })
  @ApiOperation({ operationId: 'listDubbingJobs', summary: 'Dubbing jobs of the workspace' })
  list(@Param() params: { orgId: string }, @Query('status') status?: string) {
    return this.dubbing.list(params.orgId, status);
  }

  @Get('dubs/:jobId')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: JobParams })
  @ApiOperation({ operationId: 'getDubbingJob', summary: 'Dubbing job detail' })
  get(@Param() params: { orgId: string; jobId: string }) {
    return this.dubbing.get(params.orgId, params.jobId);
  }
}
