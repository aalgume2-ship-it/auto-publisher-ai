import { Test, TestingModule } from '@nestjs/testing';
import { CharacterEngineService } from '../../src/modules/character/character-engine.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CharacterEngineService (Unit) - Consistency', () => {
  let service: CharacterEngineService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CharacterEngineService],
    }).compile();

    service = module.get<CharacterEngineService>(CharacterEngineService);

    dbMock = {
      $transaction: vi.fn(async (cb) => cb(dbMock)),
      character: { create: vi.fn().mockResolvedValue({ id: 'char-1' }) },
      characterDNA: { 
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ identityLockStr: 'hash_QSBjeWJlcnB1bmsg' })
      },
    };
    (service as any).db = dbMock;
  });

  it('should generate deep feature hash and save DNA on creation', async () => {
    const res = await service.createCharacterIdentity('org-1', 'Nova', 'A cyberpunk girl');
    expect(dbMock.character.create).toHaveBeenCalled();
    expect(dbMock.characterDNA.create).toHaveBeenCalled();
  });

  it('should validate character consistency correctly', async () => {
    const isValid = await service.validateConsistency('char-1', 'hash_QSBjeWJlcnB1bmsg');
    expect(isValid).toBe(true);

    const isInvalid = await service.validateConsistency('char-1', 'hash_WRONG_HASH');
    expect(isInvalid).toBe(false);
  });
});
