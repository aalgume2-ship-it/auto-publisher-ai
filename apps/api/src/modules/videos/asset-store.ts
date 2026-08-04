/**
 * AssetStore — binary persistence for generated media.
 *
 * Free-tier reality (no bundled object storage on Render free): the Render
 * instance disk (default /tmp/aca-storage) is EPHEMERAL — it is wiped on
 * spin-down/restart, which previously stranded READY videos whose MP4 bytes
 * had vanished (media routes 500d). Durability is therefore two-tier:
 *
 *   put()  → disk cache  +  asset_blobs row (bytea in Postgres — durable)
 *   read() → disk cache, else DB row → rehydrate cache → serve
 *
 * Zero new services/env vars: the blob table lives in the same DATABASE_URL
 * Postgres we already run; ensure-vector.mjs creates it idempotently at boot.
 * The Asset DB row (storageKey/mimeType) remains the durable metadata record,
 * and the pipeline is idempotent so even a fully lost blob can be rebuilt via
 * POST /videos/:id/regenerate. Swapping to S3/Supabase Storage later =
 * replacing this class ONLY.
 */
import { Inject, Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { DbClient } from '@aca/database';
import { PRISMA } from '../../common/prisma.provider.js';

@Injectable()
export class AssetStore {
  readonly root: string = process.env.ACA_STORAGE_DIR ?? join(tmpdir(), 'aca-storage');

  constructor(@Inject(PRISMA) private readonly prisma: DbClient) {}

  async put(orgId: string, fileName: string, data: Buffer): Promise<{ storageKey: string; bytes: number }> {
    const safe = fileName.replace(/[^\w.\-]+/g, '_');
    const storageKey = `assets/${orgId}/${randomUUID()}/${safe}`;
    const full = this.fullPath(storageKey);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    // Durable copy — the ONLY guarantee bytes survive an ephemeral-disk wipe.
    await this.prisma.$executeRaw`INSERT INTO asset_blobs (storage_key, data) VALUES (${storageKey}, ${data}) ON CONFLICT (storage_key) DO NOTHING`;
    return { storageKey, bytes: data.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    const full = this.fullPath(storageKey);
    try {
      return await readFile(full);
    } catch {
      const rows = await this.prisma.$queryRaw<{ data: Buffer }[]>`
        SELECT data FROM asset_blobs WHERE storage_key = ${storageKey} LIMIT 1`;
      if (!rows.length) throw new Error(`asset bytes missing from disk and database: ${storageKey}`);
      const data = Buffer.from(rows[0]!.data);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data); // rehydrate the hot cache for subsequent reads
      return data;
    }
  }

  async size(storageKey: string): Promise<number> {
    try {
      return (await stat(this.fullPath(storageKey))).size;
    } catch {
      return (await this.read(storageKey)).byteLength;
    }
  }

  fullPath(storageKey: string): string {
    const p = normalize(join(this.root, storageKey));
    if (!p.startsWith(normalize(this.root))) throw new Error('storageKey escapes the asset root');
    return p;
  }
}
