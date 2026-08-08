import { NextResponse } from 'next/server';
const TOKEN = process.env.RAILWAY_TOKEN || "ee43f749-e050-4229-afa0-6b03e13f6f03";
export async function GET() {
  try {
    const query = `query { me { email projects(first: 20) { edges { node { id name services(first: 20) { edges { node { id name domains { edges { node { domain } } } serviceInstances(first: 5) { edges { node { domains { edges { node { domain } } } } } } } } } } } } }`;
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 2000) }; }
    return NextResponse.json({ status: res.status, data: json, tokenHint: `${TOKEN.slice(0, 6)}...${TOKEN.slice(-4)}`, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed', stack: e?.stack?.slice(0, 1000) }, { status: 500 });
  }
}
