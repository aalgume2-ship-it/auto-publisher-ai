/**
 * AssetStore — binary persistence for generated media.
 * Free-tier reality (no bundled object storage on Render free): files live on
 * the service disk under ACA_STORAGE_DIR (default /tmp/aca-storage) and are
 * served to the browser through the authenticated /assets/:id/content route.
 * The Asset DB row (storageKey/cdnPath metadata) is the durable record; the
 * file pipeline is fully idempotent so any asset can be regenerated on demand.
 * Swapping to S3/Supabase Storage later = replacing this class ONLY.
 */
import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AssetStore {
  readonly root: string = process.env.ACA_STORAGE_DIR ?? join(tmpdir(), 'aca-storage');

  async put(orgId: string, fileName: string, data: Buffer): Promise<{ storageKey: string; bytes: number }> {
    const safe = fileName.replace(/[^\w.\-]+/g, '_');
    const storageKey = `assets/${orgId}/${randomUUID()}/${safe}`;
    const full = this.fullPath(storageKey);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return { storageKey, bytes: data.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.fullPath(storageKey));
  }

  async size(storageKey: string): Promise<number> {
    return (await stat(this.fullPath(storageKey))).size;
  }

  fullPath(storageKey: string): string {
    const p = normalize(join(this.root, storageKey));
    if (!p.startsWith(normalize(this.root))) throw new Error('storageKey escapes the asset root');
    return p;
  }
}
