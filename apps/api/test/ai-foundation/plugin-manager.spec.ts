import { Test, TestingModule } from '@nestjs/testing';
import { PluginManagerService } from '../../src/modules/ai-foundation/plugin-manager.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PluginManagerService (Unit)', () => {
  let service: PluginManagerService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PluginManagerService],
    }).compile();

    service = module.get<PluginManagerService>(PluginManagerService);

    dbMock = {
      pluginRegistry: { create: vi.fn().mockResolvedValue({ id: 'plugin-1' }) },
    };
    (service as any).db = dbMock;
  });

  it('should install a plugin and register it dynamically', async () => {
    const result = await service.installPlugin('CustomLipsync', '1.0', 'https://plugin.ext', 'VOICE_SYS');
    expect(dbMock.pluginRegistry.create).toHaveBeenCalled();
  });
});
