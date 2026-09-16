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
