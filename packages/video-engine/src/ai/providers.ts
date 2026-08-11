/**
 * LLM provider registry — every entry is a REAL text-generation backend used
 * by the script stage. Credential resolution order (quality-first):
 *   org vault (encrypted at rest, set via /dashboard/settings) → env vars.
 * Pollinations' keyless text tier no longer serves novel prompts (HTTP 402 —
 * verified 2026-08-03), so a provider key is required; three of the five
 * providers below have genuinely free tiers (no credit card).
 */
export interface LlmProviderDef {
  id: 'openai' | 'groq' | 'gemini' | 'openrouter' | 'pollinations';
  label: string;
  model: string;
  kind: 'openai-compatible' | 'gemini';
  chatUrl?: string; // openai-compatible only
  consoleUrl: string; // where a user obtains the key
  free: boolean;
  envKey: string; // env var name surfaced in guidance/errors
  /** response_format: json_object is strict-on for these two (reliable JSON). */
  strictJson: boolean;
}

export const LLM_PROVIDERS: readonly LlmProviderDef[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    model: 'gpt-4o-mini',
    kind: 'openai-compatible',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    consoleUrl: 'https://platform.openai.com/api-keys',
    free: false,
    envKey: 'OPENAI_API_KEY',
    strictJson: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    model: 'llama-3.3-70b-versatile',
    kind: 'openai-compatible',
    chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
    consoleUrl: 'https://console.groq.com/keys',
    free: true,
    envKey: 'GROQ_API_KEY',
    strictJson: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    model: 'gemini-2.0-flash',
    kind: 'gemini',
    consoleUrl: 'https://aistudio.google.com/apikey',
    free: true,
    envKey: 'GEMINI_API_KEY',
    strictJson: true, // enforced via responseMimeType
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    kind: 'openai-compatible',
    chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    consoleUrl: 'https://openrouter.ai/keys',
    free: true,
    envKey: 'OPENROUTER_API_KEY',
    strictJson: false, // free models vary in response_format support
  },
  {
    id: 'pollinations',
    label: 'Pollinations',
    model: 'openai-fast',
    kind: 'openai-compatible',
    chatUrl: 'https://gen.pollinations.ai/v1/chat/completions',
    consoleUrl: 'https://enter.pollinations.ai',
    free: true,
    envKey: 'POLLINATIONS_API_KEY',
    strictJson: false, // gpt-oss reasoning model — no response_format
  },
] as const;

export const LLM_PROVIDER_MAP: ReadonlyMap<string, LlmProviderDef> = new Map(LLM_PROVIDERS.map((p) => [p.id, p]));

export interface LlmCredential {
  def: LlmProviderDef;
  apiKey: string;
  source: 'org' | 'env';
}

interface ChatInput {
  system: string;
  user: string;
  /** validation probes use a micro prompt and a shorter timeout */
  probe?: boolean;
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; data: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

/** Raw completion text from any registered provider. Throws on any failure. */
export async function chatCompletion(cred: LlmCredential, input: ChatInput): Promise<string> {
  const { def, apiKey } = cred;
  const timeout = input.probe ? 35_000 : 120_000;
  if (def.kind === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${def.model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const { status, data } = await postJson(
      url,
      {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.user }] }],
        generationConfig: { temperature: input.probe ? 0 : 0.8, maxOutputTokens: input.probe ? 16 : 4096, responseMimeType: 'application/json' },
      },
      {},
      timeout,
    );
    const g = (data ?? {}) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    const text = g.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (status !== 200 || text.length === 0) {
      throw new Error(`gemini generate ${status}: ${g.error?.message ?? 'empty completion'}`);
    }
    return text;
  }
  const { status, data } = await postJson(
    def.chatUrl!,
    {
      model: def.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      temperature: input.probe ? 0 : 0.8,
      ...(input.probe ? { max_tokens: 16 } : {}),
      ...(def.strictJson && !input.probe ? { response_format: { type: 'json_object' } } : {}),
    },
    {
      authorization: `Bearer ${apiKey}`,
      ...(def.id === 'openrouter' ? { 'http-referer': 'https://autocreator.ai', 'x-title': 'AutoCreator AI' } : {}),
    },
    timeout,
  );
  const o = (data ?? {}) as { choices?: Array<{ message?: { content?: string | null } }>; error?: { message?: string } | string };
  const content = o.choices?.[0]?.message?.content ?? '';
  if (status !== 200 || content.length === 0) {
    const msg = typeof o.error === 'string' ? o.error : (o.error?.message ?? 'empty completion');
    throw new Error(`${def.id} chat ${status}: ${msg.slice(0, 220)}`);
  }
  return content;
}

/**
 * REAL key validation at save-time: one micro completion against the provider.
 * 401/403 → the key itself is rejected; other statuses surface the provider's
 * own message. Never trust a key the provider has not accepted.
 */
export async function validateApiKey(def: LlmProviderDef, apiKey: string): Promise<void> {
  try {
    await chatCompletion({ def, apiKey, source: 'org' }, { system: 'You are a health probe.', user: 'Reply with the single word: ready', probe: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`key rejected by ${def.label}: ${msg}`);
  }
}
