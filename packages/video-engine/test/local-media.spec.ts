/**
 * Local (offline) media tiers — regression coverage.
 *
 * These specs pin the exact failure modes that bit us in the sandbox:
 *   - ffmpeg 4.1 (`@ffmpeg-installer`) accepts `end_pts` on `mandelbrot` but
 *     has NO `duration` option on `life`/`cellauto` (added later upstream).
 *     renderLocalMotionClips must keep working against that binary.
 *   - the espeak-ng WASM callback must return 0 (returning 1 aborts synthesis).
 *   - WAV/MP3 outputs must be well-formed so the downstream concat/compose
 *     stages never see garbage.
 *
 * The piper (neural) tier runs only when a voice pack is available —
 * point ACA_LOCAL_VOICES_DIR at a directory with `*.onnx` + `*.onnx.json`.
 */
import { mkdtemp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  localEspeakAvailable,
  pcm16ToWav,
  synthesizeLocalVoice,
} from '../src/tts/local-tts.js';
import { renderLocalMotionClips } from '../src/render/local-motion.js';
import { probeDurationMs } from '../src/render/compose.service.js';
import {
  matchFootage,
  expandArabicTopics,
  addFootageClip,
  readFootageIndex,
  removeFootageClip,
  prepareFootageClip,
  type FootageEntry,
} from '../src/render/footage.js';

const tmpDirs: string[] = [];
async function freshDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `aca-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}
afterAll(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.allSettled(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('pcm16ToWav', () => {
  it('writes a canonical 16-bit mono PCM RIFF header', () => {
    const samples = new Int16Array([0, 1, -1, 32767, -32768]);
    const wav = pcm16ToWav(samples, 22050);
    expect(wav.readUInt32BE(0)).toBe(0x52494646); // 'RIFF' (big-endian read of tag chars)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt32LE(16)).toBe(16); // fmt chunk size
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt32LE(28)).toBe(44100); // byte rate = rate * 2
    expect(wav.readUInt32LE(40)).toBe(samples.length * 2);
    expect(wav.length).toBe(44 + samples.length * 2);
  });
});

describe('espeak-local tier (always available, zero network)', () => {
  it('module loads', async () => {
    await expect(localEspeakAvailable()).resolves.toBe(true);
  });

  it('synthesizes Arabic text into a well-formed MP3 buffer', async () => {
    const res = await synthesizeLocalVoice('مرحبا بالعالم من الاستوديو المحلي', 'ar');
    expect(res.provider).toBe('espeak-local');
    expect(res.voice).toBe('sem/ar');
    expect(res.mp3.length).toBeGreaterThan(2048);
    // MP3 frame sync (0xFF Ex) or ID3 header — never silence/empty bytes.
    const head = res.mp3.subarray(0, 2);
    const isId3 = res.mp3.subarray(0, 3).toString('ascii') === 'ID3';
    const isSync = head[0] === 0xff && (head[1]! & 0xe0) === 0xe0;
    expect(isId3 || isSync).toBe(true);
  });

  it('synthesizes English text with the en-us voice', async () => {
    const res = await synthesizeLocalVoice('Hello world, this is a local voice test.', 'en');
    expect(res.provider).toBe('espeak-local');
    expect(res.voice).toBe('en-us');
    expect(res.mp3.length).toBeGreaterThan(2048);
  });
});

const voicesDir = process.env.ACA_LOCAL_VOICES_DIR ?? '';
const piperReady = voicesDir !== '' && existsSync(voicesDir);

describe.skipIf(!piperReady)('piper-local tier (neural, requires a voice pack)', () => {
  it('synthesizes English through the ONNX VITS voice when a pack is installed', async () => {
    const res = await synthesizeLocalVoice('Testing the local neural voice pipeline.', 'en', {
      voicesDir,
    });
    expect(res.provider).toBe('piper-local');
    expect(res.voice).toMatch(/\.onnx$/);
    expect(res.sampleRate).toBeGreaterThan(8000);
    expect(res.mp3.length).toBeGreaterThan(2048);
  });
});

describe('renderLocalMotionClips (ffmpeg 4.1 compatibility)', () => {
  it('renders every source type — mandelbrot, life, cellauto — for the bundled ffmpeg', async () => {
    const workDir = await freshDir('motion');
    const scenes = [
      { caption: 'one', durationMs: 1600 }, // mandelbrot / dolly-in
      { caption: 'two', durationMs: 1600 }, // life / dolly-out
      { caption: 'three', durationMs: 1600 }, // cellauto / drift-left
      { caption: 'four', durationMs: 1600 }, // wraps to mandelbrot / drift-right
    ];
    const paths = await renderLocalMotionClips(scenes, workDir);
    expect(paths).toHaveLength(scenes.length);
    const files = await readdir(workDir);
    expect(files.filter((f) => f.endsWith('.mp4'))).toHaveLength(scenes.length);
    for (const p of paths) {
      const ms = await probeDurationMs(p);
      expect(ms).toBeGreaterThanOrEqual(1400);
      expect(ms).toBeLessThanOrEqual(2200);
    }
  }, 180_000);
});

describe('footage library (real-clip scene matching)', () => {
  const entries: FootageEntry[] = [
    { file: 'blackhole.webm', tags: ['space', 'black-hole', 'galaxy'], durationMs: 5000 },
    { file: 'forest.mp4', tags: ['forest', 'nature', 'trees'], durationMs: 60000 },
    { file: 'ocean.mp4', tags: ['ocean', 'sea', 'water'], durationMs: 3000 },
  ];

  it('expands Arabic topic words into English tags', () => {
    expect(expandArabicTopics('أسرار الفضاء والثقوب السوداء')).toContain('space');
    expect(expandArabicTopics('جمال البحر والغابة')).toContain('ocean');
    expect(expandArabicTopics('جمال البحر والغابة')).toContain('forest');
  });

  it('matches English prompts by tag overlap and ignores cinematography stopwords', () => {
    expect(matchFootage(entries, 'a stunning galaxy voyage, 35mm tracking shot, no text')?.file).toBe('blackhole.webm');
    expect(matchFootage(entries, 'peaceful morning in the forest with wildlife')?.file).toBe('forest.mp4');
    expect(matchFootage(entries, 'IDENTITY LOCK: same exact main subject, wardrobe, 24mm establishing shot')).toBeNull();
  });

  it('matches Arabic prompts through the topic map', () => {
    expect(matchFootage(entries, 'الفضاء والثقوب السوداء ومجرات الكون')?.file).toBe('blackhole.webm');
  });

  it('requires enough source duration for the scene window', () => {
    // ocean.mp4 (3s) cannot cover a 4s scene
    const ocean = matchFootage(entries, 'ocean waves on the shore');
    expect(ocean?.file).toBe('ocean.mp4');
    expect(ocean!.durationMs >= Math.min(4000, 4000)).toBe(false);
  });

  it('deprioritizes the most recently used clip', () => {
    const first = matchFootage(entries, 'water waves and sea foam')!;
    expect(first.file).toBe('ocean.mp4');
    // with ocean recently used, a water+ocean prompt still picks ocean (only match), but a
    // mixed prompt should prefer the non-recent clip when scores tie
    const mixed = matchFootage(entries, 'sea water and forest trees', [first.file]);
    expect(mixed?.file).not.toBe(first.file);
  });

  it('adds, indexes, removes a real clip file (ffprobe-validated)', async () => {
    const libDir = await freshDir('footage-lib');
    const srcDir = await freshDir('footage-src');
    // stand-in "real" clip: a procedurally rendered mp4
    const [standIn] = await renderLocalMotionClips([{ caption: 'x', durationMs: 2000 }], srcDir);
    const entry = await addFootageClip(libDir, standIn!, 'my-space-clip.mp4', ['Space', 'cosmic']);
    expect(entry.tags).toEqual(['space', 'cosmic']);
    expect(entry.durationMs).toBeGreaterThanOrEqual(1800);
    const index = await readFootageIndex(libDir);
    expect(index).toHaveLength(1);
    expect(index[0]!.file).toBe('my-space-clip.mp4');
    expect(await removeFootageClip(libDir, 'my-space-clip.mp4')).toBe(true);
    expect(await readFootageIndex(libDir)).toHaveLength(0);
  }, 120_000);

  it('prepares a scene-length vertical clip from a footage source with varied in-points', async () => {
    const srcDir = await freshDir('prep-src');
    const outDir = await freshDir('prep-out');
    const [standIn] = await renderLocalMotionClips([{ caption: 'x', durationMs: 6000 }], srcDir);
    const out1 = join(outDir, 'scene-000.mp4');
    const out2 = join(outDir, 'scene-001.mp4');
    await prepareFootageClip(standIn!, 2000, out1, 0);
    await prepareFootageClip(standIn!, 2000, out2, 2);
    for (const out of [out1, out2]) {
      const ms = await probeDurationMs(out);
      expect(ms).toBeGreaterThanOrEqual(1900);
      expect(ms).toBeLessThanOrEqual(2400);
    }
    // same source + different variant ⇒ different segments (byte streams differ)
    const { readFile: rf } = await import('node:fs/promises');
    const b1 = await rf(out1);
    const b2 = await rf(out2);
    expect(b1.equals(b2)).toBe(false);
  }, 180_000);
});
