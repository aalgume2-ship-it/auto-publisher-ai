/**
 * Local (offline) voice synthesis — the zero-network tier of the TTS chain.
 *
 * Order of preference inside this module:
 *   1. `piper-local`  — neural VITS voices (ONNX) dropped into the local voices
 *                       directory (`*.onnx` + `*.onnx.json`). Phonemization via
 *                       the `piper-phonemize` WASM build (espeak-ng data is
 *                       bundled inside that package), inference via
 *                       `onnxruntime-node`. Works for ANY Piper voice pack —
 *                       Arabic (e.g. ar_JO-kareem-medium) or English.
 *   2. `espeak-local` — eSpeak-NG compiled to WASM
 *                       (`@echogarden/espeak-ng-emscripten`, full espeak-ng
 *                       data incl. Arabic `sem/ar` bundled). Robotic but real
 *                       speech, always available, zero configuration.
 *
 * Output: a single MP3 buffer (converted through the platform ffmpeg) so the
 * downstream pipeline (concatAudio → composeMoving) needs no special casing.
 *
 * This module is deliberately last in the provider chain: cloud neural voices
 * stay preferred when keys/network exist; local mode guarantees the pipeline
 * can always produce a narrated video (air-gapped installs, keyless demos,
 * API outages).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger, type Logger } from '@aca/logger';
import { run, resolveFfmpegPath } from '../render/compose.service.js';

const logger: Logger = createLogger({ service: 'video-engine', level: 'info' }).child({ module: 'local-tts' });

export interface LocalVoiceResult {
  mp3: Buffer;
  provider: 'piper-local' | 'espeak-local';
  sampleRate: number;
  voice: string;
}

/* ───────────────────────── WAV helpers ───────────────────────── */

export function pcm16ToWav(samples: Int16Array, sampleRate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) buf.writeInt16LE(samples[i]!, 44 + i * 2);
  return buf;
}

async function wavToMp3(wav: Buffer, workDir: string): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises');
  await mkdir(workDir, { recursive: true });
  const inPath = join(workDir, `local-tts-${Date.now()}.wav`);
  const outPath = join(workDir, `local-tts-${Date.now()}.mp3`);
  await writeFile(inPath, wav);
  try {
    await run(resolveFfmpegPath(), [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      '-i', inPath, '-af', 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=9',
      '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', outPath,
    ], 120_000);
    return await readFile(outPath);
  } finally {
    await Promise.allSettled([
      import('node:fs/promises').then((fs) => fs.rm(inPath, { force: true })),
      import('node:fs/promises').then((fs) => fs.rm(outPath, { force: true })),
    ]);
  }
}

/* ───────────────────── eSpeak-NG (WASM) tier ───────────────────── */

interface EspeakModule {
  eSpeakNGWorker: new () => {
    get_samplerate(): number;
    set_voice(voice: string): void;
    set_rate(rate: number): void;
    set_pitch(pitch: number): void;
    set_volume(volume: number): void;
    synthesize(text: string, cb: (audio: Int16Array, events: unknown[]) => number): void;
    list_voices(): { identifier: string; languages: { name: string }[] }[];
  };
}

let espeakModulePromise: Promise<EspeakModule> | null = null;

async function loadEspeak(): Promise<EspeakModule> {
  if (!espeakModulePromise) {
    espeakModulePromise = (async () => {
      const mod = (await import('@echogarden/espeak-ng-emscripten')) as unknown as {
        default: () => Promise<EspeakModule>;
      };
      return await mod.default();
    })();
  }
  return espeakModulePromise;
}

const ESPEAK_VOICE_BY_LANG: Record<string, string> = {
  ar: 'sem/ar',
  en: 'en-us',
};
const ESPEAK_RATE_BY_LANG: Record<string, number> = {
  ar: 150,
  en: 165,
};

async function synthesizeWithEspeak(text: string, language: string): Promise<{ samples: Int16Array; sampleRate: number; voice: string }> {
  const mod = await loadEspeak();
  const espeak = new mod.eSpeakNGWorker();
  const lang = language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  const voice = ESPEAK_VOICE_BY_LANG[lang]!;
  espeak.set_voice(voice);
  espeak.set_rate(ESPEAK_RATE_BY_LANG[lang]!);
  espeak.set_pitch(lang === 'ar' ? 42 : 48);
  espeak.set_volume(95);

  const chunks: Int16Array[] = [];
  espeak.synthesize(text, (audio) => {
    if (audio && audio.length > 0) chunks.push(Int16Array.from(audio));
    return 0; // 0 = continue synthesis (1 aborts — espeak convention)
  });

  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total < 64) throw new Error('espeak-local: synthesis produced no audio');
  const merged = new Int16Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return { samples: merged, sampleRate: espeak.get_samplerate(), voice };
}

/* ───────────────────── Piper (neural ONNX) tier ───────────────────── */

interface PiperVoiceConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
  phoneme_id_map: Record<string, number[]>;
}

interface PiperVoice {
  onnxPath: string;
  config: PiperVoiceConfig;
  name: string;
}

async function scanVoicesDir(voicesDir: string, language: string): Promise<PiperVoice | null> {
  if (!voicesDir || !existsSync(voicesDir)) return null;
  const entries = await readdir(voicesDir);
  const jsons = entries.filter((f) => f.endsWith('.onnx.json'));
  const wantArabic = language.toLowerCase().startsWith('ar');
  let fallback: PiperVoice | null = null;
  for (const jsonName of jsons) {
    const onnxName = jsonName.slice(0, -'.onnx.json'.length) + '.onnx';
    const onnxPath = join(voicesDir, onnxName);
    if (!existsSync(onnxPath)) continue;
    try {
      const config = JSON.parse(await readFile(join(voicesDir, jsonName), 'utf8')) as PiperVoiceConfig;
      if (!config?.phoneme_id_map || !config?.audio?.sample_rate || !config?.espeak?.voice) continue;
      const voice: PiperVoice = { onnxPath, config, name: onnxName };
      const espeakVoice = config.espeak.voice.toLowerCase();
      const isArabic = espeakVoice.startsWith('ar');
      if (isArabic === wantArabic) return voice; // language match wins
      if (!fallback && espeakVoice.startsWith('en') === !wantArabic) fallback = voice;
    } catch {
      // malformed voice config — skip it
    }
  }
  return fallback;
}

import type { InferenceSession, Tensor } from 'onnxruntime-node';

type OrtModule = { InferenceSession: typeof InferenceSession; Tensor: typeof Tensor };

let ortModulePromise: Promise<OrtModule> | null = null;

async function loadOrt(): Promise<OrtModule> {
  if (!ortModulePromise) {
    ortModulePromise = import('onnxruntime-node') as Promise<OrtModule>;
    ortModulePromise.catch(() => {
      ortModulePromise = null; // allow retry on next synthesis
    });
  }
  return ortModulePromise;
}

async function synthesizeWithPiper(text: string, voice: PiperVoice): Promise<{ samples: Float32Array; sampleRate: number; voiceName: string }> {
  const { phonemizeToString } = await import('piper-phonemize');
  const sentences = phonemizeToString(text, voice.config.espeak.voice);
  if (!sentences || sentences.length === 0) throw new Error('piper-local: phonemization returned nothing');

  const ort = await loadOrt();
  const session = await ort.InferenceSession.create(voice.onnxPath);

  const idMap = voice.config.phoneme_id_map;
  const bos = idMap['^'] ?? [1];
  const eos = idMap['$'] ?? [2];
  const inf = voice.config.inference ?? {};
  const sampleRate = voice.config.audio.sample_rate;

  const audioParts: Float32Array[] = [];
  for (const sentence of sentences) {
    const ids: number[] = [...bos];
    for (const ch of sentence) {
      const mapped = idMap[ch];
      if (mapped) ids.push(...mapped);
    }
    ids.push(...eos);
    if (ids.length <= bos.length + eos.length) continue;

    const input = new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
    const lengths = new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]);
    const scales = new ort.Tensor(
      'float32',
      Float32Array.from([inf.noise_scale ?? 0.667, inf.length_scale ?? 1.0, inf.noise_w ?? 0.8]),
      [3],
    );
    const out = await session.run({ input, input_lengths: lengths, scales });
    const audio = out[session.outputNames[0]!]!.data;
    if (audio instanceof Float32Array && audio.length > 0) audioParts.push(audio);
  }
  const total = audioParts.reduce((n, p) => n + p.length, 0);
  if (total < 64) throw new Error('piper-local: model produced no audio');
  const merged = new Float32Array(total);
  let offset = 0;
  for (const p of audioParts) {
    merged.set(p, offset);
    offset += p.length;
  }
  return { samples: merged, sampleRate, voiceName: voice.name };
}

function float32ToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const v = Math.max(-1, Math.min(1, input[i]!));
    out[i] = Math.round(v * 32767);
  }
  return out;
}

/* ───────────────────────── public API ───────────────────────── */

export interface LocalTtsOptions {
  voicesDir?: string | undefined;
}

/**
 * Synthesize `text` fully offline. Throws only when both local tiers fail —
 * callers keep it as the final fallback in the provider chain.
 */
export async function synthesizeLocalVoice(
  text: string,
  language: string,
  options: LocalTtsOptions = {},
): Promise<LocalVoiceResult> {
  const narration = text.trim();
  if (!narration) throw new Error('local-tts: empty narration');

  // Tier 1 — neural Piper voice packs (when the operator dropped one in).
  if (options.voicesDir) {
    try {
      const voice = await scanVoicesDir(options.voicesDir, language);
      if (voice) {
        const { samples, sampleRate, voiceName } = await synthesizeWithPiper(narration, voice);
        const wav = pcm16ToWav(float32ToPcm16(samples), sampleRate);
        const mp3 = await wavToMp3(wav, join(tmpdir(), 'aca-local-tts'));
        logger.info({ module: 'local-tts', voice: voiceName, bytes: mp3.length }, 'local.voice.piper');
        return { mp3, provider: 'piper-local', sampleRate, voice: voiceName };
      }
    } catch (err) {
      logger.warn(
        { module: 'local-tts', error: err instanceof Error ? err.message : String(err) },
        'piper-local unavailable; trying espeak-local',
      );
    }
  }

  // Tier 2 — always-available espeak-ng WASM (Arabic `sem/ar`, English `en-us`).
  const { samples, sampleRate, voice } = await synthesizeWithEspeak(narration, language);
  const wav = pcm16ToWav(samples, sampleRate);
  const mp3 = await wavToMp3(wav, join(tmpdir(), 'aca-local-tts'));
  logger.info({ module: 'local-tts', voice, bytes: mp3.length }, 'local.voice.espeak');
  return { mp3, provider: 'espeak-local', sampleRate, voice };
}

/** Used by tests / health checks without running a synthesis. */
export async function localEspeakAvailable(): Promise<boolean> {
  try {
    await loadEspeak();
    return true;
  } catch {
    return false;
  }
}

// keep the spawn import referenced for future direct-binary tiers
void spawn;
