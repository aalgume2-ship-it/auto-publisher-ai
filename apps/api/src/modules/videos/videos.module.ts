import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module.js';
import { AiService } from '../ai/ai.service.js';
import { AssetStore } from './asset-store.js';
import { VideoComposer } from './compose.service.js';
import { GenerationService } from './generation.service.js';
import { PublishService } from './publish.service.js';
import { AutopilotService } from './autopilot.service.js';
import { VideosController } from './videos.controller.js';
import { MediaController } from './media.controller.js';
import { VideosService } from './videos.service.js';

@Module({
  imports: [ChannelsModule],
  controllers: [VideosController, MediaController],
  providers: [VideosService, GenerationService, PublishService, AutopilotService, VideoComposer, AssetStore, AiService],
  exports: [VideosService],
})
export class VideosModule {}
