// @ts-nocheck
// @ts-nocheck
import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { DbClient } from '@aca/database';
import { PromptCompilerService } from '../ai-foundation/prompt-compiler.service.js';

@Injectable()
export class SmartVideoCreatorService {
  private readonly logger = new Logger(SmartVideoCreatorService.name);
  private db = {} as DbClient;

  constructor(@Inject(PromptCompilerService) private readonly promptCompiler: PromptCompilerService) {
    const { PrismaClient } = require('@prisma/client');
    this.db = new PrismaClient();
  }

  /**
   * Transforms raw brand assets into a structured ACE render graph.
   * "Make me a 30s video" -> Full Pipeline Execution.
   */
  async generateFromAssets(brandKitId: string, ruleId: string) {
    this.logger.log(`Smart Video Creator initiated for BrandKit ${brandKitId}`);

    const brand = await this.db.brandKit.findUnique({
      where: { id: brandKitId },
      include: { brandAssets: { where: { status: 'READY' } } }
    });

    if (!brand || brand.brandAssets.length === 0) {
      throw new NotFoundException('Brand Kit missing or has no processed assets.');
    }

    // 1. Asset Selection & Deduplication Logic
    // Select assets that haven't been over-used recently
    const selectedAssets = brand.brandAssets
      .sort((a, b) => a.usageCount - b.usageCount)
      .slice(0, 5); // Pick 5 least used assets

    // 2. Decide Hook and Camera Motion
    const hookTypes = ['Question', 'Statistic', 'Action'];
    const selectedHook = hookTypes[Math.floor(Math.random() * hookTypes.length)];

    // 3. Compile intent via AI Foundation
    const intent = `Create a ${brand.toneOfVoice || 'professional'} video about our products. Use a ${selectedHook} hook.`;
    const compiledGraph = await this.promptCompiler.compile(intent);

    // 4. Register usage to prevent repetition
    for (const asset of selectedAssets) {
      await this.db.brandAsset.update({
        where: { id: asset.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() }
      });
    }

    // 5. Generate Copywriting
    const copy = {
      title: `Why you need ${selectedAssets[0].subject} today!`,
      description: `Experience the best ${brand.name} has to offer. #brand #product`,
      hashtags: ['#brand', '#product', '#trending'],
      cta: 'Link in bio!'
    };

    // 6. Record generated content
    const content = await this.db.brandGeneratedContent.create({
      data: {
        id: crypto.randomUUID(),
        ruleId,
        videoId: crypto.randomUUID(), // Simulated output video ID
        assetsUsed: selectedAssets.map(a => a.id),
        hookType: selectedHook,
        copywritingData: copy
      }
    });

    return { content, graph: compiledGraph };
  }
}
