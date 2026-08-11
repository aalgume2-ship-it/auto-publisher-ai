/** ImagesController — real image generation endpoints. */
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { requestContext } from '../../common/context/request-context.js';
import { ImagesService } from './images.service.js';

const OrgParams = z.object({ orgId: z.string().uuid() });
const GenParams = z.object({ orgId: z.string().uuid(), imageId: z.string().uuid() });

export const CreateImageBody = z.object({
  prompt: z.string().min(3).max(1000),
  negativePrompt: z.string().max(500).optional(),
  style: z.string().max(120).optional(),
  aspectRatio: z.enum(['9:16', '16:9', '1:1', '4:5']).default('9:16'),
  resolution: z.enum(['512x512', '720x1280', '1024x1024', '1280x720', '1536x1024']).default('720x1280'),
  count: z.number().int().min(1).max(4).default(1),
});

@ApiTags('images')
@Controller({ path: 'organizations/:orgId', version: '1' })
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post('images')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('video.create')
  @UseZod({ params: OrgParams, body: CreateImageBody })
  @ApiOperation({ operationId: 'generateImages', summary: 'Generate real images (provider chain → worker → S3 → library). Poll GET images/:id until status=COMPLETED.' })
  generate(@Param() params: { orgId: string }, @Body() body: z.infer<typeof CreateImageBody>) {
    const ctx = requestContext();
    return this.images.start(params.orgId, body, ctx.userId);
  }

  @Get('images')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: OrgParams })
  @ApiOperation({ operationId: 'listImageGenerations', summary: 'List image generation jobs of the workspace' })
  list(@Param() params: { orgId: string }, @Query('status') status?: string) {
    return this.images.list(params.orgId, status);
  }

  @Get('images/:imageId')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: GenParams })
  @ApiOperation({ operationId: 'getImageGeneration', summary: 'Image generation detail with produced asset ids' })
  get(@Param() params: { orgId: string; imageId: string }) {
    return this.images.get(params.orgId, params.imageId);
  }
}
