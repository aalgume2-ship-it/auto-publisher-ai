/**
 * Heavy render job — runs a CPU-bound ffmpeg encode that the API
 * process offloaded to the worker. Uses the @aca/video-engine package.
 *
 * Payload (enqueued by the API):
 *   { type: 'render.heavy', videoId, inputUrl, outputKey, profile,
 *     width, height, fps, bitrate, attempt }
 *
 * The worker constructs a RenderJobSpec on the fly and calls
 * FFmpegEngine.render(). The current FFmpegEngine is a stub; this
 * job is the *real* ffmpeg path that uses @ffmpeg-installer / system
 * ffmpeg directly. Once the engine ships its real implementation,
 * this job delegates to it.
 */
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type { AppConfig } from '@aca/config';
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import { generateId } from '@aca/database';
import type { RenderJobSpec } from '@aca/video-engine';

export interface RenderJobPayload {
  type: 'render.heavy';
  videoId: string;
  inputUrl: string;
  outputKey: string;
  profile?: 'draft' | 'standard' | 'hd' | 'master';
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
  attempt?: number;
}

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export async function renderHeavyJob(
  _config: AppConfig,
  prisma: DbClient,
  logger: Logger,
  payload: RenderJobPayload,
): Promise<{ outputKey: string; durationSec: number; bytes: number }> {
  const profile = payload.profile ?? 'standard';
  const width = payload.width ?? 720;
  const height = payload.height ?? 1280;
  const fps = payload.fps ?? 30;
  const bitrate = payload.bitrate ?? '2500k';

  // Build a deterministic spec (idempotency via specHash).
  const spec: RenderJobSpec = {
    videoId: payload.videoId,
    inputVideoUrl: payload.inputUrl,
    outputBucketKey: payload.outputKey,
    encodingProfile: { name: profile, width, height, bitrate, fps, preset: 'fast' },
    normalizeAudio: true,
    audioLufs: -14,
    specHash: '', // filled below
  };
  spec.specHash = createHash('sha256').update(JSON.stringify(spec)).digest('hex');

  // VideoStatus has no RENDERING state; GENERATING covers the render phase.
  await prisma.video.update({
    where: { id: payload.videoId },
    data: { status: 'GENERATING' },
  });

  const workdir = join(tmpdir(), 'aca-render', payload.videoId, spec.specHash.slice(0, 12));
  await mkdir(workdir, { recursive: true });
  const inputPath = join(workdir, 'input.mp4');
  const outputPath = join(workdir, 'render.mp4');

  // 1) Fetch input. The API puts a presigned S3 URL (or local file://
  //    path) in `inputUrl`. We support both.
  await fetchToFile(payload.inputUrl, inputPath);

  // 2) Probe duration.
  const probe = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  const durationSec = Math.max(0.1, Number(probe.stdout.trim()) || 0);

  // 3) Encode.
  await run(FFMPEG, [
    '-y',
    '-i', inputPath,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    '-c:v', 'libx264',
    '-preset', spec.encodingProfile.preset,
    '-b:v', bitrate,
    '-r', String(fps),
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]);

  const stats = await stat(outputPath);
  const bytes = stats.size;
  if (bytes < 50_000) {
    throw new Error(`render produced a suspiciously small file (${bytes} bytes)`);
  }

  // 4) Persist rendition row. The API uploads to S3 separately — we
  //    return the output key + bytes so the API can upload from
  //    the same disk, or the worker can be granted an S3 client later.
  const rendition = await prisma.videoRendition.create({
    data: {
      id: generateId(),
      videoId: payload.videoId,
      profile,
      storageKey: payload.outputKey,
      bytes: BigInt(bytes),
      durationMs: Math.round(durationSec * 1000),
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  await prisma.video.update({
    where: { id: payload.videoId },
    data: { status: 'READY' },
  });

  logger.info(
    { videoId: payload.videoId, profile, bytes, durationSec, renditionId: rendition.id, module: 'render.job' },
    'render.completed',
  );
  return { outputKey: payload.outputKey, durationSec, bytes };
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  if (url.startsWith('file://') || url.startsWith('/')) {
    const { copyFile } = await import('node:fs/promises');
    await copyFile(url.replace(/^file:\/\//, ''), dest);
    return;
  }
  // Stream the URL to disk.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch input failed: ${res.status} ${res.statusText}`);
  const { createWriteStream } = await import('node:fs');
  const stream = createWriteStream(dest);
  if (!res.body) throw new Error('no body');
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) stream.write(Buffer.from(value));
  }
  await new Promise<void>((resolve, reject) => {
    stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });
}

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

void spawn;
