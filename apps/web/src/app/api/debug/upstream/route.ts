import { NextResponse } from 'next/server';

export async function GET() {
  const upstream = process.env.API_UPSTREAM || '';
  const hint = upstream ? `${upstream.slice(0, 20)}...${upstream.slice(-15)}` : null;
  return NextResponse.json({
    API_UPSTREAM_set: !!upstream,
    API_UPSTREAM_hint: hint,
    API_UPSTREAM_len: upstream.length,
    isAWS: upstream.includes('amazonaws.com') || upstream.includes('awsapps.com'),
    isVercel: upstream.includes('vercel.app'),
    isLocalhost: upstream.includes('localhost') || upstream.includes('127.0.0.1'),
    timestamp: new Date().toISOString(),
  });
}
