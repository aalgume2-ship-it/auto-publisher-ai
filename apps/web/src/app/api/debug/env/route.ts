import { NextResponse } from 'next/server';

export async function GET() {
  const env = process.env;
  // Redacted info - never leak secrets, just presence and partial hints
  const info = {
    vercel: {
      isVercel: !!env.VERCEL,
      env: env.VERCEL_ENV,
      url: env.VERCEL_URL,
      region: env.VERCEL_REGION,
    },
    upstreams: {
      API_UPSTREAM_set: !!env.API_UPSTREAM,
      API_UPSTREAM_len: env.API_UPSTREAM?.length || 0,
      API_UPSTREAM_hint: env.API_UPSTREAM ? `${env.API_UPSTREAM.slice(0, 15)}...${env.API_UPSTREAM.slice(-10)}` : null,
      NEXT_PUBLIC_API_BASE_set: !!env.NEXT_PUBLIC_API_BASE,
      NEXT_PUBLIC_API_BASE_val: env.NEXT_PUBLIC_API_BASE || null,
      API_PUBLIC_URL_set: !!env.API_PUBLIC_URL,
      NEXT_PUBLIC_GOOGLE_OAUTH_URL_set: !!env.NEXT_PUBLIC_GOOGLE_OAUTH_URL,
    },
    database: {
      DATABASE_URL_set: !!env.DATABASE_URL,
      REDIS_URL_set: !!env.REDIS_URL,
      AUTH_JWT_SECRET_set: !!env.AUTH_JWT_SECRET,
    },
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(info);
}
