/**
 * AiService — the real AI providers behind the video engine.
 *
 * Routing (Roadmap: revenue-first, zero-key default):
 *   OPENAI_API_KEY set   → OpenAI chat-completions (script) + tts-1 (voice)
 *   default (no keys)    → Pollinations text/image APIs + gTTS — key-less but
 *                          100% REAL generation (network calls, real artifacts).
 * Every method THROWS on provider failure: the pipeline marks the video
 * FAILED with the provider message — never a silent fallback, never a mock.
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AppConfig } from '@aca/config';
import { API_CONFIG } from '../../common/redis.provider.js';

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

async function fetchJson(url: string, init: RequestInit, timeoutMs = 60_000): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

export function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('provider returned no JSON object');
  return raw.slice(start, end + 1);
}

@Injectable()
export class AiService {
  constructor(@Inject(API_CONFIG) private readonly config: AppConfig) {}

  /* ---------------------------------------------------------------- SCRIPT */

  async generateScript(req: ScriptRequest): Promise<{ script: VideoScript; provider: string }> {
    const system = req.language.startsWith('ar') ? AR_SYSTEM : EN_SYSTEM;
    const user = `الكلمة المفتاحية: «${req.keyword}» — النيتش: ${req.niche} — المدة المستهدفة: ~${req.targetSeconds} ثانية. أخرج JSON الآن.`;
    const raw = this.config.ai.openaiApiKey
      ? await this.scriptViaOpenAi(system, user)
      : await this.scriptViaPollinations(system, user);
    const parsed = VideoScriptSchema.safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) {
      throw new Error(`script failed schema validation: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join('; ')}`);
    }
    return { script: parsed.data, provider: this.config.ai.openaiApiKey ? 'openai' : 'pollinations' };
  }

  private async scriptViaOpenAi(system: string, user: string): Promise<string> {
    const { status, body } = await fetchJson(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.ai.openaiApiKey}` },
        body: JSON.stringify({
          model: this.config.ai.openaiModel,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.8,
        }),
      },
      90_000,
    );
    const msg = (body as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }) ?? {};
    if (status !== 200 || !msg.choices?.[0]?.message?.content) {
      throw new Error(`openai chat ${status}: ${msg.error?.message ?? 'empty completion'}`);
    }
    return msg.choices[0].message.content;
  }

  /**
   * Pollinations text — GET form (their POST/chat endpoint now returns 402 on
   * the free tier; the GET /{prompt}?system=… endpoint is the stable free
   * route). Returns the raw completion text; the caller extracts the JSON.
   */
  private async scriptViaPollinations(system: string, user: string): Promise<string> {
    const url =
      `https://text.pollinations.ai/${encodeURIComponent(user)}` +
      `?model=openai&system=${encodeURIComponent(system)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
      const text = await res.text();
      if (res.status !== 200 || text.trim().length < 40) {
        throw new Error(`pollinations text ${res.status}: provider returned ${text.slice(0, 160) || 'empty'}`);
      }
      return text;
    } finally {
      clearTimeout(t);
    }
  }

  /* ----------------------------------------------------------------- VOICE */

  /** Real Arabic voiceover: OpenAI tts when keyed, else gTTS chunked MP3(s). */
  async synthesizeVoice(text: string, language: string): Promise<{ chunks: Buffer[]; provider: string; mime: string }> {
    if (this.config.ai.openaiApiKey) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.ai.openaiApiKey}` },
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

  /** Real scene artwork: Pollinations image API (key-less, cinematic vertical). */
  async generateSceneImage(visualPrompt: string, seed: number): Promise<Buffer> {
    const prompt = encodeURIComponent(`${visualPrompt}, vertical 9:16 cinematic, high detail, no text, no watermark`);
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=720&height=1280&seed=${seed}&nologo=true&model=flux`;
    const res = await fetch(url, { headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
    if (!res.ok) throw new Error(`pollinations image ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10_000) throw new Error('image provider returned an empty image');
    return buf;
  }
}
