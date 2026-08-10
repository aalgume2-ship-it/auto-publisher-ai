/**
 * Server route — reports which providers are configured.
 *
 * Unlike the in-bundle provider-status (which only sees NEXT_PUBLIC_*),
 * this route runs in the Node runtime and can see every env var
 * (RUNWAY_API_KEY, STRIPE_SECRET_KEY, ...).
 *
 * Returns a tiny JSON summary. The UI uses it for the
 * "Not configured — add API_KEY" hints in Create Studio,
 * Connections, Billing, etc.
 *
 * No secrets are leaked — we only return `true` / `false` per env var.
 */

import { NextResponse } from 'next/server';

function has(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

export async function GET() {
  const groups = {
    video: {
      runway: has('RUNWAY_API_KEY'),
      luma: has('LUMA_API_KEY'),
      fal: has('FAL_API_KEY'),
      replicate: has('REPLICATE_API_TOKEN'),
    },
    image: {
      openai: has('OPENAI_API_KEY'),
      stability: has('STABILITY_API_KEY'),
      google_ai: has('GOOGLE_AI_API_KEY'),
    },
    llm: {
      openai: has('OPENAI_API_KEY'),
      groq: has('GROQ_API_KEY'),
      gemini: has('GEMINI_API_KEY'),
      openrouter: has('OPENROUTER_API_KEY'),
      deepseek: has('DEEPSEEK_API_KEY'),
    },
    voice: {
      elevenlabs: has('ELEVENLABS_API_KEY'),
      google_tts: has('GOOGLE_TTS_CREDENTIALS_JSON'),
    },
    social: {
      youtube: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET'),
      tiktok: has('TIKTOK_CLIENT_KEY') && has('TIKTOK_CLIENT_SECRET'),
      instagram: has('META_APP_ID') && has('META_APP_SECRET'),
    },
    storage: {
      s3:
        has('S3_ACCESS_KEY_ID') &&
        has('S3_SECRET_ACCESS_KEY') &&
        has('S3_BUCKET_ASSETS'),
    },
    billing: {
      stripe: has('STRIPE_SECRET_KEY') && has('STRIPE_WEBHOOK_SECRET'),
    },
    auth: {
      jwt_secret: has('AUTH_JWT_SECRET'),
      google_oauth: has('NEXT_PUBLIC_GOOGLE_OAUTH_URL'),
      apple_oauth: has('NEXT_PUBLIC_APPLE_OAUTH_URL'),
    },
    runtime: {
      api_upstream: has('API_UPSTREAM'),
      database_url: has('DATABASE_URL'),
      redis_url: has('REDIS_URL'),
    },
  };

  // Count configured per group for quick summary.
  const summary: Record<string, { configured: number; total: number }> = {};
  for (const [k, v] of Object.entries(groups)) {
    const entries = Object.values(v as Record<string, boolean>);
    summary[k] = {
      configured: entries.filter(Boolean).length,
      total: entries.length,
    };
  }

  return NextResponse.json(
    { groups, summary, timestamp: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
