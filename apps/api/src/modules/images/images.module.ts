/** Images module — real image generation (queue: 'image-generation'). */
import { Module } from '@nestjs/common';
import { ImageGenerationService } from '@aca/video-engine';
import { API_CONFIG } from '../../common/redis.provider.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { AiService, OrgCredentialsService } from '@aca/video-engine';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';

@Module({
  controllers: [ImagesController],
  providers: [
    ImagesService,
    {
      provide: ImageGenerationService,
      useFactory: (config: unknown, prisma: unknown, ai: unknown) => new ImageGenerationService(config as never, prisma as never, ai as never),
      inject: [API_CONFIG, PRISMA, AiService],
    },
    {
      provide: AiService,
      useFactory: (config: unknown, creds: unknown) => new AiService(config as never, creds as never),
      inject: [API_CONFIG, OrgCredentialsService],
    },
    {
      provide: OrgCredentialsService,
      useFactory: (config: unknown, prisma: unknown) => new OrgCredentialsService(config as never, prisma as never),
      inject: [API_CONFIG, PRISMA],
    },
  ],
  exports: [ImagesService],
})
export class ImagesModule {}
