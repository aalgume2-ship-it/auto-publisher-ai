/**
 * Provider status — single source of truth for "what is configured".
 *
 * Every feature that talks to an external service (Runway, Luma, OpenAI,
 * Stripe, YouTube OAuth, ...) reads from this file. The UI shows
 * "Not configured — set X in env" instead of pretending a feature works.
 *
 * Note: in the browser bundle, NEXT_PUBLIC_* vars are inlined at build
 * time. Server-only secrets (e.g. RUNWAY_API_KEY without the public
 * prefix) are surfaced via /api/v1/health/providers (server route).
 */

export type ProviderStatus = 'configured' | 'not_configured' | 'unknown';

export interface ProviderInfo {
  id: string;
  label: string;
  category: 'video' | 'image' | 'llm' | 'voice' | 'social' | 'storage' | 'billing' | 'auth';
  status: ProviderStatus;
  /** env var names (any one set = configured) */
  envKeys: string[];
  /** Where the user can obtain the key. */
  consoleUrl?: string;
  /** Free tier available? */
  free?: boolean;
  /** Optional price hint. */
  priceHint?: string;
}

/**
 * Build a provider list from env (browser side).
 * For server-only checks, call /api/v1/health/providers instead.
 */
export function listBrowserProviders(): ProviderInfo[] {
  const lookup = (key: string) => (process.env[key] ? 'configured' : 'not_configured');
  const pk = (id: string) => (process.env[`NEXT_PUBLIC_${id}`] ? 'configured' : 'not_configured');
  return [
    // ── Video generation providers
    {
      id: 'runway',
      label: 'Runway Gen-3',
      category: 'video',
      status: lookup('RUNWAY_API_KEY'),
      envKeys: ['RUNWAY_API_KEY'],
      consoleUrl: 'https://dev.runwayml.com',
      priceHint: '~$0.25 / 5s',
    },
    {
      id: 'luma',
      label: 'Luma Dream Machine',
      category: 'video',
      status: lookup('LUMA_API_KEY'),
      envKeys: ['LUMA_API_KEY'],
      consoleUrl: 'https://lumalabs.ai/api',
      priceHint: '~$0.35 / 5s',
    },
    {
      id: 'fal-kling',
      label: 'Kling (via fal.ai)',
      category: 'video',
      status: lookup('FAL_API_KEY'),
      envKeys: ['FAL_API_KEY'],
      consoleUrl: 'https://fal.ai',
      priceHint: 'pay-as-you-go',
    },
    {
      id: 'replicate',
      label: 'Replicate',
      category: 'video',
      status: lookup('REPLICATE_API_TOKEN'),
      envKeys: ['REPLICATE_API_TOKEN'],
      consoleUrl: 'https://replicate.com/account/api-tokens',
      priceHint: 'per-second GPU',
    },
    // ── Image generation
    {
      id: 'openai',
      label: 'OpenAI (DALL·E / GPT-Image-1)',
      category: 'image',
      status: lookup('OPENAI_API_KEY'),
      envKeys: ['OPENAI_API_KEY'],
      consoleUrl: 'https://platform.openai.com/api-keys',
    },
    {
      id: 'stability',
      label: 'Stability AI',
      category: 'image',
      status: lookup('STABILITY_API_KEY'),
      envKeys: ['STABILITY_API_KEY'],
      consoleUrl: 'https://platform.stability.ai',
    },
    {
      id: 'google-ai',
      label: 'Google AI (Imagen)',
      category: 'image',
      status: lookup('GOOGLE_AI_API_KEY'),
      envKeys: ['GOOGLE_AI_API_KEY'],
      consoleUrl: 'https://aistudio.google.com/apikey',
      free: true,
    },
    // ── LLM / script
    {
      id: 'groq',
      label: 'Groq (free LLM)',
      category: 'llm',
      status: lookup('GROQ_API_KEY'),
      envKeys: ['GROQ_API_KEY'],
      consoleUrl: 'https://console.groq.com/keys',
      free: true,
    },
    {
      id: 'gemini',
      label: 'Google Gemini (free)',
      category: 'llm',
      status: lookup('GEMINI_API_KEY'),
      envKeys: ['GEMINI_API_KEY'],
      consoleUrl: 'https://aistudio.google.com/apikey',
      free: true,
    },
    // ── Voice / dubbing
    {
      id: 'elevenlabs',
      label: 'ElevenLabs',
      category: 'voice',
      status: lookup('ELEVENLABS_API_KEY'),
      envKeys: ['ELEVENLABS_API_KEY'],
      consoleUrl: 'https://elevenlabs.io',
      priceHint: 'free tier available',
    },
    {
      id: 'google-tts',
      label: 'Google Cloud TTS',
      category: 'voice',
      status: lookup('GOOGLE_TTS_CREDENTIALS_JSON'),
      envKeys: ['GOOGLE_TTS_CREDENTIALS_JSON'],
      consoleUrl: 'https://console.cloud.google.com',
    },
    // ── Social OAuth
    {
      id: 'youtube',
      label: 'YouTube (Google OAuth)',
      category: 'social',
      status: lookup('GOOGLE_CLIENT_ID') === 'configured' && lookup('GOOGLE_CLIENT_SECRET') === 'configured' ? 'configured' : 'not_configured',
      envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    },
    {
      id: 'tiktok',
      label: 'TikTok',
      category: 'social',
      status: lookup('TIKTOK_CLIENT_KEY') === 'configured' && lookup('TIKTOK_CLIENT_SECRET') === 'configured' ? 'configured' : 'not_configured',
      envKeys: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
      consoleUrl: 'https://developers.tiktok.com/apps',
    },
    {
      id: 'instagram',
      label: 'Instagram (Meta Graph)',
      category: 'social',
      status: lookup('META_APP_ID') === 'configured' && lookup('META_APP_SECRET') === 'configured' ? 'configured' : 'not_configured',
      envKeys: ['META_APP_ID', 'META_APP_SECRET'],
      consoleUrl: 'https://developers.facebook.com/apps',
    },
    // ── Storage
    {
      id: 's3',
      label: 'AWS S3 (storage)',
      category: 'storage',
      status:
        lookup('S3_ACCESS_KEY_ID') === 'configured' &&
        lookup('S3_SECRET_ACCESS_KEY') === 'configured' &&
        lookup('S3_BUCKET_ASSETS') === 'configured'
          ? 'configured'
          : 'not_configured',
      envKeys: ['S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET_ASSETS'],
    },
    // ── Billing
    {
      id: 'stripe',
      label: 'Stripe',
      category: 'billing',
      status:
        lookup('STRIPE_SECRET_KEY') === 'configured' && lookup('STRIPE_WEBHOOK_SECRET') === 'configured'
          ? 'configured'
          : 'not_configured',
      envKeys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY'],
      consoleUrl: 'https://dashboard.stripe.com/apikeys',
    },
    // ── Auth providers
    {
      id: 'google-oauth',
      label: 'Google sign-in (web)',
      category: 'auth',
      status: pk('GOOGLE_OAUTH_URL'),
      envKeys: ['NEXT_PUBLIC_GOOGLE_OAUTH_URL'],
      consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    },
    {
      id: 'apple-oauth',
      label: 'Apple sign-in (web)',
      category: 'auth',
      status: pk('APPLE_OAUTH_URL'),
      envKeys: ['NEXT_PUBLIC_APPLE_OAUTH_URL'],
      consoleUrl: 'https://developer.apple.com/account/resources/identifiers',
    },
  ];
}

/** Filter to a single category. */
export function byCategory(p: ProviderInfo[], cat: ProviderInfo['category']): ProviderInfo[] {
  return p.filter((x) => x.category === cat);
}

/** "configured" count for a category. */
export function configuredCount(p: ProviderInfo[], cat: ProviderInfo['category']): number {
  return byCategory(p, cat).filter((x) => x.status === 'configured').length;
}
