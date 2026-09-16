/**
 * Local motion renderer — offline scene "clips" synthesized with ffmpeg itself.
 *
 * Each narration shot gets its own uniquely-parameterized animated source
 * (endless fractal zoom / scrolling cellular automaton / evolving game of
 * life), softened into a cinematic light field, tinted per-scene from a
 * curated palette and given real camera movement (animated zoom/pan) plus film
 * grain and a vignette. The clips then feed the exact same `composeMoving`
 * path as cloud AI clips — same tempo-fit, same burned captions, same
 * loudness pipeline — so an offline or air-gapped installation still produces
 * a real 9:16 motion video with synchronized narration, never a static
 * slideshow.
 *
 * Enabled via ACA_LOCAL_GENERATION=1 when no moving-video provider key exists.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { run, resolveFfmpegPath } from './compose.service.js';

export interface LocalMotionScene {
  caption: string;
  durationMs: number;
}

export interface LocalMotionOptions {
  width?: number;
  height?: number;
  fps?: number;
}

/** Cinematic palettes — one per shot, cycling; distinct hue triads per scene. */
const PALETTES: Array<[string, string, string]> = [
  ['#0b1026', '#1f3a93', '#4fc3f7'], // deep night blue
  ['#12071f', '#5b2c83', '#e91e8c'], // violet dusk
  ['#001a14', '#0f6f5c', '#35e0b0'], // emerald
  ['#1a0a05', '#8a3b0f', '#ffb35c'], // amber ember
  ['#0d001a', '#3d1f7a', '#8f6bff'], // indigo
  ['#16060e', '#7a1f4a', '#ff5c8a'], // rose
  ['#04121a', '#0f517a', '#4fc3f7'], // teal sea
  ['#140f05', '#7a5a10', '#ffd76c'], // gold
];

const MOVEMENTS = ['dolly-in', 'dolly-out', 'drift-left', 'drift-right'] as const;
const SOURCES = ['mandelbrot', 'life', 'cellauto'] as const;

function cameraFilter(movement: (typeof MOVEMENTS)[number], fps: number, durationSec: number): string {
  // zoompan upscales from the 450x800 working canvas to the final 720x1280 —
  // the earlier gaussian blur makes the upscale visually seamless.
  const totalFrames = Math.max(2, Math.round(durationSec * fps));
  switch (movement) {
    case 'dolly-in':
      return `zoompan=z='min(1+0.90*on/${totalFrames},1.9)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=${fps}`;
    case 'dolly-out':
      return `zoompan=z='max(1.9-0.90*on/${totalFrames},1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=${fps}`;
    case 'drift-left':
      return `zoompan=z=1.35:x='(iw-iw/zoom)*max(0, 1-1.8*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=${fps}`;
    case 'drift-right':
    default:
      return `zoompan=z=1.35:x='(iw-iw/zoom)*min(1, 1.8*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=${fps}`;
  }
}

/**
 * lavfi source expression for the scene's animated base layer.
 * NOTE: ffmpeg 4.1's `life`/`cellauto` sources have no `duration` option
 * (only `mandelbrot` has `end_pts`) — all three run indefinitely, so clip
 * length is capped by the `-t` output option instead.
 */
function baseSource(source: (typeof SOURCES)[number], durationSec: string, fps: number): string {
  switch (source) {
    case 'mandelbrot':
      // endless fractal zoom — continuous, hypnotic, genuinely cinematic once softened
      return `mandelbrot=s=360x640:rate=${fps}:end_pts=${durationSec}:maxiter=60:start_scale=3:end_scale=0.3`;
    case 'life':
      // evolving organic colony
      return `life=s=225x400:mold=10:ratio=0.12:rate=${fps}`;
    case 'cellauto':
    default:
      // scrolling elementary cellular automaton (rule 110 — endless structure)
      return `cellauto=s=225x400:rule=110:scroll=1:stitch=0:rate=${fps}`;
  }
}

/**
 * Render one silent motion clip per scene into `workDir` (scene-000.mp4, …).
 * Returns the clip paths aligned with the input scenes (unique shot per scene).
 */
export async function renderLocalMotionClips(
  scenes: LocalMotionScene[],
  workDir: string,
  options: LocalMotionOptions = {},
): Promise<string[]> {
  if (scenes.length === 0) throw new Error('local-motion: no scenes');
  const fps = options.fps ?? 24;
  await mkdir(workDir, { recursive: true });
  const ffmpeg = resolveFfmpegPath();
  const outPaths: string[] = [];

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i]!;
    const durationSec = Math.max(1.0, scene.durationMs / 1000);
    const dur = durationSec.toFixed(3);
    const [, c1, c2] = PALETTES[i % PALETTES.length]!;
    const movement = MOVEMENTS[i % MOVEMENTS.length]!;
    const source = SOURCES[i % SOURCES.length]!;
    const outPath = join(workDir, `scene-${String(i).padStart(3, '0')}.mp4`);

    // Soften the animated source into a broad light field, tint it toward the
    // scene palette, then layer a drifting deep-color veil under it. Working
    // resolution stays small (450x800) — the camera zoompan upscales to the
    // final 720x1280, and the gaussian blur makes that seamless.
    const filters = [
      `[0:v]scale=450x800,gblur=sigma=13,colorchannelmixer=rr=0.42:gg=0.46:bb=0.62[organic]`,
      `color=c=${c1}:s=450x800:r=${fps},format=yuv420p[veil]`,
      `[veil][organic]blend=all_mode=screen:all_opacity=0.62[base]`,
      `[base]eq=brightness=-0.04:saturation=1.12[tinted]`,
      `[tinted]${cameraFilter(movement, fps, durationSec)},format=yuv420p[cam]`,
      `[cam]vignette=angle=PI/4.4,noise=alls=4:allf=t+u,drawbox=c=${c2}@0.06:t=fill[vout]`,
    ].join(';');

    await run(ffmpeg, [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      '-f', 'lavfi', '-i', baseSource(source, dur, fps),
      '-filter_complex', filters,
      '-map', '[vout]',
      '-t', dur,
      '-r', String(fps),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
      '-pix_fmt', 'yuv420p',
      '-threads', '4',
      outPath,
    ], 240_000);
    outPaths.push(outPath);
  }
  return outPaths;
}
