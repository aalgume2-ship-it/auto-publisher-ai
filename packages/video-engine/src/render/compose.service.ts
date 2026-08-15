/**
 * VideoComposer — REAL render: scene images (Ken Burns) + voiceover + burned
 * Arabic subtitles → 720x1280 H.264 MP4, via the ffmpeg/ffprobe static
 * binaries (bundled via npm — no system packages needed on any runtime).
 * Arabic captions: libass `subtitles` filter with the bundled Noto Naskh
 * Arabic font (OFL, infra/fonts).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);

/**
 * ffmpeg/ffprobe binary resolution — deterministic and offline-safe:
 *   1. FFMPEG_PATH / FFPROBE_PATH env overrides (deployments with a system ffmpeg)
 *   2. @ffmpeg-installer / @ffprobe-installer — the binary ships INSIDE the npm
 *      package, so installs work with `--ignore-scripts` and air-gapped caches
 *   3. ffmpeg-static / ffprobe-static (download at install time; historical default)
 *   4. bare `ffmpeg` / `ffprobe` from PATH
 */
function resolveFfmpeg(): string {
  const env = process.env.FFMPEG_PATH;
  if (env && existsSync(env)) return env;
  for (const pkg of ['@ffmpeg-installer/linux-x64', 'ffmpeg-static']) {
    try {
      const pkgJson = require.resolve(`${pkg}/package.json`);
      const p = join(dirname(pkgJson), 'ffmpeg');
      if (existsSync(p)) return p;
    } catch {
      /* try next source */
    }
    try {
      const candidate = require(pkg) as unknown;
      const p =
        typeof candidate === 'string'
          ? candidate
          : (candidate as { path?: string } | null)?.path ?? (candidate as { default?: string } | null)?.default;
      if (typeof p === 'string' && existsSync(p)) return p;
    } catch {
      /* try next source */
    }
  }
  return 'ffmpeg';
}

function resolveFfprobe(): string {
  const env = process.env.FFPROBE_PATH;
  if (env && existsSync(env)) return env;
  for (const pkg of ['@ffprobe-installer/linux-x64', 'ffprobe-static']) {
    try {
      const pkgJson = require.resolve(`${pkg}/package.json`);
      const p = join(dirname(pkgJson), 'ffprobe');
      if (existsSync(p)) return p;
    } catch {
      /* try next source */
    }
    try {
      const candidate = require(pkg) as unknown;
      const p = typeof candidate === 'string' ? candidate : (candidate as { path?: string } | null)?.path;
      if (typeof p === 'string' && existsSync(p)) return p;
    } catch {
      /* try next source */
    }
  }
  return 'ffprobe';
}

const ffmpegPath: string = resolveFfmpeg();
const ffprobePath: string = resolveFfprobe();

/** Worker readiness gate: both runtime binaries must execute successfully. */
export async function verifyMediaRuntime(): Promise<void> {
  await Promise.all([
    run(ffmpegPath, ['-version'], 15_000),
    run(ffprobePath, ['-version'], 15_000),
  ]);
}

function findFontsDir(): string {
  // repo root = project src root; walk up looking for infra/fonts.
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, 'infra', 'fonts');
    try {
       
      if (require('node:fs').existsSync(candidate)) return candidate;
    } catch {
      /* keep walking */
    }
    dir = resolve(dir, '..');
  }
  return join(process.cwd(), 'infra', 'fonts');
}

export const FONTS_DIR = findFontsDir();

export async function run(bin: string, args: string[], timeoutMs = 600_000): Promise<{ stdout: string; stderr: string }> {
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

/**
 * Renders a silent WAV track of the requested length (codec built into every
 * ffmpeg — pcm_s16le). Utility only — the production pipeline uses real
 * gTTS / OpenAI TTS, never silent placeholders.
 */
export async function renderSilentWav(durationSec: number, outPath: string): Promise<void> {
  await run(
    ffmpegPath,
    [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
      '-t', durationSec.toFixed(3),
      '-c:a', 'pcm_s16le',
      outPath,
    ],
    60_000,
  );
}

/**
 * Renders a solid-color 720x1280 JPEG (placeholder still — testing utility).
 * Codec built-in (mjpeg). Not used in production video pipeline which
 * requires real AI-generated images.
 */
export async function renderSolidJpeg(color: string, outPath: string): Promise<void> {
  await run(
    ffmpegPath,
    [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      '-f', 'lavfi', '-i', `color=c=${color}:s=720x1280`,
      '-frames:v', '1',
      '-q:v', '3',
      outPath,
    ],
    60_000,
  );
}

export interface ComposeScene {
  imagePath: string;
  caption: string;
  durationMs: number;
}

export interface MovingComposeScene {
  clipPath: string;
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

    const fps = 24; // see MEMORY CONTRACT at the encoder call
    const inputs: string[] = [];
    const filters: string[] = [];
    scenes.forEach((s, i) => {
      const sec = (s.durationMs / 1000).toFixed(2);
      /**
       * SCENE-MAPPING FIX (verified bug 2026-08-03, video 019fc96d-…): the
       * old graph ran zoompan with d=<frames per branch> on a 24 fps LOOPED
       * still — d multiplies per INPUT frame, so each branch exploded to
       * (duration × fps × d) frames and the -shortest audio clamp froze the
       * whole video on scene-0's image. Correct stills recipe: -framerate
       * = fps + d=1 (1 zoomed frame per input frame) → branch length is
       * EXACTLY the scene duration, and concat order is honored.
       */
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', sec, '-i', s.imagePath);
      const zoom =
        i % 2 === 0
          ? "z='min(1+0.0005*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
          : "z='max(1.12-0.0005*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
      filters.push(
        `[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=${zoom}:d=1:s=720x1280:fps=${fps},setsar=1,format=yuv420p[v${i}]`,
      );
    });
    const audioIndex = scenes.length;
    const concatLabels = scenes.map((_, i) => `[v${i}]`).join('');
    filters.push(`${concatLabels}concat=n=${scenes.length}:v=1:a=0[vcat]`);
    // fontsdir is given as a DIRECTORY filter arg — quoted for ffmpeg's filter parser.
    filters.push(`[vcat]subtitles='${assPath.replace(/'/g, "'\\''")}':fontsdir='${FONTS_DIR.replace(/'/g, "'\\''")}'[vout]`);

    const videoPath = join(workDir, 'final.mp4');
    /**
     * MEMORY CONTRACT (512Mi containers: default veryfast x264 config
     * OOM-kills the whole API process — verified 2026-08-03). ultrafast +
     * no lookahead/mbtree keeps x264's buffered-frame count near zero; one
     * encoder thread caps thread-stack + row buffers; 24 fps cuts frame
     * volume 25%. Still a real cinema-grade render — just container-safe.
     */
    await run(ffmpegPath, [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      ...inputs,
      '-i', audioPath,
      '-filter_complex', filters.join(';'),
      '-map', '[vout]',
      '-map', `${audioIndex}:a`,
      '-shortest',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '29', '-r', String(fps),
      '-threads', '1',
      '-x264-params', 'sliced-threads=0:sync-lookahead=0:rc-lookahead=0:mbtree=0',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      videoPath,
    ]);
    const durationMs = await probeDurationMs(videoPath);
    return { videoPath, durationMs };
  }

  /**
   * Renders the final cut from REAL moving clips (AI video generation).
   * Every clip is normalized to its exact narration window (trim when long,
   * gentle setpts stretch ≤1.6 when short — stays cinematic), scaled/cropped
   * uniformly, concatenated, captions burned, voiceover muxed. Same OOM-safe
   * encoder contract as the stills path (512Mi containers).
   */
  async composeMoving(scenes: MovingComposeScene[], audioPath: string, workDir: string): Promise<{ videoPath: string; durationMs: number }> {
    if (scenes.length === 0) throw new Error('composeMoving: no scenes');
    await mkdir(workDir, { recursive: true });
    const assPath = join(workDir, 'captions.ass');
    // buildAss keys captions off {caption,durationMs} — shared shape
    await writeFile(assPath, this.buildAss(scenes.map((s) => ({ imagePath: s.clipPath, caption: s.caption, durationMs: s.durationMs }))), 'utf8');

    const fps = 24;
    const clipDurations = await Promise.all(scenes.map((s) => probeDurationMs(s.clipPath)));
    const inputs: string[] = [];
    const filters: string[] = [];
    scenes.forEach((s, i) => {
      const windowS = s.durationMs / 1000;
      const clipS = clipDurations[i]! / 1000;
      const stretch = Math.min(1.6, Math.max(1, windowS / clipS)); // >1 ⇒ gentle slow-mo fill
      const effS = clipS * stretch;
      inputs.push('-i', s.clipPath);
      const speed = stretch > 1 ? `setpts=${stretch.toFixed(3)}*PTS,` : '';
      const trim = effS > windowS + 0.05 ? `,trim=duration=${windowS.toFixed(2)},setpts=PTS-STARTPTS` : '';
      filters.push(
        `[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=${fps},${speed}setsar=1,format=yuv420p${trim}[v${i}]`,
      );
    });
    const audioIndex = scenes.length;
    filters.push(`${scenes.map((_, i) => `[v${i}]`).join('')}concat=n=${scenes.length}:v=1:a=0[vcat]`);
    filters.push(`[vcat]subtitles='${assPath.replace(/'/g, "'\\''")}':fontsdir='${FONTS_DIR.replace(/'/g, "'\\''")}'[vout]`);

    const videoPath = join(workDir, 'final.mp4');
    await run(ffmpegPath, [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      ...inputs,
      '-i', audioPath,
      '-filter_complex', filters.join(';'),
      '-map', '[vout]',
      '-map', `${audioIndex}:a`,
      '-shortest',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '29', '-r', String(fps),
      '-threads', '1',
      '-x264-params', 'sliced-threads=0:sync-lookahead=0:rc-lookahead=0:mbtree=0',
      '-c:a', 'aac', '-b:a', '96k',
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
    await run(ffmpegPath, ['-y', '-nostdin', '-hide_banner', '-v', 'warning', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-b:a', '96k', audioPath], 120_000);
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
