import { NextResponse } from 'next/server';
export async function GET() {
  const upstream = process.env.API_UPSTREAM || '';
  const hint = upstream ? `${upstream.slice(0, 20)}...${upstream.slice(-15)}` : null;
  return NextResponse.json({
    API_UPSTREAM_set: !!upstream,
    API_UPSTREAM_hint: hint,
    API_UPSTREAM_len: upstream.length,
    isAws: upstream.includes('amazonaws.com') || /^https:\/\/api\./.test(upstream),
    isRender: upstream.includes('onrender.com'),
    timestamp: new Date().toISOString(),
  });
}
