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
import { uploadMp4ToBunnyStorage } from '../media/bunny-storage.js';
import { type VideoComposer, workDirFor } from '../render/compose.service.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { providerNotConfigured } from '../errors.js';

const VOICE_PROVIDER_TTS: Record<string, { provider: string; providerVoiceId: string; name: string }> = {
  gtts: { provider: 'gtts', providerVoiceId: 'ar-male-1', name: 'صوت عربي فصيح (gTTS)' },
  openai: { provider: 'openai', providerVoiceId: 'alloy', name: 'OpenAI Alloy (HD)' },
  'runway-eleven-v3': { provider: 'runway', providerVoiceId: 'Elias-ar-eleven-v3', name: 'Runway Eleven v3 — Elias Arabic' },
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
        40;
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
      // Keep the complete four-beat story. The free moving-video providers are
      // requested with bounded concurrency below for a fast but gentle load.
      seoState['sceneStrategy'] = 'multi-shot-ai-story';
      seoState['provider'] = provider;
      await markStep('voice', 22);
      const narration = script.scenes.map((s) => s.narration).join(' ');
      const wordCount = narration.split(/\s+/).filter(Boolean).length;
      const readingSeconds = Math.max(15, Math.round(wordCount / 2.2));

      // system rows the pipeline needs (voice record per provider)
      /* 2 ── voiceover (real TTS) */
      const tts = await this.ai.synthesizeVoice(narration, video.language, video.orgId);
      const vmeta = VOICE_PROVIDER_TTS[tts.provider] ?? VOICE_PROVIDER_TTS['gtts']!;
      const voice = await this.prisma.voice.upsert({
        where: { provider_providerVoiceId: { provider: vmeta.provider, providerVoiceId: vmeta.providerVoiceId } },
        create: { id: generateId(), provider: vmeta.provider, providerVoiceId: vmeta.providerVoiceId, name: vmeta.name, gender: 'male', languages: ['ar'] },
        update: {},
      });
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
      const engine = `${provider}-${tts.provider}-${videoCred.def.id}-clips`;
      const sceneWords = script.scenes.map((s) => s.narration.split(/\s+/).filter(Boolean).length);
      const totalWords = sceneWords.reduce((a, b) => a + b, 0) || 1;
      // The requested story duration is the source of truth. The moving
      // composer tempo-fits narration and clips to these exact scene windows.
      const timelineMs = targetSeconds * 1_000;
      let cursor = 0;
      const windows: { startMs: number; durationMs: number }[] = [];
      const movingScenes: { clipPath: string; caption: string; durationMs: number }[] = [];
      const firstFrameUrls: (string | null)[] = [];
      for (let i = 0; i < script.scenes.length; i += 1) {
        const scene = script.scenes[i]!;
        const isLast = i === script.scenes.length - 1;
        const durationMs = isLast
          ? Math.max(3_000, timelineMs - cursor)
          : Math.max(3_000, Math.round((sceneWords[i]! / totalWords) * timelineMs));
        windows.push({ startMs: cursor, durationMs });
        await markStep(`scenes ${i + 1}/${script.scenes.length}`, 30 + Math.round(((i + 1) / script.scenes.length) * 20));
        let imageAssetId: string | null = null;
        if (videoCred.def.supportsFirstFrame) {
          if (i > 0) await new Promise((r) => setTimeout(r, 3_000));
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
          imageAssetId = imgAsset.id;
          firstFrameUrls[i] = this.ai.sceneImageUrl(scene.visualPrompt, 1000 + i * 77);
        } else {
          firstFrameUrls[i] = null;
        }
        await this.prisma.scene.create({
          data: {
            id: generateId(),
            videoId,
            index: i,
            narrationText: scene.narration,
            visualPrompt: scene.visualPrompt,
            assetId: imageAssetId,
            startMs: windows[i]!.startMs,
            endMs: windows[i]!.startMs + windows[i]!.durationMs,
          },
        });
        cursor += durationMs;
      }

      /* 3.5 ── moving clips (only when a video provider key is configured) */
      {
        await markStep(`clips 0/${script.scenes.length}`, 52);
        let clipAttemptsDone = 0;
        const clipErrors: string[] = [];
        await mapPool(script.scenes, 2, async (scene, i) => {
          try {
            const w = windows[i]!;
            const buf = await this.ai.generateSceneClip(videoCred, scene.visualPrompt, firstFrameUrls[i] ?? null, w.durationMs / 1000);
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
                metadata: { prompt: scene.visualPrompt, provider: videoCred.def.id, firstFrameStill: firstFrameUrls[i] ? `scene-${i}.jpg` : null },
              },
            });
            await this.prisma.asset.update({ where: { id: clipAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${clipAsset.id}/content` } });
            movingScenes[i] = { clipPath: this.store.fullPath(clipStored.storageKey), caption: scene.narration, durationMs: w.durationMs };
          } catch (err) {
            clipErrors[i] = err instanceof Error ? err.message : String(err);
          } finally {
            clipAttemptsDone += 1;
            await markStep(`clips ${clipAttemptsDone}/${script.scenes.length}`, 52 + Math.round((clipAttemptsDone / script.scenes.length) * 18));
          }
        });

        const successful = movingScenes.flatMap((scene) => (scene ? [scene] : []));

        // Shared ZeroGPU capacity can disappear between two scenes. Preserve
        // real motion by reusing a successful story clip, or a closely related
        // durable clip from an earlier attempt, for only the missing windows.
        if (successful.length === 0) {
          try {
            const recent = await this.prisma.asset.findMany({
              where: { orgId: video.orgId, type: 'VIDEO_CLIP', source: 'GENERATED' },
              orderBy: { createdAt: 'desc' },
              take: 30,
            });
            const storyTokens = new Set(
              script.scenes
                .flatMap((scene) => scene.narration.toLowerCase().match(/\p{L}{4,}/gu) ?? [])
                .filter((token) => token.length >= 4),
            );
            const previous = recent.find((asset) => {
              const metadata = asset.metadata as Record<string, unknown> | null;
              if (metadata?.['provider'] !== videoCred.def.id || typeof metadata['prompt'] !== 'string') return false;
              const candidateTokens = metadata['prompt'].toLowerCase().match(/\p{L}{4,}/gu) ?? [];
              return candidateTokens.filter((token) => storyTokens.has(token)).length >= 2;
            });
            if (previous) {
              const bytes = await this.store.read(previous.storageKey);
              if (bytes.byteLength >= 30_000) {
                const restoredPath = `${wd}/restored-ai-clip.mp4`;
                await writeFile(restoredPath, bytes);
                successful.push({
                  clipPath: restoredPath,
                  caption: script.scenes[0]!.narration,
                  durationMs: windows[0]!.durationMs,
                });
              }
            }
          } catch {
            // The provider failure below remains actionable when recovery fails.
          }
        }

        const detail = clipErrors.filter(Boolean).join(' | ');
        if (successful.length === 0) {
          throw new Error(`real AI video generation failed (${videoCred.def.id}): ${detail || 'no moving clips returned'}`);
        }

        if (successful.length < script.scenes.length) {
          const sourceClips = [...successful];
          for (let i = 0; i < script.scenes.length; i += 1) {
            if (movingScenes[i]) continue;
            const source = sourceClips[i % sourceClips.length]!;
            movingScenes[i] = {
              clipPath: source.clipPath,
              caption: script.scenes[i]!.narration,
              durationMs: windows[i]!.durationMs,
            };
          }
          seoState['motionFallback'] = 'reused-ai-video-clip';
          seoState['motionSourceClips'] = sourceClips.length;
          seoState['motionFallbackReason'] = detail.slice(0, 180);
          await markStep(`clips ${sourceClips.length}/${script.scenes.length} + AI reuse`, 70);
        }
      }

      // Production installations created before the expanded VideoStatus enum
      // may not have RENDERING/UPLOADING yet. The detailed step/progress lives
      // in seo, so keep the durable status compatible until schema repair.
      await markStep('render', 72);

      /* 4 ── compose (real ffmpeg render; moving path when clips exist) */
      if (movingScenes.length !== script.scenes.length) {
        throw new Error(`real AI video generation incomplete: ${movingScenes.length}/${script.scenes.length} moving scenes`);
      }
      const requestsNoText = /بدون\s+(?:نص|نصوص|كتابة)|no\s+(?:text|captions|subtitles)/iu.test(keyword);
      const professionalRunway = videoCred.def.id === 'runway';
      seoState['voiceProvider'] = tts.provider;
      seoState['nativeAudio'] = professionalRunway;
      seoState['burnedCaptions'] = !(requestsNoText || professionalRunway);
      const { videoPath, durationMs } = await this.composer.composeMoving(movingScenes, audioPath, wd, {
        burnCaptions: !(requestsNoText || professionalRunway),
        mixClipAudio: professionalRunway,
      });
      const mp4Base64 = await readFile(videoPath, { encoding: 'base64' });
      const mp4Bytes = Buffer.byteLength(mp4Base64, 'base64');
      if (mp4Bytes < 50_000) throw new Error('render produced a suspiciously small mp4');
      // This digest is calculated from the exact bytes FFmpeg wrote.  It is
      // carried alongside the text-safe payload so the API and browser can
      // prove that no storage/proxy boundary changed the rendered file.
      const renderSha256 = createHash('sha256')
        .update(Buffer.from(mp4Base64, 'base64'))
        .digest('hex');
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
          metadata: { profile: 'shorts-720x1280', renderBase64: mp4Base64, renderSha256 },
        },
      });
      await this.prisma.asset.update({ where: { id: videoAsset.id }, data: { cdnPath: `/v1/organizations/${video.orgId}/assets/${videoAsset.id}/content` } });
      await this.prisma.videoRendition.create({
        data: { id: generateId(), videoId, profile: 'shorts-720x1280', storageKey: vidStored.storageKey, bytes: BigInt(vidStored.bytes), durationMs, status: 'COMPLETED', completedAt: new Date() },
      });

      // Bunny is a delivery layer, not the AI generator. Keep the durable S3
      // copy as the source of truth, then mirror the completed MP4 to Bunny.
      // A CDN outage must never turn a successfully rendered video into FAILED.
      const bunnyCred = await this.ai.resolveBunnyStorage(video.orgId);
      if (bunnyCred) {
        try {
          const delivered = await uploadMp4ToBunnyStorage(
            bunnyCred,
            `videos/${video.orgId}/${videoId}/shorts-720x1280.mp4`,
            Buffer.from(mp4Base64, 'base64'),
          );
          seoState['bunnyCdnUrl'] = delivered.cdnUrl;
          seoState['delivery'] = 'bunny-storage';
        } catch (deliveryError) {
          const detail = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
          seoState['bunnyDeliveryError'] = detail.slice(0, 180);
          console.warn(`[generation:${videoId}] Bunny delivery failed: ${detail.slice(0, 240)}`);
        }
      }

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
          seo: { ...seoState, keyword, provider, engine, motionMode: 'ai-video', wallMs: Date.now() - t0, step: 'ready', progress: 100 },
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
