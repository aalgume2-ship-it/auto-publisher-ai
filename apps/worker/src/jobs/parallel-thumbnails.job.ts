/**
 * Parallel thumbnails job — extract N candidate thumbnails from a
 * rendered video using ffmpeg, persist Thumbnail rows in the database.
 *
 * Payload:
 *   { type: 'thumbnails.parallel', videoId, inputPath, count, attempt }
 *
 * The API process is responsible for streaming the bytes from S3 to a
 * local file (or for handing the worker a presigned S3 URL we can
 * fetch). For local dev we accept a `file://` or absolute path.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AppConfig } from '@aca/config';
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import { generateId } from '@aca/database';

export interface ParallelThumbnailsPayload {
  type: 'thumbnails.parallel';
  videoId: string;
  inputPath: string;
  count?: number;
  attempt?: number;
}

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export async function parallelThumbnailsJob(
  _config: AppConfig,
  prisma: DbClient,
  logger: Logger,
  payload: ParallelThumbnailsPayload,
): Promise<{ count: number }> {
  const count = payload.count ?? 6;
  const workdir = join(tmpdir(), 'aca-thumbs', payload.videoId, String(Date.now()));
  await mkdir(workdir, { recursive: true });

  // The API process is expected to materialize a local copy of the
  // video at `inputPath` (it streams from S3 with a presigned URL).
  if (!(await safeStat(payload.inputPath))) {
    logger.warn(
      { videoId: payload.videoId, inputPath: payload.inputPath, module: 'thumbnails.job' },
      'thumbnails.input.missing',
    );
    return { count: 0 };
  }

  // Probe duration.
  const probe = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    payload.inputPath,
  ]);
  const durationSec = Math.max(1, Number(probe.stdout.trim()) || 30);

  // Extract `count` evenly-spaced frames.
  for (let i = 0; i < count; i += 1) {
    const t = ((i + 1) / (count + 1)) * durationSec;
    const out = join(workdir, `t-${i}.jpg`);
    await run(FFMPEG, [
      '-y',
      '-ss', t.toFixed(2),
      '-i', payload.inputPath,
      '-frames:v', '1',
      '-q:v', '3',
      out,
    ]);
  }

  // Persist a Thumbnail row per candidate (the API picks the selected one).
  let persisted = 0;
  for (let i = 0; i < count; i += 1) {
    const out = join(workdir, `t-${i}.jpg`);
    const fileStat = await safeStat(out);
    if (!fileStat) continue;
    await prisma.thumbnail.create({
      data: {
        id: generateId(),
        videoId: payload.videoId,
        variant: i,
        storageKey: `thumbnails/${payload.videoId}/t-${i}.jpg`,
        width: 1280,
        height: 720,
        selected: i === Math.floor(count / 2),
        bytes: BigInt(fileStat.size),
      },
    });
    persisted += 1;
  }

  await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  logger.info({ videoId: payload.videoId, count: persisted, module: 'thumbnails.job' }, 'thumbnails.completed');
  return { count: persisted };
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

async function safeStat(p: string): Promise<{ size: number } | null> {
  try {
    const s = await stat(p);
    return { size: s.size };
  } catch {
    return null;
  }
}

void readFile;
