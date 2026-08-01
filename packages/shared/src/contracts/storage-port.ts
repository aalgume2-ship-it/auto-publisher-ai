/**
 * Frozen contract C5 — Storage (docs/Contracts.md).
 * Port matrix (Architecture §16): S3/MinIO/R2 adapter today; GCS/Azure swap path.
 * Keys are tenant-namespaced by the adapter (`cdnUrl` is the only public surface —
 * raw bucket URLs never reach clients).
 */
import { z } from 'zod';

/**
 * Mirrors the AssetType values in packages/database/prisma/schema.prisma
 * (kept as string union — @aca/shared must not import the Prisma client).
 * Drift-check: CI asserts parity with the DB enum.
 */
export const AssetTypeSchema = z.enum([
  'VIDEO_CLIP',
  'IMAGE',
  'AUDIO',
  'MUSIC',
  'VOICEOVER',
  'THUMBNAIL',
  'SUBTITLE',
  'RENDER_LOG',
  'BRAND',
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export type StorageClass = 'video' | 'image' | 'audio' | 'document' | 'subtitle';

export interface IStoragePort {
  /**
   * Starts a direct-to-storage upload (presigned PUT/POST). The storageKey is
   * server-minted (uuidv7 path) — clients never choose keys.
   */
  createUploadIntent(req: {
    orgId: string;
    type: AssetType;
    bytes: number;
    mimeType: string;
  }): Promise<{ storageKey: string; uploadUrl: string; headers: Record<string, string> }>;

  head(storageKey: string): Promise<{ bytes: number; mimeType: string } | null>;

  copy(srcKey: string, dstKey: string): Promise<void>;

  delete(storageKey: string): Promise<void>;

  /** Short-lived read URL — upload/QA flow only; public delivery ALWAYS goes via cdnUrl. */
  presignRead(storageKey: string, ttlSec: number): Promise<string>;

  /**
   * Absolute, CDN-fronted, immutable URL. `privateClass` assets get signed URLs
   * at the CDN edge — never raw origin URLs.
   */
  cdnUrl(cdnPath: string, opts?: { privateClass?: boolean }): string;
}
