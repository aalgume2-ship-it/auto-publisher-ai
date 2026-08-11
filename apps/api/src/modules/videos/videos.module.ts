import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module.js';
import { AssetStore } from '@aca/video-engine';
import { API_CONFIG } from '../../common/redis.provider.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { GenerationService } from './generation.service.js';
import { AutopilotService } from './autopilot.service.js';
import { VideosController } from './videos.controller.js';
import { MediaController } from './media.controller.js';
import { VideosService } from './videos.service.js';

@Module({
  imports: [ChannelsModule],
  controllers: [VideosController, MediaController],
  providers: [
    VideosService,
    GenerationService,
    AutopilotService,
    {
      provide: AssetStore,
      useFactory: (config: unknown, prisma: unknown) => new AssetStore(config as never, prisma as never),
      inject: [API_CONFIG, PRISMA],
    },
  ],
  exports: [VideosService],
})
export class VideosModule {}
