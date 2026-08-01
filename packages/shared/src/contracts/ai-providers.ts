/**
 * Frozen contract C3 — AI Provider Interfaces (docs/Contracts.md).
 * Implemented by first-party adapters (packages/ai) and marketplace plugins alike;
 * the Provider Router resolves across both. Adapters MUST throw
 * {@link import('../errors.js').ProviderError} with the frozen taxonomy
 * (RATE_LIMITED | UNAVAILABLE | CONTENT_POLICY | INVALID | UPSTREAM) —
 * the router maps these uniformly and the conformance suite asserts it.
 *
 * Money rule (ADR-016): cost is always integer `costMicros` (USD × 1e6).
 */
import { z, type ZodType } from 'zod';

/** Metering tuple every capability call returns. */
export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  /** USD × 1e6, integer math only — never float money. */
  costMicros: bigint;
  latencyMs: number;
}

/* ------------------------------------------------------------------ */
/* Frozen value shapes (zod)                                           */
/* ------------------------------------------------------------------ */

export const AttributionSchema = z.object({
  author: z.string().max(256).optional(),
  license: z.string().max(128).optional(),
  sourcePageUrl: z.string().url().optional(),
});
export type Attribution = z.infer<typeof AttributionSchema>;

export const WordTimingSchema = z
  .object({
    word: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .refine((w) => w.endMs >= w.startMs, { message: 'endMs must be >= startMs' });
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(200_000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatReqSchema = z.object({
  /** Router default applies when omitted (policy-driven). */
  model: z.string().min(1).max(128).optional(),
  system: z.string().max(64_000).optional(),
  messages: z.array(ChatMessageSchema).min(1).max(256),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(200_000).optional(),
});
export type ChatReq = z.infer<typeof ChatReqSchema>;

export const StockHitSchema = z.object({
  /** Provider-local stable id — dedupe key across pages. */
  hitId: z.string().min(1).max(256),
  kind: z.enum(['video', 'image']),
  previewUrl: z.string().url(),
  /** Full-res download endpoint (may be short-lived; re-search to refresh). */
  downloadUrl: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Present iff kind === 'video'. */
  durationMs: z.number().int().positive().optional(),
  attribution: AttributionSchema.optional(),
});
export type StockHit = z.infer<typeof StockHitSchema>;

export const MusicTrackSchema = z.object({
  trackId: z.string().min(1).max(256),
  title: z.string().min(1).max(256),
  previewUrl: z.string().url(),
  downloadUrl: z.string().url(),
  durationMs: z.number().int().positive(),
  bpm: z.number().int().positive().max(400).optional(),
  moods: z.array(z.string().min(1).max(64)).max(8).optional(),
  attribution: AttributionSchema.optional(),
});
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

export const SearchResultSchema = z.object({
  title: z.string().min(1).max(512),
  url: z.string().url(),
  snippet: z.string().max(2_000),
  publishedAt: z.string().datetime({ offset: true }).optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

/* ------------------------------------------------------------------ */
/* Provider interfaces (C3)                                            */
/* ------------------------------------------------------------------ */

export interface ILLMProvider {
  llmJson<T>(req: {
    model?: string;
    system?: string;
    prompt: string;
    schema: ZodType<T>;
    maxTokens?: number;
  }): Promise<{ data: T; usage: Usage }>;
  llmChat(req: ChatReq): Promise<{ text: string; usage: Usage }>;
}

export interface ITTSProvider {
  /** wordTimings is always true — subtitles/karaoke depend on it. */
  synthesize(req: {
    voiceId: string;
    text: string;
    language: string;
    format: 'mp3' | 'wav';
    wordTimings: true;
  }): Promise<{ audioKey: string; durationMs: number; words: WordTiming[]; usage: Usage }>;
}

export interface IImageProvider {
  generate(req: {
    prompt: string;
    width: number;
    height: number;
    styleSuffix?: string;
    seed?: number;
  }): Promise<{ imageKey: string; usage: Usage }>;
}

export interface IStockProvider {
  search(req: {
    query: string;
    kind: 'video' | 'image';
    page: number;
    perPage: number;
  }): Promise<{ hits: StockHit[]; usage: Usage }>;
}

export interface IMusicProvider {
  search(req: {
    mood: string;
    durationMsMin: number;
  }): Promise<{ track: MusicTrack | null; usage: Usage }>;
}

export interface ITranscriptionProvider {
  transcribe(req: {
    audioKey: string;
    language?: string;
  }): Promise<{ words: WordTiming[]; usage: Usage }>;
}

export interface ISearchProvider {
  web(req: {
    query: string;
    maxResults: number;
  }): Promise<{ results: SearchResult[]; usage: Usage }>;
}
