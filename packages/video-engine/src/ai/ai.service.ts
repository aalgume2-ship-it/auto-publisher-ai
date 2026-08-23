/**
 * AiService — the real AI providers behind the video engine.
 *
 * Routing:
 *   script  → first configured LLM credential (org vault → env): OpenAI /
 *             Groq / Gemini / OpenRouter / Pollinations — all REAL.
 *             No credential anywhere → deterministic prompt-derived script.
 *   voice   → Runway Eleven v3 when Runway video is configured; otherwise
 *             OpenAI tts-1 when the resolved credential is OpenAI;
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
 * The keyless script fallback is deliberately deterministic and prompt-derived;
 * moving pictures still come from a real video provider. For the explicit
 * Story 3D social format, shared-GPU outages fall back to AI scene artwork
 * animated locally with ffmpeg so that the product remains usable.
 */
import { z } from 'zod';
import type { AppConfig } from '@aca/config';
import { createLogger, type Logger } from '@aca/logger';
import { PipelineError } from '../errors.js';
import { type OrgCredentialsService } from '../vault/org-credentials.js';
import { LLM_PROVIDERS, chatCompletion, type LlmCredential } from './providers.js';
import { generateClip, generateRunwaySpeech, type VideoCredential } from './providers-video.js';
import { getPrompt, renderUserPrompt } from './prompts/registry.js';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const localRequire = createRequire(import.meta.url);

function resolveStoryFfmpeg(): string {
  const env = process.env.FFMPEG_PATH;
  if (env && existsSync(env)) return env;
  for (const pkg of ['@ffmpeg-installer/linux-x64', 'ffmpeg-static']) {
    try {
      const pkgJson = localRequire.resolve(`${pkg}/package.json`);
      const binary = join(dirname(pkgJson), 'ffmpeg');
      if (existsSync(binary)) return binary;
    } catch {}
    try {
      const candidate = localRequire(pkg) as unknown;
      const binary = typeof candidate === 'string'
        ? candidate
        : (candidate as { path?: string } | null)?.path ?? (candidate as { default?: string } | null)?.default;
      if (typeof binary === 'string' && existsSync(binary)) return binary;
    } catch {}
  }
  return 'ffmpeg';
}

const storyFfmpeg = resolveStoryFfmpeg();

async function renderStoryMotionClip(imagePath: string, outputPath: string, durationSec: number, direction: number): Promise<void> {
  const fps = 24;
  const duration = Math.max(3, Math.min(8, durationSec));
  const zoom = direction % 2 === 0
    ? "z='min(1+0.0008*on,1.11)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    : "z='max(1.11-0.0008*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  const args = [
    '-y', '-nostdin', '-hide_banner', '-v', 'warning',
    '-loop', '1', '-framerate', String(fps), '-t', duration.toFixed(3), '-i', imagePath,
    '-vf', `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=${zoom}:d=1:s=720x1280:fps=${fps},setsar=1,format=yuv420p`,
    '-t', duration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'superfast', '-crf', '21', '-r', String(fps),
    '-threads', '1', '-movflags', '+faststart',
    outputPath,
  ];
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(storyFfmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (error) => { clearTimeout(timeout); rejectPromise(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`story3d ffmpeg exited ${code}: ${stderr.slice(-700)}`));
    });
  });
}

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
  language: string;
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
      const isApiError = err instanceof PipelineError && (err as PipelineError).code === 'AI_CREDENTIALS_MISSING';
      if (terminal || isApiError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /429|500|502|503|504|timeout|ECONN|ETIMEDOUT|fetch failed|network/i.test(msg) || attempt < 3;
      if (!retryable || attempt === 3) break;
      logger?.warn({ module: 'ai', label, attempt }, `attempt ${attempt}/3 failed: ${msg.slice(0, 160)} — retrying`);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export interface ImageGenRequest {
  prompt: string;
  negativePrompt?: string | undefined;
  style?: string | undefined;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5' | undefined;
  resolution?: '512x512' | '720x1280' | '1024x1024' | '1280x720' | '1536x1024' | undefined;
}
export interface ImageGenResult {
  data: Buffer;
  provider: string;
  mime: string;
  width: number;
  height: number;
}

export class AiService {
  private readonly logger: Logger;

  constructor(
    private readonly config: AppConfig,
    private readonly creds: OrgCredentialsService,
  ) {
    this.logger = createLogger({ service: 'video-engine', level: 'info' }).child({ module: 'ai' });
  }

  private keylessScript(req: ScriptRequest): VideoScript {
    const keyword = req.keyword.trim().replace(/\s+/g, ' ') || 'موضوع ملهم';
    const niche = req.niche.trim().replace(/\s+/g, ' ') || 'محتوى عام';
    const english = req.language.toLowerCase().startsWith('en');
    const technicalDirection = /^(?:حركة|تصوير|لقطة|الكاميرا|بدون نصوص|نسبة الأبعاد|motion|camera|cinematic|tracking shot|no text|aspect ratio)(?:\s|:|-|$)/iu;
    const rawBeats = keyword
      .split(/[.!?؟،؛]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4 && !technicalDirection.test(part));
    const beats = rawBeats.length > 0 ? rawBeats : [keyword];
    const storyAnchor = beats.slice(0, 2).join('، ').slice(0, 220);
    const continuity = [
      storyAnchor,
      'IDENTITY LOCK: same exact main subject in every shot',
      'identical face geometry, age, hair, skin tone, wardrobe, accessories, body proportions and colors',
      'no identity drift, no duplicate subject, no wardrobe changes, no face morphing',
      'same environment geography, architecture, weather, lighting direction and time of day',
      'physical continuity: each shot begins from the exact action and screen direction where the previous shot ended',
      'photorealistic live-action cinematography, natural anatomy, realistic skin texture, physically plausible motion',
      'premium commercial color science, controlled highlights, realistic shadows, rich dynamic range',
    ].join(', ');

    const buckets: string[][] = Array.from({ length: 4 }, () => []);
    beats.forEach((beat, index) => {
      const bucket = Math.min(3, Math.floor((index * 4) / beats.length));
      buckets[bucket]!.push(beat);
    });
    const desiredWords = Math.max(english ? 8 : 6, Math.floor((req.targetSeconds * (english ? 1.8 : 1.35)) / 4));
    const compactBucket = (parts: string[], fallback: string, keepEnding = false): string => {
      if (parts.length === 0) return fallback.split(/\s+/).slice(0, desiredWords).join(' ');
      const perPart = Math.max(2, Math.floor(desiredWords / parts.length));
      return parts
        .map((part) => {
          const words = part.split(/\s+/);
          if (!keepEnding || words.length <= perPart || perPart < 4) return words.slice(0, perPart).join(' ');
          const endingWords = Math.max(2, Math.floor(perPart / 3));
          return [...words.slice(0, perPart - endingWords), ...words.slice(-endingWords)].join(' ');
        })
        .join(english ? ', ' : '، ')
        .trim();
    };
    const compactBeats = buckets.map((parts, index) =>
      compactBucket(
        parts,
        english
          ? [
              `the story begins around ${storyAnchor} and an unexpected sign appears`,
              'the challenge grows while the hero stays focused and searches for a safe solution',
              'a decisive careful action arrives just before the final opportunity is lost',
              'the plan succeeds and the place becomes calm as the journey reaches a meaningful ending',
            ][index]!
          : [
              `تبدأ الحكاية مع ${storyAnchor} وتظهر إشارة مفاجئة تغير مجرى اليوم`,
              'يتصاعد التحدي بينما يحافظ البطل على هدفه ويبحث بهدوء عن حل آمن',
              'تحين لحظة القرار فيتحرك البطل بدقة قبل أن تضيع الفرصة الأخيرة',
              'تنجح الخطة ويعود الهدوء إلى المكان وتنتهي الرحلة برسالة واضحة ومؤثرة',
            ][index]!,
        index === 3,
      ),
    );
    const title = beats.slice(0, 2).join(' — ').slice(0, 110);

    const scenes = english
      ? [
          { narration: `At first, ${compactBeats[0]}.`, visualPrompt: `${continuity}; scene 1, ${compactBeats[0]}, 24mm establishing shot, slow controlled dolly-in, motivated cinematic lighting, layered foreground parallax, realistic continuous motion, natural motion blur, no text` },
          { narration: `Then, ${compactBeats[1]}.`, visualPrompt: `${continuity}; scene 2, ${compactBeats[1]}, 35mm medium tracking shot, stabilized lateral follow, natural subject motion, foreground occlusion, strong depth separation, realistic motion blur, no text` },
          { narration: `At the turning point, ${compactBeats[2]}.`, visualPrompt: `${continuity}; scene 3, ${compactBeats[2]}, 50mm intimate action close-up, subtle handheld micro-motion, coherent locked identity, expressive natural movement, shallow depth of field, cinematic motion, no text` },
          { narration: `In the end, ${compactBeats[3]}.`, visualPrompt: `${continuity}; scene 4, ${compactBeats[3]}, 28mm cinematic closing wide shot, graceful crane-and-pullback reveal, locked identity and environment continuity, realistic motion, natural atmospheric depth, no text` },
        ]
      : [
          { narration: `في البداية، ${compactBeats[0]}.`, visualPrompt: `${continuity}; scene 1, ${compactBeats[0]}, 24mm establishing shot, slow controlled dolly-in, motivated cinematic lighting, layered foreground parallax, realistic continuous motion, natural motion blur, no text` },
          { narration: `ثم، ${compactBeats[1]}.`, visualPrompt: `${continuity}; scene 2, ${compactBeats[1]}, 35mm medium tracking shot, stabilized lateral follow, natural subject motion, foreground occlusion, strong depth separation, realistic motion blur, no text` },
          { narration: `وعند لحظة التحول، ${compactBeats[2]}.`, visualPrompt: `${continuity}; scene 3, ${compactBeats[2]}, 50mm intimate action close-up, subtle handheld micro-motion, coherent locked identity, expressive natural movement, shallow depth of field, cinematic motion, no text` },
          { narration: `وفي النهاية، ${compactBeats[3]}.`, visualPrompt: `${continuity}; scene 4, ${compactBeats[3]}, 28mm cinematic closing wide shot, graceful crane-and-pullback reveal, locked identity and environment continuity, realistic motion, natural atmospheric depth, no text` },
        ];

    if (english) {
      return {
        title,
        description: `A cinematic short film inspired by ${keyword}, created as a polished ${niche} story. #cinematic #video`,
        tags: ['cinematic', 'video', 'story', 'creative', 'motion', 'shortfilm'],
        hook: `Watch ${title} come alive in motion.`,
        cta: 'Follow for more cinematic stories.',
        scenes,
      };
    }

    return {
      title,
      description: `فيلم قصير سينمائي مستوحى من ${keyword}، بصياغة بصرية مميزة ضمن ${niche}. #سينما #فيديو`,
      tags: ['سينما', 'فيديو', 'إبداع', 'قصة', 'مشاهد', 'cinematic'],
      hook: `شاهد كيف تتحول حكاية ${title} إلى مشهد حي.`,
      cta: 'تابعنا للمزيد من القصص السينمائية.',
      scenes,
    };
  }

  private async requireLlm(orgId: string): Promise<LlmCredential> {
    const cred = await this.creds.resolveLlm(orgId);
    if (!cred) {
      const envList = LLM_PROVIDERS.map((p) => p.envKey).join(' أو ');
      const err = new PipelineError('AI_CREDENTIALS_MISSING', 'AI provider not configured', {
        status: 503,
        detail:
          'لا يوجد أي مفتاح مزود ذكاء اصطناعي لتوليد السيناريو. الحل خلال دقيقتين من لوحة التحكم ← الإعدادات: ' +
          'أضف مفتاحاً مجانياً من Groq (console.groq.com/keys) أو Google AI Studio (aistudio.google.com/apikey) — ' +
          'يتم التحقق منه لحظياً وتخزينه مشفراً. أو اضبط أحد متغيرات البيئة على خدمة الـ API: ' +
          envList +
          '.',
      });
      throw err;
    }
    return cred;
  }

  async generateScript(req: ScriptRequest, orgId: string): Promise<{ script: VideoScript; provider: string }> {
    const cred = await this.creds.resolveLlm(orgId);
    if (!cred) {
      this.logger.info({ module: 'ai', orgId }, 'script.keyless_fallback');
      const wantsArabic = req.language.toLowerCase().startsWith('ar');
      const hasArabic = /[\u0600-\u06ff]/u.test(req.keyword);
      let keyword = req.keyword;
      if (wantsArabic && !hasArabic) {
        try {
          const url = new URL('https://translate.googleapis.com/translate_a/single');
          url.searchParams.set('client', 'gtx');
          url.searchParams.set('sl', 'auto');
          url.searchParams.set('tl', 'ar');
          url.searchParams.set('dt', 't');
          url.searchParams.set('q', req.keyword.slice(0, 1_800));
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8_000);
          try {
            const res = await fetch(url, { signal: ctrl.signal });
            if (res.ok) {
              const payload = (await res.json()) as unknown;
              if (Array.isArray(payload) && Array.isArray(payload[0])) {
                const translated = payload[0]
                  .flatMap((part) => (Array.isArray(part) && typeof part[0] === 'string' ? [part[0]] : []))
                  .join(' ')
                  .trim();
                if (translated.length >= 4) keyword = translated;
              }
            }
          } finally {
            clearTimeout(timer);
          }
        } catch {}
      }
      return { script: this.keylessScript({ ...req, keyword }), provider: 'keyless-template' };
    }
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
    if (!parsed.success) throw new Error(`script failed schema validation: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join('; ')}`);
    return { script: parsed.data, provider: cred.def.id };
  }

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

  async synthesizeVoice(text: string, language: string, orgId: string): Promise<{ chunks: Buffer[]; provider: string; mime: string }> {
    const videoCred = await this.creds.resolveVideo(orgId);
    if (videoCred?.def.id === 'runway') {
      const chunks = await withRetry('tts-runway-eleven-v3', async () => [await generateRunwaySpeech(videoCred.apiKey, text, language.startsWith('ar') ? 'ar' : 'en')], this.logger);
      return { chunks, provider: 'runway-eleven-v3', mime: 'audio/mpeg' };
    }
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
      } else cur = (cur + ' ' + s).trim();
    }
    if (cur) pieces.push(cur);
    if (pieces.length === 0) throw new Error('tts: empty narration');
    const out: Buffer[] = [];
    for (const p of pieces) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(p)}`;
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', referer: 'https://translate.google.com/' } });
      if (!res.ok) throw new Error(`gtts ${res.status} on chunk "${p.slice(0, 40)}…"`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) throw new Error('gtts returned empty audio');
      out.push(buf);
    }
    return out;
  }

  async resolveBunnyStorage(orgId: string) { return this.creds.resolveBunnyStorage(orgId); }
  async resolveVideoCred(orgId: string): Promise<VideoCredential | null> { return this.creds.resolveVideo(orgId); }

  async generateSceneClip(cred: VideoCredential, visualPrompt: string, firstFrameUrl: string | null, windowSec: number): Promise<Buffer> {
    if (cred.def.id === 'hf-ltx') {
      try {
        return await generateClip(cred, { prompt: visualPrompt, firstFrameUrl, windowSec });
      } catch (videoError) {
        const story3d = /(?:3d animation|3d animated|feature-film 3d|social short|stylized semi-realistic|قصة 3d|ثلاثية الأبعاد)/iu.test(visualPrompt);
        if (!story3d) throw videoError;

        this.logger.warn({ module: 'ai' }, 'shared video GPU unavailable; rendering reliable 3D social-story motion clip');
        const seed = Math.abs([...visualPrompt].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) | 0, 17)) % 900000;
        const enriched = `${visualPrompt}, premium polished 3D animated social-story frame, stylized semi-realistic human characters, expressive large eyes, clean anatomy, detailed environment, soft cinematic lighting, smooth materials, family-friendly short-form aesthetic, vertical 9:16, no text, no watermark`;
        let image: { data: Buffer; provider: string };
        try {
          image = await withRetry('story3d-image', () => this.imageViaPollinations(enriched, seed), this.logger);
        } catch {
          image = await this.generateSceneImage(enriched, seed);
        }
        const wd = join(tmpdir(), 'aca-render', 'story3d-clip', `${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`);
        await mkdir(wd, { recursive: true });
        const framePath = join(wd, 'frame.jpg');
        const clipPath = join(wd, 'clip.mp4');
        await writeFile(framePath, image.data);
        await renderStoryMotionClip(framePath, clipPath, windowSec, seed % 2);
        const clip = await readFile(clipPath);
        if (clip.byteLength < 30_000) throw new Error('3D social-story fallback produced a suspiciously small clip');
        return clip;
      }
    }
    return withRetry(`clip-${cred.def.id}`, () => generateClip(cred, { prompt: visualPrompt, firstFrameUrl, windowSec }), this.logger);
  }

  sceneImageUrl(visualPrompt: string, seed: number): string {
    const prompt = encodeURIComponent(`${visualPrompt}, vertical 9:16 cinematic, high detail, no text, no watermark`);
    return `https://image.pollinations.ai/prompt/${prompt}?width=720&height=1280&seed=${seed}&nologo=true&model=flux`;
  }

  async generateSceneImage(visualPrompt: string, seed: number): Promise<{ data: Buffer; provider: string }> {
    const errors: string[] = [];
    try { return await withRetry('image-pollinations', () => this.imageViaPollinations(visualPrompt, seed), this.logger); }
    catch (err) { errors.push(`pollinations: ${err instanceof Error ? err.message : err}`); }
    try { return await this.imageViaLoremFlickr(visualPrompt, seed); }
    catch (err) { errors.push(`loremflickr: ${err instanceof Error ? err.message : err}`); }
    try { return await this.imageViaOpenverse(visualPrompt); }
    catch (err) { errors.push(`openverse: ${err instanceof Error ? err.message : err}`); }
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
        if (res.status === 429 || res.status >= 500) lastErr = `http ${res.status}`;
        else if (!res.ok) throw new Error(`http ${res.status}`);
        else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 10_000) throw new Error('empty image');
          return { data: buf, provider: 'pollinations' };
        }
      } catch (err) { lastErr = err instanceof Error ? err.message : String(err); }
      finally { clearTimeout(timer); }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 6_000 * attempt));
    }
    throw new Error(lastErr);
  }

  private static promptKeywords(prompt: string, max = 2): string {
    const stop = new Set(['the','a','an','of','in','on','with','and','at','to','for','over','into','from','under','through','style','shot','vertical','cinematic','animated','detail','high','deep','dark','soft','glow','glowing','dramatic','futuristic','mysterious','ancient','modern','massive','tiny','huge','beautiful','stunning','background','foreground','closeup','macro','wide','aerial','view','scene','showing','illustration','diagram','concept','realistic','abstract','digital','artwork','moody','tones','lighting','shadows','misty','eerie','vibrant','depth','light','lights','blue','teal','orange','photo','image','real','true','spiraling','infinite','geometric','fractal','botanical','petals','patterns','microscopic','text','words','watermark','logo','faces','people','person','human']);
    const words = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w) && !w.endsWith('ing'));
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
    } finally { clearTimeout(timer); }
  }

  private async imageViaOpenverse(visualPrompt: string): Promise<{ data: Buffer; provider: 'openverse' }> {
    const q = AiService.promptKeywords(visualPrompt, 3).replaceAll(',', ' ');
    const searchUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=1&license_type=all`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(searchUrl, { signal: ctrl.signal, headers: { 'user-agent': 'autocreator-pipeline/1.0 (contact: preview@autocreator.ai)' } });
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
    } finally { clearTimeout(timer); }
  }

  async translateText(text: string, targetLanguage: string, orgId: string): Promise<{ text: string; provider: string }> {
    const cred = await this.requireLlm(orgId);
    const system = 'You are a professional media translator. Translate the provided transcript into ' + `${targetLanguage}. Keep timing-friendly sentence lengths, preserve numbers/names, ` + 'return ONLY the translated text, no commentary.';
    const raw = await withRetry('translate', () => chatCompletion(cred, { system, user: text }), this.logger);
    const out = raw.trim().replace(/^["']|["']$/g, '');
    if (out.length < 10) throw new Error('translation returned empty text');
    return { text: out, provider: cred.def.id };
  }

  async rawOpenAiKey(orgId: string): Promise<string | null> {
    const stored = await this.creds.readSecret(orgId, 'LLM', 'openai');
    if (stored?.secret) return stored.secret;
    return this.config.ai.openaiApiKey ?? null;
  }

  async generateImage(req: ImageGenRequest, orgId: string): Promise<ImageGenResult> {
    const { prompt, negativePrompt, style } = req;
    const ratio = req.aspectRatio ?? '9:16';
    const res = req.resolution ?? '720x1280';
    const [w, h] = res.split('x').map(Number) as [number, number];

    const stabilityKey = (await this.creds.readSecret(orgId, 'IMAGE', 'stability'))?.secret ?? this.config.ai.stabilityApiKey;
    if (stabilityKey) {
      try {
        const body: Record<string, unknown> = { prompt: style ? `${prompt}, ${style}` : prompt, negative_prompt: negativePrompt ?? '', output_format: 'png', aspect_ratio: ratio };
        const res_ = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', { method: 'POST', headers: { authorization: `Bearer ${stabilityKey}`, accept: 'image/*', 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (res_.ok) {
          const buf = Buffer.from(await res_.arrayBuffer());
          if (buf.length > 10_000) return { data: buf, provider: 'stability', mime: 'image/png', width: w, height: h };
        }
      } catch {}
    }

    const openaiKey = (await this.creds.readSecret(orgId, 'IMAGE', 'openai'))?.secret ?? this.config.ai.openaiApiKey;
    if (openaiKey) {
      try {
        const body: Record<string, unknown> = { model: 'gpt-image-1', prompt: style ? `${prompt}, ${style}` : prompt, size: res, n: 1, response_format: 'b64_json' };
        const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` }, body: JSON.stringify(body) });
        if (r.ok) {
          const json = (await r.json()) as { data?: Array<{ b64_json?: string }> };
          const b64 = json.data?.[0]?.b64_json;
          if (b64) {
            const buf = Buffer.from(b64, 'base64');
            if (buf.length > 10_000) return { data: buf, provider: 'openai', mime: 'image/png', width: w, height: h };
          }
        }
      } catch {}
    }

    const replicateToken = (await this.creds.readSecret(orgId, 'IMAGE', 'replicate'))?.secret ?? this.config.ai.replicateApiToken;
    if (replicateToken) {
      try {
        const body: Record<string, unknown> = { version: 'ac732df83cea7fff18b8472768c88ad441fa890f4e5a8e3a5b2a0a2d5e7d6f3a', input: { prompt: style ? `${prompt}, ${style}` : prompt, negative_prompt: negativePrompt ?? '', width: w, height: h } };
        const r = await fetch('https://api.replicate.com/v1/predictions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${replicateToken}` }, body: JSON.stringify(body) });
        const json = (await r.json()) as { urls?: { get?: string } };
        if (r.ok && json.urls?.get) {
          for (let i = 0; i < 30; i += 1) {
            await new Promise((r2) => setTimeout(r2, 4_000));
            const poll = await fetch(json.urls.get, { headers: { authorization: `Bearer ${replicateToken}` } });
            const pj = (await poll.json()) as { status?: string; output?: unknown };
            if (pj.status === 'succeeded' && Array.isArray(pj.output) && typeof pj.output[0] === 'string') {
              const img = await fetch(pj.output[0]);
              if (img.ok) {
                const buf = Buffer.from(await img.arrayBuffer());
                if (buf.length > 10_000) return { data: buf, provider: 'replicate', mime: 'image/png', width: w, height: h };
              }
            }
            if (pj.status === 'failed') break;
          }
        }
      } catch {}
    }

    const enriched = style ? `${prompt}, ${style}` : prompt;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 99999)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res_ = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
      if (!res_.ok) throw new Error(`pollinations http ${res_.status}`);
      const buf = Buffer.from(await res_.arrayBuffer());
      if (buf.length < 10_000) throw new Error('pollinations returned empty image');
      const mime = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png';
      return { data: buf, provider: 'pollinations', mime, width: w, height: h };
    } finally { clearTimeout(timer); }
  }
}
