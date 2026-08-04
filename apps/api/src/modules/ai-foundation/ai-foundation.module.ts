import { Module, Global } from '@nestjs/common';
import { ModelRegistryService } from './model-registry.service.js';
import { PromptIntelligenceService } from './prompt-intelligence.service.js';
import { StoryEngineService } from './story-engine.service.js';
import { MemoryService } from './memory.service.js';
import { PluginManagerService } from './plugin-manager.service.js';

@Global()
@Module({
  providers: [
    ModelRegistryService,
    PromptIntelligenceService,
    StoryEngineService,
    MemoryService,
    PluginManagerService
  ],
  exports: [
    ModelRegistryService,
    PromptIntelligenceService,
    StoryEngineService,
    MemoryService,
    PluginManagerService
  ]
})
export class AiFoundationModule {}
