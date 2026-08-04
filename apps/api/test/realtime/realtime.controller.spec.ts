import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeController } from '../../src/modules/realtime/realtime.controller.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { take, toArray } from 'rxjs/operators';
import { lastValueFrom } from 'rxjs';

describe('RealtimeController (Unit)', () => {
  let controller: RealtimeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RealtimeController],
    }).compile();

    controller = module.get<RealtimeController>(RealtimeController);
  });

  it('should return error if DB is mocked to be disconnected in unit test', async () => {
    const stream$ = controller.streamPipelineStatus('run-123');
    const firstEvent = await lastValueFrom(stream$.pipe(take(1)));
    
    expect(firstEvent.data.error).toBeDefined();
  });
});
