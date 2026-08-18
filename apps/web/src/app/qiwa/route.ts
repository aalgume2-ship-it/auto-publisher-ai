import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const source = 'https://raw.githubusercontent.com/aalgume2-ship-it/auto-publisher-ai/main/qiwa-control-center/index.html';
  const res = await fetch(source, { cache: 'no-store' });
  if (!res.ok) {
    return new NextResponse('تعذر تحميل مركز أعمال قوى', { status: 502 });
  }
  const html = await res.text();
  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}
