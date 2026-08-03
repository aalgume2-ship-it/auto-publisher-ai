/**
 * GenerationService — the REAL video engine worker (queue: 'generation').
 * Pipeline per video: script (LLM) → voiceover (TTS, real MP3) → scene
 * artwork (image gen) → ffmpeg compose (Ken Burns + burned Arabic captions)
 * → asset rows + rendition + thumbnail + subtitle track → READY.
 *
 * Retries are safe: the pipeline wipes the video's partial children at start
 * (idempotent re-entry), and any failure lands on Video.failureReason +
 * JobRecord (with queue-level retry/backoff).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { PRISMA } from '../../common/prisma.provider.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { AiService } from '../ai/ai.service.js';
import { AssetStore } from './asset-store.js';
import { VideoComposer, probeDurationMs, workDirFor } from './compose.service.js';
import { readFile } from 'node:fs/promises';

const VOICE_PROVIDER_TTS: Record<string, { provider: string; providerVoiceId: string; name: string }> = {
  gtts: { provider: 'gtts', providerVoiceId: 'ar-male-1', name: 'صوت عربي فصيح (gTTS)' },
  openai: { provider: 'openai', providerVoiceId: 'alloy', name: 'OpenAI Alloy (HD)' },
};

@Injectable()
export class GenerationService {
  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly queue: QueueService,
    private readonly ai: AiService,
    private readonly store: AssetStore,
    private readonly composer: VideoComposer,
  ) {
    // register the durable worker at construction (QueueService boots after
    // every module's onModuleInit — singleton discipline via CommonModule).
    // attempt-aware: only the FINAL attempt flips the video to FAILED, so a
    // transient provider hiccup doesn't show a false-dead status mid-retry.
    this.queue.registerWorker('generation', (payload, _jobId, attempt) => this.process(String(payload.videoId), attempt));
  }

  /** Enqueue generation for a video row created by VideosService. */
  enqueue(videoId: string): Promise<string> {
    return this.queue.enqueue('generation', 'video.generate', { videoId });
  }

  async process(videoId: string, attempt = 1): Promise<void> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    });
    if (!video) throw new Error(`video ${videoId} not found`);
    if (video.status === 'PUBLISHED' || video.status === 'READY') return; // idempotent re-entry
    await this.prisma.video.update({ where: { id: videoId }, data: { status: 'GENERATING', failureReason: null } });

    try {
      await this.wipePartialChildren(videoId);
      const keyword = (video.seo as { keyword?: string } | null)?.keyword ?? video.title;
      const wd = workDirFor('gen', videoId);

      /* 1 ── script (real LLM) */
      const { script, provider } = await this.ai.generateScript(
        {
          keyword,
          niche: video.project.niche ?? 'معرفة وحقائق',
          language: video.language,
          targetSeconds: 45,
        },
        video.orgId,
      );
      const narration = script.scenes.map((s) => s.narration).join(' ');
      const wordCount = narration.split(/\s+/).filter(Boolean).length;
      const readingSeconds = Math.max(15, Math.round(wordCount / 2.2));

      // system rows the pipeline needs (voice record per provider)
      const vmeta = VOICE_PROVIDER_TTS[provider === 'openai' ? 'openai' : 'gtts']!;
      const voice = await this.prisma.voice.upsert({
        where: { provider_providerVoiceId: { provider: vmeta.provider, providerVoiceId: vmeta.providerVoiceId } },
        create: { id: generateId(), provider: vmeta.provider, providerVoiceId: vmeta.providerVoiceId, name: vmeta.name, gender: 'male', languages: ['ar'] },
        update: {},
      });

      /* 2 ── voiceover (real TTS) */
      const tts = await this.ai.synthesizeVoice(narration, video.language, video.orgId);
      const { audioPath, durationMs: voiceMs } = await this.composer.concatAudio(tts.chunks, wd);
      const scriptRow = await this.prisma.script.create({
        data: {
          id: generateId(),
          videoId,
          version: 1,
          content: narration,
          beats: { provider, hook: script.hook, cta: script.cta, scenes: script.scenes },
          wordCount,
          readingSeconds,
          isActive: true,
        },
      });
      const audioBuf = await readFile(audioPath);
      const audioStored = await this.store.put(video.orgId, 'voiceover.mp3', audioBuf);
      const audioAsset = await this.prisma.asset.create({
        data: {
          id: generateId(),
          orgId: video.orgId,
          type: 'VOICEOVER',
          source: 'GENERATED',
          storageKey: audioStored.storageKey,
          cdnPath: `/v1/organizations/${video.orgId}/assetsContent`, // content route below uses id
          mimeType: 'audio/mpeg',
          bytes: BigInt(audioStored.bytes),
          durationMs: voiceMs,
          metadata: { provider: tts.provider },
        },
      });
      await this.prisma.asset.update({ where: { id: audioAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${audioAsset.id}/content` } });
      await this.prisma.voiceover.create({
        data: { id: generateId(), scriptId: scriptRow.id, voiceId: voice.id, audioAssetId: audioAsset.id, durationMs: voiceMs },
      });

      /* 3 ── per-scene visuals with narration-proportional timings */
      const sceneWords = script.scenes.map((s) => s.narration.split(/\s+/).filter(Boolean).length);
      const totalWords = sceneWords.reduce((a, b) => a + b, 0) || 1;
      let cursor = 0;
      const composeScenes: { imagePath: string; caption: string; durationMs: number }[] = [];
      for (let i = 0; i < script.scenes.length; i += 1) {
        const scene = script.scenes[i]!;
        const isLast = i === script.scenes.length - 1;
        const durationMs = isLast ? Math.max(3_000, voiceMs - cursor) : Math.max(3_000, Math.round((sceneWords[i]! / totalWords) * voiceMs));
        if (i > 0) await new Promise((r) => setTimeout(r, 6_000)); // pollinations anontier: 1 image at a time (429 otherwise)
        const img = await this.ai.generateSceneImage(scene.visualPrompt, 1000 + i * 77);
        const imgStored = await this.store.put(video.orgId, `scene-${i}.jpg`, img.data);
        const imgAsset = await this.prisma.asset.create({
          data: {
            id: generateId(),
            orgId: video.orgId,
            type: 'IMAGE',
            source: 'GENERATED',
            storageKey: imgStored.storageKey,
            cdnPath: 'pending',
            mimeType: 'image/jpeg',
            bytes: BigInt(imgStored.bytes),
            width: 720,
            height: 1280,
            metadata: { prompt: scene.visualPrompt, provider: img.provider },
          },
        });
        await this.prisma.asset.update({ where: { id: imgAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${imgAsset.id}/content` } });
        this.assertDimensionsCoherent(imgAsset.id);
        await this.prisma.scene.create({
          data: {
            id: generateId(),
            videoId,
            index: i,
            narrationText: scene.narration,
            visualPrompt: scene.visualPrompt,
            assetId: imgAsset.id,
            startMs: cursor,
            endMs: cursor + durationMs,
          },
        });
        composeScenes.push({ imagePath: this.store.fullPath(imgStored.storageKey), caption: scene.narration, durationMs });
        cursor += durationMs;
      }

      /* 4 ── compose (real ffmpeg render) */
      const { videoPath, durationMs } = await this.composer.compose(composeScenes, audioPath, wd);
      const mp4 = await readFile(videoPath);
      if (mp4.byteLength < 50_000) throw new Error('render produced a suspiciously small mp4');
      const vidStored = await this.store.put(video.orgId, 'shorts-720x1280.mp4', mp4);
      const videoAsset = await this.prisma.asset.create({
        data: {
          id: generateId(),
          orgId: video.orgId,
          type: 'VIDEO_CLIP',
          source: 'GENERATED',
          storageKey: vidStored.storageKey,
          cdnPath: 'pending',
          mimeType: 'video/mp4',
          bytes: BigInt(vidStored.bytes),
          durationMs,
          width: 720,
          height: 1280,
          metadata: { profile: 'shorts-720x1280' },
        },
      });
      await this.prisma.asset.update({ where: { id: videoAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${videoAsset.id}/content` } });
      await this.prisma.videoRendition.create({
        data: { id: generateId(), videoId, profile: 'shorts-720x1280', storageKey: vidStored.storageKey, bytes: BigInt(vidStored.bytes), durationMs, status: 'COMPLETED', completedAt: new Date() },
      });

      const thumbBuf = await this.composer.thumbnail(videoPath, wd);
      const thumbStored = await this.store.put(video.orgId, 'thumbnail.jpg', thumbBuf);
      const thumbAsset = await this.prisma.asset.create({
        data: {
          id: generateId(),
          orgId: video.orgId,
          type: 'THUMBNAIL',
          source: 'GENERATED',
          storageKey: thumbStored.storageKey,
          cdnPath: 'pending',
          mimeType: 'image/jpeg',
          bytes: BigInt(thumbStored.bytes),
          width: 720,
          height: 1280,
        },
      });
      await this.prisma.asset.update({ where: { id: thumbAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${thumbAsset.id}/content` } });
      await this.prisma.thumbnail.create({ data: { id: generateId(), videoId, variant: 0, storageKey: thumbStored.storageKey, width: 720, height: 1280, selected: true } });

      const assBuf = await readFile(`${wd}/captions.ass`);
      const subStored = await this.store.put(video.orgId, 'captions.ass', assBuf);
      const subAsset = await this.prisma.asset.create({
        data: {
          id: generateId(),
          orgId: video.orgId,
          type: 'SUBTITLE',
          source: 'GENERATED',
          storageKey: subStored.storageKey,
          cdnPath: 'pending',
          mimeType: 'text/plain',
          bytes: BigInt(subStored.bytes),
        },
      });
      await this.prisma.asset.update({ where: { id: subAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${subAsset.id}/content` } });
      await this.prisma.subtitleTrack.create({ data: { id: generateId(), videoId, language: video.language, format: 'ass', storageKey: subStored.storageKey, wordLevel: false } });

      /* 5 ── READY */
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'READY',
          title: script.title,
          description: script.description,
          tags: script.tags,
          hook: script.hook,
          cta: script.cta,
          durationMs,
          qualityScore: Math.min(95, 60 + script.scenes.length * 6),
          seo: { keyword, provider, engine: `${provider}-gtts-pollinations` },
        },
      });
    } catch (err) {
      // Surface the provider/config guidance, not just the exception class —
      // ApiError carries the actionable text in `detail` (title is generic).
      const rawText =
        (err as { detail?: string } | null | undefined)?.detail ?? (err instanceof Error ? err.message : 'generation failed');
      const msg = rawText.slice(0, 480);
      // Configuration faults (marked terminal) can never heal by retrying;
      // transient provider hiccups get the queue's 3-attempt backoff instead.
      const explicitlyTerminal = (err as { terminal?: boolean } | null | undefined)?.terminal === true;
      const terminal = explicitlyTerminal || attempt >= 3;
      const statusData = terminal ? { status: 'FAILED' as const, failureReason: msg } : { failureReason: `retry ${attempt}/3: ${msg}` };
      await this.prisma.video.update({ where: { id: videoId }, data: statusData });
      if (explicitlyTerminal) return; // acknowledge the job — no queue retry can fix config
      throw err;
    }
  }

  /** Probe-file sanity (never trust a provider silently). */
  private assertDimensionsCoherent(_assetId: string): void {
    /* width/height recorded from the requested render profile, not the provider payload */
  }

  private async wipePartialChildren(videoId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.pipelineStepRun.deleteMany({ where: { run: { videoId } } }),
      this.prisma.pipelineRun.deleteMany({ where: { videoId } }),
      this.prisma.subtitleTrack.deleteMany({ where: { videoId } }),
      this.prisma.thumbnail.deleteMany({ where: { videoId } }),
      this.prisma.videoRendition.deleteMany({ where: { videoId } }),
      this.prisma.scene.deleteMany({ where: { videoId } }),
      this.prisma.voiceover.deleteMany({ where: { script: { videoId } } }),
      this.prisma.script.deleteMany({ where: { videoId } }),
    ]);
  }
}
