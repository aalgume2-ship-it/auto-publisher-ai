/**
 * Bunny Storage delivery — mirrors a completed MP4 after the real AI render.
 * The storage key stays private; viewers receive only the configured CDN URL.
 */
import type { BunnyStorageCreds } from '../vault/org-credentials.js';

function cleanHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function assertBunnyHost(host: string, kind: 'storage' | 'cdn'): void {
  const valid =
    kind === 'storage'
      ? host === 'storage.bunnycdn.com' || /^[a-z0-9-]+\.storage\.bunnycdn\.com$/i.test(host)
      : /^[a-z0-9.-]+$/i.test(host) && !host.includes('..');
  if (!valid) throw new Error(`invalid Bunny ${kind} hostname`);
}

export async function uploadMp4ToBunnyStorage(
  cred: BunnyStorageCreds,
  objectPath: string,
  data: Buffer,
): Promise<{ cdnUrl: string; objectPath: string }> {
  const storageEndpoint = cleanHost(cred.storageEndpoint || 'storage.bunnycdn.com');
  const cdnHostname = cleanHost(cred.cdnHostname);
  assertBunnyHost(storageEndpoint, 'storage');
  assertBunnyHost(cdnHostname, 'cdn');
  if (!/^[a-z0-9-]+$/i.test(cred.storageZone)) throw new Error('invalid Bunny storage zone name');
  if (!cred.accessKey) throw new Error('Bunny storage access key is missing');

  const encodedPath = objectPath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  const uploadUrl = `https://${storageEndpoint}/${encodeURIComponent(cred.storageZone)}/${encodedPath}`;
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      AccessKey: cred.accessKey,
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 220);
    throw new Error(`Bunny Storage upload ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return {
    objectPath,
    cdnUrl: `https://${cdnHostname}/${encodedPath}`,
  };
}
