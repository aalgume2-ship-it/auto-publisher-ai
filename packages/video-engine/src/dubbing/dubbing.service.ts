/**
 * DubbingService — REAL dubbing pipeline (queue: 'dubbing').
 * Upload video → extract source audio → transcript (script row, or OpenAI
 * Whisper STT when the video has no script) → LLM translation → voice
 * synthesis (gTTS keyless / OpenAI TTS) → replace audio track → re-render
 * MP4 → AssetStore (S3 / Postgres) → new rendition + asset → COMPLETED.
 * Every stage fails CLOSED with NOT_CONFIGURED guidance when a required
 * provider key is missing — never a silent stub.
 */
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { type AiService } from '../ai/ai.service.js';
import { type AssetStore } from '../media/asset-store.js';
import { run, probeDurationMs, workDirFor } from '../render/compose.service.js';
import { PipelineError, providerNotConfigured } from '../errors.js';

const LANG_NAMES: Record<string, string> = {
  ar: 'Arabic', en: 'English', fr: 'French', es: 'Spanish', de: 'German', tr: 'Turkish', ur: 'Urdu', hi: 'Hindi',
};

const require = createRequire(import.meta.url);

function ffmpegBin(): string {
  try {
    const pkgJson = require.resolve('@ffmpeg-installer/linux-x64/package.json');
    const p = join(dirname(pkgJson), 'ffmpeg');
    return p;
  } catch {
    return 'ffmpeg';
  }
}

export class DubbingService {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: DbClient,
    private readonly ai: AiService,
    private readonly store: AssetStore | null = null,
  ) {}

  /** Create the DubbingJob row (API side). */
  async create(orgId: string, videoId: string, targetLanguage: string, voiceId: string | null, createdById: string | null) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, orgId } });
    if (!video) throw new PipelineError('NOT_FOUND', 'Video not found', { detail: `video ${videoId}` });
    const lang = LANG_NAMES[targetLanguage] ? targetLanguage : 'en';
    return this.prisma.dubbingJob.create({
      data: {
        id: generateId(),
        orgId,
        videoId,
        sourceLanguage: video.language ?? 'ar',
        targetLanguage: lang,
        voiceId: voiceId ?? null,
        status: 'QUEUED',
        createdById: createdById ?? null,
      },
    });
  }

  async process(jobId: string, attempt = 1): Promise<string> {
    if (!this.store) throw new Error('DubbingService requires an AssetStore (worker)');
    const job = await this.prisma.dubbingJob.findUnique({
      where: { id: jobId },
      include: {
        video: {
          include: { renditions: { orderBy: { createdAt: 'desc' } }, scripts: { orderBy: { version: 'desc' }, take: 1 } },
        },
      },
    });
    if (!job) throw new PipelineError('NOT_FOUND', 'Dubbing job not found', { detail: `dubbing ${jobId}` });
    if (job.status === 'COMPLETED') return job.outputRenditionId ?? ''; // idempotent re-entry

    await this.prisma.dubbingJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', failureReason: null } });
    const t0 = Date.now();
    try {
      const video = job.video;
      const rendition = video.renditions[0];
      if (!rendition?.storageKey) {
        throw new PipelineError('NOT_FOUND', 'Video has no READY rendition', { detail: 'generate the video before dubbing' });
      }

      const wd = workDirFor('dub', jobId);
      await mkdir(wd, { recursive: true });

      /* 1 ── transcript: saved script row, else OpenAI Whisper STT */
      let transcript = video.scripts[0]?.content ?? null;
      let sttProvider: string | null = null;
      if (!transcript) {
        const openaiKey = await this.ai.rawOpenAiKey(job.orgId);
        if (!openaiKey) {
          throw providerNotConfigured(
            ['OPENAI_API_KEY'],
            'Dubbing videos without a saved script needs OpenAI Whisper speech-to-text',
          );
        }
        const srcAudio = join(wd, 'source.aac');
        await run(ffmpegBin(), [
          '-y', '-nostdin', '-hide_banner', '-v', 'warning',
          '-i', this.store.fullPath(rendition.storageKey),
          '-vn', '-ac', '1', '-ar', '16000', srcAudio,
        ]);
        const audioBuf = await readFile(srcAudio);
        const fd = new FormData();
        fd.append('file', new Blob([audioBuf], { type: 'audio/mpeg' }), 'source.mp3');
        fd.append('model', 'whisper-1');
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { authorization: `Bearer ${openaiKey}` },
          body: fd,
        });
        if (!res.ok) throw new Error(`whisper stt ${res.status}: ${(await res.text()).slice(0, 240)}`);
        const json = (await res.json()) as { text?: string };
        transcript = json.text ?? '';
        sttProvider = 'openai-whisper';
        if (transcript.trim().length < 10) throw new Error('whisper returned empty transcript');
      }

      /* 2 ── translation (LLM — any configured LLM key) */
      const translated = await this.ai.translateText(
        transcript,
        LANG_NAMES[job.targetLanguage] ?? job.targetLanguage,
        job.orgId,
      );

      /* 3 ── voice synthesis (gTTS keyless default / OpenAI TTS) */
      const tts = await this.ai.synthesizeVoice(translated.text, job.targetLanguage, job.orgId);
      const audioPath = join(wd, 'dub.m4a');
      await writeFile(audioPath, tts.chunks.length === 1 ? tts.chunks[0]! : Buffer.concat(tts.chunks));

      /* 4 ── replace audio track, keep original video stream */
      const outPath = join(wd, 'dubbed.mp4');
      await run(ffmpegBin(), [
        '-y', '-nostdin', '-hide_banner', '-v', 'warning',
        '-i', this.store.fullPath(rendition.storageKey),
        '-i', audioPath,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k',
        '-shortest', '-movflags', '+faststart',
        outPath,
      ]);
      const durationMs = await probeDurationMs(outPath);
      const mp4 = await readFile(outPath);
      if (mp4.byteLength < 50_000) throw new Error('dub render produced a suspiciously small mp4');

      /* 5 ── durable storage + rows */
      const stored = await this.store.put(job.orgId, `dubbed-${job.targetLanguage}.mp4`, mp4);
      const asset = await this.prisma.asset.create({
        data: {
          id: generateId(),
          orgId: job.orgId,
          type: 'VIDEO_CLIP',
          source: 'GENERATED',
          storageKey: stored.storageKey,
          cdnPath: `/v1/organizations/${job.orgId}/assets/pending`,
          mimeType: 'video/mp4',
          bytes: BigInt(stored.bytes),
          durationMs,
          width: 720,
          height: 1280,
          metadata: {
            provider: tts.provider,
            sttProvider,
            translateProvider: translated.provider,
            targetLanguage: job.targetLanguage,
            dubbingJobId: jobId,
            wallMs: Date.now() - t0,
          },
        },
      });
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { cdnPath: `/v1/organizations/${job.orgId}/assets/${asset.id}/content` },
      });
      const renditionRow = await this.prisma.videoRendition.create({
        data: {
          id: generateId(),
          videoId: job.videoId,
          profile: `dub-${job.targetLanguage}-720x1280`,
          storageKey: stored.storageKey,
          bytes: BigInt(stored.bytes),
          durationMs,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      await this.prisma.dubbingJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', outputRenditionId: renditionRow.id, failureReason: null, finishedAt: new Date() },
      });
      return renditionRow.id;
    } catch (err) {
      const e = PipelineError.from(err);
      const terminal = e.terminal || attempt >= 3;
      await this.prisma.dubbingJob.update({
        where: { id: jobId },
        data: {
          status: terminal ? 'FAILED' : 'QUEUED',
          failureReason: terminal ? (e.detail ?? e.message).slice(0, 480) : `Retrying — attempt ${attempt}/3`,
        },
      });
      throw e;
    }
  }
}
