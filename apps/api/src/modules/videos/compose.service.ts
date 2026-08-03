/**
 * VideoComposer — REAL render: scene images (Ken Burns) + voiceover + burned
 * Arabic subtitles → 720x1280 H.264 MP4, via the ffmpeg/ffprobe static
 * binaries (works on the Render free runtime — no system packages needed).
 * Arabic captions: libass `subtitles` filter with the bundled Noto Naskh
 * Arabic font (OFL, infra/fonts).
 */
import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpegPathImport from 'ffmpeg-static';
import ffprobeStaticImport from 'ffprobe-static';

const ffmpegPath: string = (ffmpegPathImport as unknown as string | null) ?? 'ffmpeg';
const ffprobePath: string = (ffprobeStaticImport as unknown as { path: string }).path;

function findFontsDir(): string {
  // repo root on Render = project src root; walk up looking for infra/fonts.
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, 'infra', 'fonts');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      if (require('node:fs').existsSync(candidate)) return candidate;
    } catch {
      /* keep walking */
    }
    dir = resolve(dir, '..');
  }
  return join(process.cwd(), 'infra', 'fonts');
}

export const FONTS_DIR = findFontsDir();

async function run(bin: string, args: string[], timeoutMs = 600_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const killer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(killer); rejectPromise(e); });
    child.on('close', (code) => {
      clearTimeout(killer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${bin} exited ${code}: ${stderr.slice(-900)}`));
    });
  });
}

export async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await run(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], 30_000);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`ffprobe: no duration for ${file}`);
  return Math.round(seconds * 1000);
}

export interface ComposeScene {
  imagePath: string;
  caption: string;
  durationMs: number;
}

/** ASS caption escaping (commas break Dialogue fields — escape stays literal-safe for libass). */
function assEscape(text: string): string {
  return text.replace(/\{/g, '（').replace(/\}/g, '）').replace(/\n/g, '\\N').trim();
}

function msToAss(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

@Injectable()
export class VideoComposer {
  /**
   * Renders the final cut. Returns { videoPath, durationMs }.
   * Each scene zooms slowly (Ken Burns, alternating in/out) for its duration;
   * captions burn scene-synced; audio is trimmed to the video length.
   */
  async compose(scenes: ComposeScene[], audioPath: string, workDir: string): Promise<{ videoPath: string; durationMs: number }> {
    if (scenes.length === 0) throw new Error('compose: no scenes');
    await mkdir(workDir, { recursive: true });
    const assPath = join(workDir, 'captions.ass');
    await writeFile(assPath, this.buildAss(scenes), 'utf8');

    const fps = 30;
    const inputs: string[] = [];
    const filters: string[] = [];
    scenes.forEach((s, i) => {
      const frames = Math.max(1, Math.round((s.durationMs / 1000) * fps));
      const sec = (s.durationMs / 1000).toFixed(2);
      inputs.push('-loop', '1', '-t', sec, '-i', s.imagePath);
      const zoom = i % 2 === 0 ? "z='min(zoom+0.0012,1.14)'" : "z='max(1.14-0.0012*on,1.0)'";
      filters.push(
        `[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=${zoom}:d=${frames}:s=720x1280:fps=${fps},setsar=1,format=yuv420p[v${i}]`,
      );
    });
    const audioIndex = scenes.length;
    const concatLabels = scenes.map((_, i) => `[v${i}]`).join('');
    filters.push(`${concatLabels}concat=n=${scenes.length}:v=1:a=0[vcat]`);
    // fontsdir is given as a DIRECTORY filter arg — quoted for ffmpeg's filter parser.
    filters.push(`[vcat]subtitles='${assPath.replace(/'/g, "'\\''")}':fontsdir='${FONTS_DIR.replace(/'/g, "'\\''")}'[vout]`);

    const videoPath = join(workDir, 'final.mp4');
    await run(ffmpegPath, [
      '-y',
      ...inputs,
      '-i', audioPath,
      '-filter_complex', filters.join(';'),
      '-map', '[vout]',
      '-map', `${audioIndex}:a`,
      '-shortest',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      videoPath,
    ]);
    const durationMs = await probeDurationMs(videoPath);
    return { videoPath, durationMs };
  }

  /** Concatenate gTTS chunk MP3s into one voiceover file. */
  async concatAudio(chunks: Buffer[], workDir: string): Promise<{ audioPath: string; durationMs: number }> {
    await mkdir(workDir, { recursive: true });
    if (chunks.length === 1) {
      const single = join(workDir, 'voice.mp3');
      await writeFile(single, chunks[0]!);
      const durationMs = await probeDurationMs(single);
      return { audioPath: single, durationMs };
    }
    const files: string[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const p = join(workDir, `voice-${String(i).padStart(3, '0')}.mp3`);
      await writeFile(p, chunks[i]!);
      files.push(p);
    }
    const listPath = join(workDir, 'voice-list.txt');
    await writeFile(listPath, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    const audioPath = join(workDir, 'voice.mp3');
    await run(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-b:a', '128k', audioPath], 120_000);
    const durationMs = await probeDurationMs(audioPath);
    return { audioPath, durationMs };
  }

  /** Poster frame for the video (2nd second). */
  async thumbnail(videoPath: string, workDir: string): Promise<Buffer> {
    const out = join(workDir, 'thumb.jpg');
    await run(ffmpegPath, ['-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', '-q:v', '3', out], 60_000);
    const { readFile } = await import('node:fs/promises');
    return readFile(out);
  }

  private buildAss(scenes: ComposeScene[]): string {
    let cursor = 0;
    const events = scenes
      .map((s) => {
        const start = msToAss(cursor);
        cursor += s.durationMs;
        const end = msToAss(cursor);
        return `Dialogue: 0,${start},${end},Title,,0,0,0,,${assEscape(s.caption)}`;
      })
      .join('\n');
    return `[Script Info]
ScriptType: v4.00+
WrapStyle: 1
ScaledBorderAndShadow: yes
Collisions: Normal

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Noto Naskh Arabic,46,&H00FFFFFF,&H000019FF,&H90000000,&HA0000000,1,0,0,0,100,100,0,0,1,2.4,0.6,2,54,54,120,178

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
  }
}

export function workDirFor(kind: string, id: string): string {
  return join(tmpdir(), 'aca-render', kind, id);
}
