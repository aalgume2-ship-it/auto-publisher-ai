import { Test, TestingModule } from '@nestjs/testing';
import { GpuClusterService } from '../../src/modules/gpu-cluster/gpu-cluster.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('GpuClusterService (Unit)', () => {
  let service: GpuClusterService;
  let queryRawMock: any;
  let createMock: any;
  let updateMock: any;

  beforeEach(async () => {
    queryRawMock = vi.fn();
    createMock = vi.fn();
    updateMock = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GpuClusterService],
    }).compile();

    service = module.get<GpuClusterService>(GpuClusterService);
    
    // Inject mocks
    (service as any).db = {
      $queryRaw: queryRawMock,
      gPUInstance: {
        create: createMock,
        update: updateMock,
      }
    };
  });

  describe('assignJobToNode', () => {
    it('should assign job if a node is available', async () => {
      queryRawMock.mockResolvedValue([{ id: 'node-1' }]);

      const result = await service.assignJobToNode('job-123', 'a100-80gb');
      
      expect(result).toBe('node-1');
      expect(queryRawMock).toHaveBeenCalled();
    });

    it('should return null if no nodes are available', async () => {
      queryRawMock.mockResolvedValue([]);

      const result = await service.assignJobToNode('job-123');
      
      expect(result).toBeNull();
    });
  });

  describe('registerNode', () => {
    it('should create a new GPU instance record', async () => {
      createMock.mockResolvedValue({ id: 'new-node', status: 'IDLE' });

      const result = await service.registerNode('cluster-1', 'rtx-4090', '192.168.1.100');
      
      expect(result.id).toBe('new-node');
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          clusterId: 'cluster-1',
          instanceType: 'rtx-4090',
          ipAddress: '192.168.1.100',
          status: 'IDLE'
        })
      }));
    });
  });

  describe('releaseNode', () => {
    it('should set node status back to IDLE', async () => {
      updateMock.mockResolvedValue({ id: 'node-1', status: 'IDLE' });

      await service.releaseNode('node-1');

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'node-1' },
        data: expect.objectContaining({
          status: 'IDLE',
          currentJobId: null
        })
      });
    });
  });
});
