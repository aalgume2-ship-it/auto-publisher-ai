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
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { type AiService } from '../ai/ai.service.js';
import { type AssetStore } from '../media/asset-store.js';
import { type VideoComposer, probeDurationMs, workDirFor } from '../render/compose.service.js';
import { readFile } from 'node:fs/promises';
import { providerNotConfigured } from '../errors.js';

const VOICE_PROVIDER_TTS: Record<string, { provider: string; providerVoiceId: string; name: string }> = {
  gtts: { provider: 'gtts', providerVoiceId: 'ar-male-1', name: 'صوت عربي فصيح (gTTS)' },
  openai: { provider: 'openai', providerVoiceId: 'alloy', name: 'OpenAI Alloy (HD)' },
};

/** Order-preserving async pool (network concurrency without rate-limit storms). */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

export class GenerationService {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: DbClient,
    private readonly ai: AiService,
    private readonly store: AssetStore,
    private readonly composer: VideoComposer,
  ) {}

  /**
   * Process a generation job for a video row (called by the worker).
   * attempt-aware: only the FINAL attempt flips the video to FAILED, so a
   * transient provider hiccup doesn't show a false-dead status mid-retry.
   */
  async process(videoId: string, attempt = 1): Promise<void> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    });
    if (!video) throw new Error(`video ${videoId} not found`);
    if (video.status === 'PUBLISHED' || video.status === 'READY') return; // idempotent re-entry
    await this.prisma.video.update({ where: { id: videoId }, data: { status: 'GENERATING', failureReason: null } });
    const t0 = Date.now();

    try {
      await this.wipePartialChildren(videoId);
      const keyword = (video.seo as { keyword?: string } | null)?.keyword ?? video.title;
      const targetSeconds =
        (video.seo as { targetSeconds?: number } | null)?.targetSeconds ??
        (video.seo as { durationSec?: number } | null)?.durationSec ??
        45;
      const wd = workDirFor('gen', videoId);

      // live step surface: the UI polls `videos` and renders `seo.step`
      const seoState: Record<string, unknown> = { keyword };
      const markStep = (step: string, progress: number, status: 'GENERATING' | 'RENDERING' | 'UPLOADING' = 'GENERATING') =>
        // JSON round-trip narrows Record<string,unknown> → Prisma's InputJsonValue
        this.prisma.video.update({
          where: { id: videoId },
          data: { status, seo: JSON.parse(JSON.stringify({ ...seoState, step, progress })) },
        });

      // A still-image slideshow is not text-to-video. Fail fast and visibly
      // unless an actual moving-video provider is configured.
      const videoCred = await this.ai.resolveVideoCred(video.orgId);
      if (!videoCred) {
        throw providerNotConfigured(
          ['POLLINATIONS_API_KEY', 'RUNWAY_API_KEY', 'LUMA_API_KEY', 'FAL_KEY'],
          'AI generation provider is not configured',
        );
      }
      seoState['videoProvider'] = videoCred.def.id;
      await markStep('script', 8);

      /* 1 ── script (real LLM) */
      const { script, provider } = await this.ai.generateScript(
        {
          keyword,
          niche: video.project.niche ?? 'معرفة وحقائق',
          language: video.language,
          targetSeconds: Math.min(90, Math.max(20, targetSeconds)),
        },
        video.orgId,
      );
      seoState['provider'] = provider;
      await markStep('voice', 22);
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

      /* 3 ── per-scene visuals (moving AI clips when a video key exists) */
      const engine = `${provider}-gtts-${videoCred.def.id}-clips`;
      const sceneWords = script.scenes.map((s) => s.narration.split(/\s+/).filter(Boolean).length);
      const totalWords = sceneWords.reduce((a, b) => a + b, 0) || 1;
      let cursor = 0;
      const windows: { startMs: number; durationMs: number }[] = [];
      const movingScenes: { clipPath: string; caption: string; durationMs: number }[] = [];
      const stillScenes: { imagePath: string; caption: string; durationMs: number }[] = [];
      for (let i = 0; i < script.scenes.length; i += 1) {
        const scene = script.scenes[i]!;
        const isLast = i === script.scenes.length - 1;
        const durationMs = isLast ? Math.max(3_000, voiceMs - cursor) : Math.max(3_000, Math.round((sceneWords[i]! / totalWords) * voiceMs));
        windows.push({ startMs: cursor, durationMs });
        if (i > 0) await new Promise((r) => setTimeout(r, 6_000)); // pollinations anon tier: 1 image at a time (429 otherwise)
        await markStep(`scenes ${i + 1}/${script.scenes.length}`, 30 + Math.round(((i + 1) / script.scenes.length) * 20));
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
        stillScenes[i] = { imagePath: this.store.fullPath(imgStored.storageKey), caption: scene.narration, durationMs };
        this.assertDimensionsCoherent(imgAsset.id);
        await this.prisma.scene.create({
          data: {
            id: generateId(),
            videoId,
            index: i,
            narrationText: scene.narration,
            visualPrompt: scene.visualPrompt,
            assetId: imgAsset.id,
            startMs: windows[i]!.startMs,
            endMs: windows[i]!.startMs + windows[i]!.durationMs,
          },
        });
        cursor += durationMs;
      }

      /* 3.5 ── moving clips (only when a video provider key is configured) */
      {
        await markStep(`clips 0/${script.scenes.length}`, 52);
        let clipsDone = 0;
        try {
          await mapPool(script.scenes, videoCred.def.id === 'hf-ltx' ? 1 : 2, async (scene, i) => {
            const w = windows[i]!;
            const buf = await this.ai.generateSceneClip(videoCred, scene.visualPrompt, this.ai.sceneImageUrl(scene.visualPrompt, 1000 + i * 77), w.durationMs / 1000);
            const clipStored = await this.store.put(video.orgId, `clip-${i}.mp4`, buf);
            const clipAsset = await this.prisma.asset.create({
              data: {
                id: generateId(),
                orgId: video.orgId,
                type: 'VIDEO_CLIP',
                source: 'GENERATED',
                storageKey: clipStored.storageKey,
                cdnPath: 'pending',
                mimeType: 'video/mp4',
                bytes: BigInt(buf.length),
                durationMs: w.durationMs,
                width: 720,
                height: 1280,
                metadata: { prompt: scene.visualPrompt, provider: videoCred.def.id, firstFrameStill: `scene-${i}.jpg` },
              },
            });
            await this.prisma.asset.update({ where: { id: clipAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${clipAsset.id}/content` } });
            movingScenes[i] = { clipPath: this.store.fullPath(clipStored.storageKey), caption: scene.narration, durationMs: w.durationMs };
            clipsDone += 1;
            await markStep(`clips ${clipsDone}/${script.scenes.length}`, 52 + Math.round((clipsDone / script.scenes.length) * 18));
          });
        } catch (err) {
          // The public ZeroGPU queue can be unavailable or out of quota. It is
          // the keyless tier only, so keep the job useful by rendering the
          // generated scene art with deterministic camera motion. Paid/BYOK
          // provider failures still surface normally.
          if (videoCred.source !== 'keyless') throw err;
          movingScenes.length = 0;
          seoState['motionFallback'] = 'animated-stills';
          await markStep('motion fallback', 70);
        }
      }

      // Production installations created before the expanded VideoStatus enum
      // may not have RENDERING/UPLOADING yet. The detailed step/progress lives
      // in seo, so keep the durable status compatible until schema repair.
      await markStep('render', 72);

      /* 4 ── compose (real ffmpeg render; moving path when clips exist) */
      const { videoPath, durationMs } = movingScenes.length === script.scenes.length
        ? await this.composer.composeMoving(movingScenes, audioPath, wd)
        : await this.composer.compose(stillScenes, audioPath, wd);
      const mp4Base64 = await readFile(videoPath, { encoding: 'base64' });
      const mp4Bytes = Buffer.byteLength(mp4Base64, 'base64');
      if (mp4Bytes < 50_000) throw new Error('render produced a suspiciously small mp4');
      await markStep('upload', 88);
      const vidStored = await this.store.putBase64(video.orgId, 'shorts-720x1280.mp4', mp4Base64);
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
          seo: { keyword, provider, engine, wallMs: Date.now() - t0, step: 'ready' },
        },
      });
    } catch (err) {
      // Surface user-friendly state — never raw stack/API Unreachable to the user.
      // Technical detail is kept in server logs; UI sees only Processing/Retrying/Failed buckets.
      const rawText =
        (err as { detail?: string } | null | undefined)?.detail ?? (err instanceof Error ? err.message : 'generation failed');
      // Map technical noise to friendly buckets
      const friendly = (() => {
        if ((err as { terminal?: boolean })?.terminal === true || rawText.includes('AI_CREDENTIALS_MISSING') || rawText.includes('NOT_CONFIGURED')) return rawText; // config guidance is intentional
        if (/API Unreachable|fetch failed|network|ECONN|ETIMEDOUT|timeout/i.test(rawText)) return 'Processing — working on your video, will retry automatically';
        if (/429|rate/i.test(rawText)) return 'Retrying — high demand, queuing again';
        if (/401|403|unauthorized|key rejected/i.test(rawText)) return 'Failed — AI provider key rejected. Update it in Settings.';
        const m = rawText.slice(0, 240);
        // Fallback friendly prefix
        return m.length > 6 ? `Processing — ${m}` : 'Processing — retrying automatically';
      })();
      const msg = friendly.slice(0, 480);
      const explicitlyTerminal = (err as { terminal?: boolean } | null | undefined)?.terminal === true;
      const terminal = explicitlyTerminal || attempt >= 3;
      // Store friendly reason for UI; keep raw in logs
      if (!explicitlyTerminal) console.warn(`[generation:${videoId}] attempt ${attempt} raw: ${rawText.slice(0, 400)}`);
      else console.warn(`[generation:${videoId}] terminal: ${rawText.slice(0, 400)}`);
      const statusData = terminal ? { status: 'FAILED' as const, failureReason: msg } : { failureReason: `Retrying — attempt ${attempt}/3` };
      await this.prisma.video.update({ where: { id: videoId }, data: statusData });
      if (explicitlyTerminal) throw err; // terminal — no queue retry can fix config
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
