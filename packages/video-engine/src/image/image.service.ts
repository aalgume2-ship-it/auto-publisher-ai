/**
 * ImageGenerationService — the REAL image-generation pipeline (queue:
 * 'image-generation'). Creates the ImageGeneration row, calls the provider
 * chain (stability → openai → replicate → pollinations keyless), stores
 * every image via AssetStore (S3 or Postgres blobs) and records Asset rows
 * in the org library. Idempotent: re-entry after partial failure wipes
 * partial children first.
 */
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { type AiService, type ImageGenRequest } from '../ai/ai.service.js';
import { type AssetStore } from '../media/asset-store.js';
import { PipelineError } from '../errors.js';

export type ImageGenStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export class ImageGenerationService {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: DbClient,
    private readonly ai: AiService,
    private readonly store: AssetStore | null = null,
  ) {}

  /** Create the ImageGeneration row (API side). */
  async create(orgId: string, req: ImageGenRequest & { count: number }, createdById: string | null) {
    const count = Math.min(Math.max(1, req.count ?? 1), 4);
    return this.prisma.imageGeneration.create({
      data: {
        id: generateId(),
        orgId,
        prompt: req.prompt,
        negativePrompt: req.negativePrompt ?? null,
        style: req.style ?? null,
        aspectRatio: req.aspectRatio ?? '9:16',
        resolution: req.resolution ?? '720x1280',
        count,
        status: 'QUEUED',
        createdById: createdById ?? null,
      },
    });
  }

  /** Process a generation job (worker side). Returns the image asset ids. */
  async process(genId: string, attempt = 1): Promise<string[]> {
    if (!this.store) throw new Error('ImageGenerationService requires an AssetStore (worker)');
    const gen = await this.prisma.imageGeneration.findUnique({ where: { id: genId } });
    if (!gen) throw new PipelineError('NOT_FOUND', 'Image generation not found', { detail: `image generation ${genId}` });
    if (gen.status === 'COMPLETED') return gen.assetIds as string[]; // idempotent re-entry

    const t0 = Date.now();
    await this.prisma.imageGeneration.update({ where: { id: genId }, data: { status: 'PROCESSING', failureReason: null } });
    try {
      // wipe partial children for idempotent retries
      await this.prisma.asset.deleteMany({
        where: { orgId: gen.orgId, metadata: { path: ['imageGenerationId'], equals: genId } },
      });
      const assetIds: string[] = [];
      for (let i = 0; i < gen.count; i += 1) {
        const seedSuffix = gen.count > 1 ? ` (variation ${i + 1})` : '';
        const req: ImageGenRequest = {
          prompt: gen.prompt + seedSuffix,
          negativePrompt: gen.negativePrompt ?? undefined,
          style: gen.style ?? undefined,
          aspectRatio: (gen.aspectRatio ?? '9:16') as ImageGenRequest['aspectRatio'],
          resolution: (gen.resolution ?? '720x1280') as ImageGenRequest['resolution'],
        };
        const img = await this.ai.generateImage(req, gen.orgId);
        const stored = await this.store.put(gen.orgId, `image-${i + 1}.${img.mime.includes('png') ? 'png' : 'jpg'}`, img.data);
        const asset = await this.prisma.asset.create({
          data: {
            id: generateId(),
            orgId: gen.orgId,
            type: 'IMAGE',
            source: 'GENERATED',
            storageKey: stored.storageKey,
            cdnPath: `/v1/organizations/${gen.orgId}/assets/pending`,
            mimeType: img.mime,
            bytes: BigInt(stored.bytes),
            width: img.width,
            height: img.height,
            metadata: {
              prompt: gen.prompt,
              style: gen.style,
              aspectRatio: gen.aspectRatio,
              provider: img.provider,
              imageGenerationId: genId,
              variant: i + 1,
              wallMs: Date.now() - t0,
            },
          },
        });
        await this.prisma.asset.update({ where: { id: asset.id }, data: { cdnPath: `/v1/organizations/${gen.orgId}/assets/${asset.id}/content` } });
        assetIds.push(asset.id);
      }
      await this.prisma.imageGeneration.update({
        where: { id: genId },
        data: { status: 'COMPLETED', assetIds, failureReason: null, finishedAt: new Date() },
      });
      return assetIds;
    } catch (err) {
      const e = PipelineError.from(err);
      const terminal = e.terminal || attempt >= 3;
      await this.prisma.imageGeneration.update({
        where: { id: genId },
        data: { status: terminal ? 'FAILED' : 'QUEUED', failureReason: terminal ? (e.detail ?? e.message).slice(0, 480) : `Retrying — attempt ${attempt}/3` },
      });
      throw e;
    }
  }
}
