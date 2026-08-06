/**
 * AiService — the real AI providers behind the video engine.
 *
 * Routing:
 *   script  → first configured LLM credential (org vault → env): OpenAI /
 *             Groq / Gemini / OpenRouter / Pollinations-keyed — all REAL.
 *             No credential anywhere → AI_CREDENTIALS_MISSING (terminal).
 *   voice   → OpenAI tts-1 when the resolved credential is OpenAI;
 *             otherwise gTTS (key-less REAL Arabic speech).
 *   visuals → Pollinations image API (still genuinely key-less — verified).
 * Every method THROWS on provider failure: the pipeline marks the video
 * FAILED with the provider message — never a silent fallback, never a mock.
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AppConfig } from '@aca/config';
import { API_CONFIG } from '../../common/redis.provider.js';
import { ApiError } from '../../common/errors/api-error.js';
import { OrgCredentialsService } from '../../common/credentials/org-credentials.service.js';
import { LLM_PROVIDERS, chatCompletion, type LlmCredential } from './providers.js';
import { generateClip, type VideoCredential } from './providers-video.js';
import { renderSilentWav, renderSolidJpeg } from '../videos/compose.service.js';

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
}

const AR_SYSTEM = `أنت كاتب سيناريو محترف لمقاطع فيديو قصيرة (Shorts/Reels) بالعربية الفصحى المبسطة.
أخرج JSON صالحاً فقط (بدون أي نص خارج JSON) بالمخطط:
{"title":string,"description":string,"tags":string[],"hook":string,"cta":string,"scenes":[{"narration":string,"visualPrompt":string}]}
القواعد: title جذاب ≤70 حرفاً؛ description عربية حقيقية مع وسمين؛ tags عربية/إنجليزية 6-12 وسمية؛ hook جملة افتتاحية صادمة؛ cta دعوة متابعة؛ scenes من 4 إلى 6 مشاهد، narration لكل مشهد جملتان قصيرتان للتعليق الصوتي، visualPrompt بالإنجليزية لوصف مشهد سينمائي عمودي (بدون وجوه أشخاص حقيقيين).`;

const EN_SYSTEM = `You are a pro short-form scriptwriter. Output VALID JSON ONLY matching:
{"title":string,"description":string,"tags":string[],"hook":string,"cta":string,"scenes":[{"narration":string,"visualPrompt":string}]}
Rules: catchy title ≤70 chars; real description with 2 hashtags; 6-12 tags; shocking hook; follow CTA; 4-6 scenes, each with two short narration sentences and an ENGLISH cinematic vertical visual prompt (no real human faces).`;

export function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('provider returned no JSON object');
  return raw.slice(start, end + 1);
}

@Injectable()
export class AiService {
  /**
   * Offline demo pipeline (AI_PROVIDER_MODE=demo): deterministic Arabic
   * scripts, silent voiceover track and generated placeholder scene stills —
   * ZERO network, ZERO API keys. Lets a fresh deployment render a real
   * test video end-to-end before any AI provider is configured. Every other
   * mode keeps the fail-closed real-provider behavior.
   */
  private readonly demoMode: boolean = process.env.AI_PROVIDER_MODE === 'demo';

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
    if (this.demoMode) {
      return {
        def: {
          id: 'openai', // reused shape only; never actually called in demo mode
          label: 'Demo (local)',
          model: 'demo',
          kind: 'openai-compatible',
          chatUrl: undefined,
          consoleUrl: '',
          free: true,
          envKey: '',
          strictJson: false,
        },
        apiKey: 'demo',
        source: 'env',
      };
    }
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
          '. (أوقفت Pollinations التوليد المجاني بدون مفتاح — HTTP 402 لأي طلب جديد، وبقيت الصور عبرها مجانية.)',
      });
      (err as ApiError & { terminal?: boolean }).terminal = true;
      throw err;
    }
    return cred;
  }

  async generateScript(req: ScriptRequest, orgId: string): Promise<{ script: VideoScript; provider: string }> {
    if (this.demoMode) return { script: this.demoScript(req), provider: 'demo' };
    const cred = await this.requireLlm(orgId);
    const system = req.language.startsWith('ar') ? AR_SYSTEM : EN_SYSTEM;
    const user = req.language.startsWith('ar')
      ? `الكلمة المفتاحية: «${req.keyword}» — النيتش: ${req.niche} — المدة المستهدفة: ~${req.targetSeconds} ثانية. أخرج JSON الآن.`
      : `Keyword: "${req.keyword}" — niche: ${req.niche} — target length ~${req.targetSeconds}s. Output the JSON now.`;
    const raw = await chatCompletion(cred, { system, user });
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

  /* ----------------------------------------------------------------- VOICE */

  /**
   * Deterministic offline script (AI_PROVIDER_MODE=demo). Satisfies the same
   * VideoScriptSchema contract the real LLMs must pass, so the pipeline below
   * is exercised end-to-end (scenes, captions, durations, assets).
   */
  private demoScript(req: ScriptRequest): VideoScript {
    const keyword = req.keyword.trim() || 'التعلم المستمر';
    const k = keyword;
    const scenes: Array<{ narration: string; visualPrompt: string }> = [
      {
        narration: `هل تساءلت يوماً عن أسرار ${k}؟ في هذا الفيديو سنكشف لك كل ما تحتاج معرفته عن ${k} بطريقة مبسطة وسريعة.`,
        visualPrompt: `cinematic close-up of ${k}, glowing details, deep colors, vertical 9:16`,
      },
      {
        narration: `أولاً، يبدأ كل شيء بفهم الأساسيات. ${k} ليس معقداً كما تظن، بل يحتاج فقط إلى خطوات واضحة ومنظمة.`,
        visualPrompt: `clean infographic illustration about ${k}, bright palette, vertical 9:16`,
      },
      {
        narration: `ثانياً، التطبيق العملي هو سر الإتقان. جرّب بنفسك وستكتشف أن ${k} يصبح أسهل مع كل محاولة جديدة.`,
        visualPrompt: `hands working on a ${k} project, cinematic lighting, vertical 9:16`,
      },
      {
        narration: `وأخيراً، المداومة تصنع الفرق الحقيقي. خصص وقتاً يومياً صغيراً وسوف تتفاجأ بالنتائج الكبيرة على المدى الطويل.`,
        visualPrompt: `abstract golden success path about ${k}, soft glow, vertical 9:16`,
      },
    ];
    return {
      title: `أسرار ${k} التي لا يعرفها معظم الناس`,
      description: `اكتشف ${k} من الصفر إلى الاحتراف في دقائق. شرح مبسط بالعربية مع خطوات عملية وتطبيق مباشر. #تعلم #${k.replace(/\s+/g, '')}`,
      tags: [k, 'تعلم', 'نصائح', 'معلومة', 'تطوير', 'مختصر'],
      hook: `لن تصدق كم هو سهل إتقان ${k} بهذه الطريقة!`,
      cta: 'تابعنا لمزيد من المحتوى المفيد، وفعّل الجرس ليصلك كل جديد.',
      scenes,
    };
  }

  /** Real Arabic voiceover: OpenAI tts when that credential resolved, else gTTS chunked MP3(s). */
  async synthesizeVoice(text: string, language: string, orgId: string): Promise<{ chunks: Buffer[]; provider: string; mime: string }> {
    if (this.demoMode) {
      // Silent track sized from the narration (≈2.2 words/sec reading pace) so
      // scene windows and the final duration stay realistic without any TTS API.
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const secs = Math.max(10, Math.round(wordCount / 2.2));
      const { mkdtemp, readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const wd = await mkdtemp(join(tmpdir(), 'aca-tts-'));
      const out = join(wd, 'voice.wav');
      await renderSilentWav(secs, out);
      const buf = await readFile(out);
      return { chunks: [buf], provider: 'demo', mime: 'audio/wav' };
    }
    const cred = await this.creds.resolveLlm(orgId);
    if (cred?.def.id === 'openai') {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cred.apiKey}` },
        body: JSON.stringify({ model: 'tts-1', voice: this.config.ai.openaiTtsVoice, input: text, response_format: 'mp3' }),
      });
      if (!res.ok) throw new Error(`openai tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { chunks: [Buffer.from(await res.arrayBuffer())], provider: 'openai', mime: 'audio/mpeg' };
    }
    const chunks = await this.gtts(text, language.startsWith('ar') ? 'ar' : 'en');
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

  /* ---------------------------------------------------------------- IMAGES */

  /* ---------------------------------------------------------------- IMAGES */

  /* ----------------------------------------------------------------- CLIPS */

  /**
   * Real moving-picture generation for one scene. The scene still becomes the
   * clip's FIRST FRAME (Runway/Luma/Kling all support it) so the whole cut
   * stays visually coherent. Provider failures THROW (the pipeline marks the
   * video FAILED honestly — stills mode is chosen only when no video key
   * exists at all, before any clip is attempted).
   */
  async resolveVideoCred(orgId: string): Promise<VideoCredential | null> {
    if (this.demoMode) return null; // stills path — no external clip providers offline
    return this.creds.resolveVideo(orgId);
  }

  async generateSceneClip(cred: VideoCredential, visualPrompt: string, firstFrameUrl: string | null, windowSec: number): Promise<Buffer> {
    return generateClip(cred, { prompt: visualPrompt, firstFrameUrl, windowSec });
  }

  /** Public URL of a scene still (passed as FIRST FRAME to clip providers). */
  sceneImageUrl(visualPrompt: string, seed: number): string {
    const prompt = encodeURIComponent(`${visualPrompt}, vertical 9:16 cinematic, high detail, no text, no watermark`);
    return `https://image.pollinations.ai/prompt/${prompt}?width=720&height=1280&seed=${seed}&nologo=true&model=flux`;
  }

  /**
   * Real scene artwork via a 3-provider REAL chain, recorded in metadata:
   *   1. Pollinations flux (AI-generated, key-less — but anonymous tier is
   *      ~1 slot/IP; bursts → 429, and repeated E2E burns can exhaust the
   *      window. Live-measured 2026-08-03).
   *   2. LoremFlickr (real Flickr photo matched to prompt keywords, no key).
   *   3. Openverse (WP-run CC image search JSON API, no key, generous anon).
   * Degradation never means silence or a placeholder: every path yields REAL
   * prompt-relevant photography/artwork downloaded over the wire.
   */
  async generateSceneImage(visualPrompt: string, seed: number): Promise<{ data: Buffer; provider: string }> {
    if (this.demoMode) return this.imageViaDemo(seed);
    const errors: string[] = [];
    try {
      return await this.imageViaPollinations(visualPrompt, seed);
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

  /** Solid-color 720x1280 placeholder still (demo mode only — offline, instant). */
  private async imageViaDemo(seed: number): Promise<{ data: Buffer; provider: 'demo' }> {
    const palette = ['0x0f172a', '0x1e1b4b', '0x0c4a6e', '0x134e4a', '0x4c1d95', '0x9a3412', '0x334155', '0x581c87'];
    const color = palette[Math.abs(seed) % palette.length]!;
    const { mkdtemp, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const wd = await mkdtemp(join(tmpdir(), 'aca-img-'));
    const out = join(wd, 'scene.jpg');
    await renderSolidJpeg(color, out);
    return { data: await readFile(out), provider: 'demo' };
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
          throw new Error(`http ${res.status}`); // 4xx ≠ rate: fail fast
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

  /**
   * English keywords from the (contractually English) visual prompt.
   * Stock-photo fallbacks live or die on these: visuals adjectives
   * ('animated', 'deep', 'futuristic') produce irrelevant photos — verified
   * 2026-08-03 ('animated,creatures' → street-meme photo). So we keep only
   * concrete nouns: drop adjectives/verbs/technical-term noise, prefer the
   * back half of the prompt where subjects conventionally live.
   */
  private static promptKeywords(prompt: string, max = 2): string {
    const stop = new Set([
      // articles/prepositions
      'the', 'a', 'an', 'of', 'in', 'on', 'with', 'and', 'at', 'to', 'for', 'over', 'into', 'from', 'under', 'through',
      // visual/technical adjectives & style noise
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
      .filter((w) => w.length > 3 && !stop.has(w) && !w.endsWith('ing')); // gerunds = actions, not photo subjects
    const picked = words.slice(-max); // subjects tend to close the phrase list
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
