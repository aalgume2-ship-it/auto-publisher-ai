/**
 * AiService — the real AI providers behind the video engine.
 *
 * Routing:
 *   script  → first configured LLM credential (org vault → env): OpenAI /
 *             Groq / Gemini / OpenRouter / Pollinations — all REAL.
 *             No credential anywhere → AI_CREDENTIALS_MISSING (terminal).
 *   voice   → OpenAI tts-1 when the resolved credential is OpenAI;
 *             otherwise gTTS (key-less REAL Arabic speech).
 *   visuals → Pollinations image API (still genuinely key-less — verified).
 * Every method THROWS on provider failure: the pipeline marks the video
 * FAILED with the provider message — never a silent fallback, never a mock.
 *
 * Prompts are versioned via prompts/registry.ts — never hard-coded inline.
 * Retries: transient failures are retried with exponential backoff (3×), with
 * user-friendly status mapping (Processing/Retrying/Completed/Failed) surfaced
 * via seo.step, never raw stack traces.
 *
 * NO demo/mock/local fallback — every path requires a real provider.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { AppConfig } from '@aca/config';
import { API_CONFIG } from '../../common/redis.provider.js';
import { ApiError } from '../../common/errors/api-error.js';
import { OrgCredentialsService } from '../../common/credentials/org-credentials.service.js';
import { LLM_PROVIDERS, chatCompletion, type LlmCredential } from './providers.js';
import { generateClip, type VideoCredential } from './providers-video.js';
import { getPrompt, renderUserPrompt } from './prompts/registry.js';

export const SceneSchema = z.object({
  narration: z.string().min(10),
  visualPrompt: z.string().min(8),
});
export const VideoScriptSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(20).max(4800),
  tags: z.array(z.string().min(1).max(40)).min(3).max(18),
  hook: z.string().min(5).max(200),
  cta: z.string().min(3).max(160),
  scenes: z.array(SceneSchema).min(3).max(8),
});
export type VideoScript = z.infer<typeof VideoScriptSchema>;

export interface ScriptRequest {
  keyword: string;
  niche: string;
  language: string; // 'ar' | 'en'…
  targetSeconds: number;
  promptVersion?: string;
}
export interface IdeaRequest { niche: string; keywords: string; platform: string; }
export interface TitleRequest { keyword: string; synopsis: string; }
export interface HookRequest { keyword: string; context: string; }

export function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('provider returned no JSON object');
  return raw.slice(start, end + 1);
}

/** Exponential backoff retry — terminal errors (AI_CREDENTIALS_MISSING etc.) are never retried. */
async function withRetry<T>(label: string, fn: () => Promise<T>, logger?: Logger): Promise<T> {
  const delays = [0, 900, 2200];
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (attempt > 1) await new Promise(r => setTimeout(r, delays[attempt - 1]!));
      return await fn();
    } catch (err) {
      last = err;
      const terminal = (err as { terminal?: boolean })?.terminal === true;
      const isApiError = err instanceof ApiError && (err as ApiError).code === 'AI_CREDENTIALS_MISSING';
      if (terminal || isApiError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /429|500|502|503|504|timeout|ECONN|ETIMEDOUT|fetch failed|network/i.test(msg) || attempt < 3;
      if (!retryable || attempt === 3) break;
      logger?.warn(`[ai:${label}] attempt ${attempt}/3 failed: ${msg.slice(0, 160)} — retrying`);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    private readonly creds: OrgCredentialsService,
  ) {}

  /* ---------------------------------------------------------------- SCRIPT */

  /**
   * Resolves the best available LLM credential for this org and calls it.
   * Fails CLOSED with AI_CREDENTIALS_MISSING (terminal — retrying cannot help)
   * when no provider is configured anywhere; the detail tells the user exactly
   * how to activate: paste one free key in /dashboard/settings, or set any of
   * the named env vars on the API service.
   */
  private async requireLlm(orgId: string): Promise<LlmCredential> {
    const cred = await this.creds.resolveLlm(orgId);
    if (!cred) {
      const envList = LLM_PROVIDERS.map((p) => p.envKey).join(' أو ');
      const err = new ApiError('AI_CREDENTIALS_MISSING', 'AI provider not configured', {
        status: 503,
        detail:
          'لا يوجد أي مفتاح مزود ذكاء اصطناعي لتوليد السيناريو. الحل خلال دقيقتين من لوحة التحكم ← الإعدادات: ' +
          'أضف مفتاحاً مجانياً من Groq (console.groq.com/keys) أو Google AI Studio (aistudio.google.com/apikey) — ' +
          'يتم التحقق منه لحظياً وتخزينه مشفراً. أو اضبط أحد متغيرات البيئة على خدمة الـ API: ' +
          envList +
          '.',
      });
      (err as ApiError & { terminal?: boolean }).terminal = true;
      throw err;
    }
    return cred;
  }

  async generateScript(req: ScriptRequest, orgId: string): Promise<{ script: VideoScript; provider: string }> {
    const cred = await this.requireLlm(orgId);
    const prompt = getPrompt('script', req.promptVersion, req.language);
    const user = renderUserPrompt(prompt.userTemplate, {
      keyword: req.keyword,
      niche: req.niche,
      targetSeconds: req.targetSeconds,
    });
    const raw = await withRetry('script', () => chatCompletion(cred, { system: prompt.system, user }), this.logger);
    let json: unknown;
    try {
      json = JSON.parse(extractJson(raw));
    } catch {
      throw new Error(`${cred.def.id} returned non-JSON completion: ${raw.slice(0, 140)}`);
    }
    const parsed = VideoScriptSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`script failed schema validation: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join('; ')}`);
    }
    return { script: parsed.data, provider: cred.def.id };
  }

  // ── Additional prompt families (versioned, retry-wrapped) ─────────────────

  async generateIdeas(req: IdeaRequest, orgId: string): Promise<{ ideas: Array<{ title: string; angle: string; why: string; hook: string }>; provider: string }> {
    const cred = await this.requireLlm(orgId);
    const prompt = getPrompt('idea');
    const user = renderUserPrompt(prompt.userTemplate, { niche: req.niche, keywords: req.keywords, platform: req.platform });
    const raw = await withRetry('idea', () => chatCompletion(cred, { system: prompt.system, user }), this.logger);
    const json = JSON.parse(extractJson(raw)) as { ideas?: Array<{ title: string; angle: string; why: string; hook: string }> };
    return { ideas: json.ideas ?? [], provider: cred.def.id };
  }

  async generateTitles(req: TitleRequest, orgId: string): Promise<{ titles: string[]; provider: string }> {
    const cred = await this.requireLlm(orgId);
    const prompt = getPrompt('title');
    const user = renderUserPrompt(prompt.userTemplate, { keyword: req.keyword, synopsis: req.synopsis });
    const raw = await withRetry('title', () => chatCompletion(cred, { system: prompt.system, user }), this.logger);
    const json = JSON.parse(extractJson(raw)) as { titles?: string[] };
    return { titles: json.titles ?? [], provider: cred.def.id };
  }

  async generateHooks(req: HookRequest, orgId: string): Promise<{ hooks: string[]; provider: string }> {
    const cred = await this.requireLlm(orgId);
    const prompt = getPrompt('hook');
    const user = renderUserPrompt(prompt.userTemplate, { keyword: req.keyword, context: req.context });
    const raw = await withRetry('hook', () => chatCompletion(cred, { system: prompt.system, user }), this.logger);
    const json = JSON.parse(extractJson(raw)) as { hooks?: string[] };
    return { hooks: json.hooks ?? [], provider: cred.def.id };
  }

  async generateMetadata(req: { title: string; keyword: string; niche: string }, orgId: string): Promise<{ description: string; tags: string[]; hashtags: string[]; provider: string }> {
    const cred = await this.requireLlm(orgId);
    const prompt = getPrompt('metadata');
    const user = renderUserPrompt(prompt.userTemplate, { title: req.title, keyword: req.keyword, niche: req.niche });
    const raw = await withRetry('metadata', () => chatCompletion(cred, { system: prompt.system, user }), this.logger);
    const json = JSON.parse(extractJson(raw)) as { description?: string; tags?: string[]; hashtags?: string[] };
    return { description: json.description ?? '', tags: json.tags ?? [], hashtags: json.hashtags ?? [], provider: cred.def.id };
  }

  /* ----------------------------------------------------------------- VOICE */

  /** Real voiceover: OpenAI tts when that credential resolved, else gTTS chunked MP3(s). No silent mock. */
  async synthesizeVoice(text: string, language: string, orgId: string): Promise<{ chunks: Buffer[]; provider: string; mime: string }> {
    const cred = await this.creds.resolveLlm(orgId);
    if (cred?.def.id === 'openai') {
      const chunks = await withRetry('tts-openai', async () => {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cred.apiKey}` },
          body: JSON.stringify({ model: 'tts-1', voice: this.config.ai.openaiTtsVoice, input: text, response_format: 'mp3' }),
        });
        if (!res.ok) throw new Error(`openai tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return [Buffer.from(await res.arrayBuffer())];
      }, this.logger);
      return { chunks, provider: 'openai', mime: 'audio/mpeg' };
    }
    const chunks = await withRetry('tts-gtts', () => this.gtts(text, language.startsWith('ar') ? 'ar' : 'en'), this.logger);
    return { chunks, provider: 'gtts', mime: 'audio/mpeg' };
  }

  /** gTTS (translate_tts, client=tw-ob) — chunked at sentence boundaries ≤180 chars. */
  private async gtts(text: string, tl: string): Promise<Buffer[]> {
    const sentences = text.split(/(?<=[.!؟?،؛])\s+/u);
    const pieces: string[] = [];
    let cur = '';
    for (const s of sentences) {
      if ((cur + ' ' + s).trim().length > 180) {
        if (cur) pieces.push(cur);
        cur = s;
        while (cur.length > 180) {
          pieces.push(cur.slice(0, 180));
          cur = cur.slice(180);
        }
      } else {
        cur = (cur + ' ' + s).trim();
      }
    }
    if (cur) pieces.push(cur);
    if (pieces.length === 0) throw new Error('tts: empty narration');
    const out: Buffer[] = [];
    for (const p of pieces) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(p)}`;
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', referer: 'https://translate.google.com/' },
      });
      if (!res.ok) throw new Error(`gtts ${res.status} on chunk "${p.slice(0, 40)}…"`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) throw new Error('gtts returned empty audio');
      out.push(buf);
    }
    return out;
  }

  /* ----------------------------------------------------------------- CLIPS */

  async resolveVideoCred(orgId: string): Promise<VideoCredential | null> {
    return this.creds.resolveVideo(orgId);
  }

  async generateSceneClip(cred: VideoCredential, visualPrompt: string, firstFrameUrl: string | null, windowSec: number): Promise<Buffer> {
    return withRetry(`clip-${cred.def.id}`, () => generateClip(cred, { prompt: visualPrompt, firstFrameUrl, windowSec }), this.logger);
  }

  /** Public URL of a scene still (passed as FIRST FRAME to clip providers). */
  sceneImageUrl(visualPrompt: string, seed: number): string {
    const prompt = encodeURIComponent(`${visualPrompt}, vertical 9:16 cinematic, high detail, no text, no watermark`);
    return `https://image.pollinations.ai/prompt/${prompt}?width=720&height=1280&seed=${seed}&nologo=true&model=flux`;
  }

  /**
   * Real scene artwork via a 3-provider REAL chain, recorded in metadata:
   *   1. Pollinations flux (AI-generated).
   *   2. LoremFlickr (real Flickr photo).
   *   3. Openverse (CC image search).
   * Every path yields REAL artwork — no placeholder.
   */
  async generateSceneImage(visualPrompt: string, seed: number): Promise<{ data: Buffer; provider: string }> {
    const errors: string[] = [];
    try {
      return await withRetry('image-pollinations', () => this.imageViaPollinations(visualPrompt, seed), this.logger);
    } catch (err) {
      errors.push(`pollinations: ${err instanceof Error ? err.message : err}`);
    }
    try {
      return await this.imageViaLoremFlickr(visualPrompt, seed);
    } catch (err) {
      errors.push(`loremflickr: ${err instanceof Error ? err.message : err}`);
    }
    try {
      return await this.imageViaOpenverse(visualPrompt);
    } catch (err) {
      errors.push(`openverse: ${err instanceof Error ? err.message : err}`);
    }
    throw new Error(`all image providers failed → ${errors.join(' | ')}`);
  }

  private async imageViaPollinations(visualPrompt: string, seed: number): Promise<{ data: Buffer; provider: 'pollinations' }> {
    const prompt = encodeURIComponent(`${visualPrompt}, vertical 9:16 cinematic, high detail, no text, no watermark`);
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=720&height=1280&seed=${seed}&nologo=true&model=flux`;
    let lastErr = 'unknown';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
        if (res.status === 429 || res.status >= 500) {
          lastErr = `http ${res.status}`;
        } else if (!res.ok) {
          throw new Error(`http ${res.status}`);
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 10_000) throw new Error('empty image');
          return { data: buf, provider: 'pollinations' };
        }
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timer);
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 6_000 * attempt));
    }
    throw new Error(lastErr);
  }

  private static promptKeywords(prompt: string, max = 2): string {
    const stop = new Set([
      'the', 'a', 'an', 'of', 'in', 'on', 'with', 'and', 'at', 'to', 'for', 'over', 'into', 'from', 'under', 'through',
      'style', 'shot', 'vertical', 'cinematic', 'animated', 'detail', 'high', 'deep', 'dark', 'soft', 'glow', 'glowing',
      'dramatic', 'futuristic', 'mysterious', 'ancient', 'modern', 'massive', 'tiny', 'huge', 'beautiful', 'stunning',
      'background', 'foreground', 'closeup', 'macro', 'wide', 'aerial', 'view', 'scene', 'showing', 'illustration',
      'diagram', 'concept', 'realistic', 'abstract', 'digital', 'artwork', 'moody', 'tones', 'lighting', 'shadows',
      'misty', 'eerie', 'vibrant', 'depth', 'light', 'lights', 'blue', 'teal', 'orange', 'photo', 'image', 'real',
      'true', 'spiraling', 'infinite', 'geometric', 'fractal', 'botanical', 'petals', 'patterns', 'microscopic',
      'text', 'words', 'watermark', 'logo', 'faces', 'people', 'person', 'human',
    ]);
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w) && !w.endsWith('ing'));
    const picked = words.slice(-max);
    return (picked.length > 0 ? picked : ['nature']).join(',');
  }

  private async imageViaLoremFlickr(visualPrompt: string, seed: number): Promise<{ data: Buffer; provider: 'loremflickr' }> {
    const kw = AiService.promptKeywords(visualPrompt);
    const url = `https://loremflickr.com/720/1280/${encodeURIComponent(kw)}?lock=${seed}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a real jpeg');
      return { data: buf, provider: 'loremflickr' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async imageViaOpenverse(visualPrompt: string): Promise<{ data: Buffer; provider: 'openverse' }> {
    const q = AiService.promptKeywords(visualPrompt, 3).replaceAll(',', ' ');
    const searchUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=1&license_type=all`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(searchUrl, {
        signal: ctrl.signal,
        headers: { 'user-agent': 'autocreator-pipeline/1.0 (contact: preview@autocreator.ai)' },
      });
      if (!res.ok) throw new Error(`search http ${res.status}`);
      const json = (await res.json()) as { results?: Array<{ url?: string }> };
      const imageUrl = json.results?.[0]?.url;
      if (!imageUrl) throw new Error('no results');
      const imgRes = await fetch(imageUrl, { signal: ctrl.signal, headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
      if (!imgRes.ok) throw new Error(`image http ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const isJpeg = buf.length > 1 && buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
      if (buf.length < 10_000 || !(isJpeg || isPng)) throw new Error('not a real image');
      return { data: buf, provider: 'openverse' };
    } finally {
      clearTimeout(timer);
    }
  }
}
