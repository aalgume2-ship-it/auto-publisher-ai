/**
 * AssetStore — durable binary persistence for generated/uploaded media.
 *
 * Two real tiers (never a mock):
 *   1. S3 (or S3-compatible) when AWS_ACCESS_KEY_ID + S3_BUCKET_* are set —
 *      the production path on AWS (buckets provisioned by infra/aws).
 *   2. Postgres AssetBlob (bytea) when S3 is not configured — durable,
 *      zero extra services, used by sandbox/dev.
 * The local disk is only a hot cache in both modes.
 */
import type { AppConfig } from '@aca/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, type S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import type { DbClient } from '@aca/database';
import { mkdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export class AssetStore {
  readonly root: string = process.env.ACA_STORAGE_DIR ?? join(tmpdir(), 'aca-storage');
  private readonly s3: S3Client | null;
  private readonly bucketAssets: string | null;
  private readonly bucketRenders: string | null;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: DbClient,
  ) {
    const c = config.s3;
    if (c.accessKeyId && c.secretAccessKey && c.bucketAssets) {
      const cfg: S3ClientConfig = {
        region: c.region,
        credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      };
      if (c.endpoint) cfg.endpoint = c.endpoint;
      this.s3 = new S3Client(cfg);
      this.bucketAssets = c.bucketAssets;
      this.bucketRenders = c.bucketRenders ?? c.bucketAssets;
    } else {
      this.s3 = null;
      this.bucketAssets = null;
      this.bucketRenders = null;
    }
  }

  /** True when the S3 tier is active (health/status endpoints surface this). */
  get s3Enabled(): boolean {
    return this.s3 !== null;
  }

  async put(orgId: string, fileName: string, data: Buffer): Promise<{ storageKey: string; bytes: number }> {
    const safe = fileName.replace(/[^\w.\-]+/g, '_');
    const storageKey = `assets/${orgId}/${randomUUID()}/${safe}`;
    const full = this.fullPath(storageKey);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data); // hot cache

    if (this.s3 && this.bucketAssets) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketAssets,
          Key: storageKey,
          Body: data,
          ContentType: mimeFor(fileName),
        }),
      );
    } else {
      // Durable copy — the ONLY guarantee bytes survive an ephemeral-disk wipe.
      await this.prisma.assetBlob.upsert({
        where: { storageKey },
        update: {},
        create: { storageKey, data: Buffer.from(data) },
      });
    }
    return { storageKey, bytes: data.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    const full = this.fullPath(storageKey);
    try {
      return await readFile(full);
    } catch {
      /* cache miss → durable tier */
    }
    if (this.s3 && this.bucketAssets) {
      try {
        const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucketAssets, Key: storageKey }));
        const body = res.Body;
        if (!body) throw new Error(`s3 object empty: ${storageKey}`);
        const data = Buffer.from(await body.transformToByteArray() as unknown as ArrayBuffer);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, data); // rehydrate hot cache
        return data;
      } catch (err) {
        if (err instanceof Error && (err as { name?: string }).name === 'NoSuchKey') {
          throw new Error(`asset bytes missing from s3 and disk: ${storageKey}`);
        }
        throw err;
      }
    }
    const blob = await this.prisma.assetBlob.findUnique({ where: { storageKey }, select: { data: true } });
    if (!blob) throw new Error(`asset bytes missing from disk and database: ${storageKey}`);
    const data = Buffer.from(blob.data);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data); // rehydrate the hot cache for subsequent reads
    return data;
  }

  async size(storageKey: string): Promise<number> {
    try {
      return (await stat(this.fullPath(storageKey))).size;
    } catch {
      return (await this.read(storageKey)).byteLength;
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.fullPath(storageKey));
    } catch {
      /* cache miss is fine */
    }
    if (this.s3 && this.bucketAssets) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucketAssets, Key: storageKey }));
    }
    await this.prisma.assetBlob.deleteMany({ where: { storageKey } });
  }

  /** Presigned S3 GET URL (production download path). Null when S3 is off. */
  async presignedUrl(storageKey: string, ttlSec?: number): Promise<string | null> {
    if (!this.s3 || !this.bucketAssets) return null;
    const ttl = ttlSec ?? this.config.s3.presignTtlSec;
    return presign(this.s3, new GetObjectCommand({ Bucket: this.bucketAssets, Key: storageKey }), { expiresIn: ttl });
  }

  /**
   * Presigned S3 PUT URL for direct browser upload (multipart-ready, up to 5GB).
   * Returns null when S3 is not configured — callers then use the base64 path.
   */
  async presignPut(orgId: string, fileName: string, contentType: string, ttlSec?: number): Promise<{ url: string; storageKey: string } | null> {
    if (!this.s3 || !this.bucketAssets) return null;
    const safe = fileName.replace(/[^\w.\-]+/g, '_');
    const storageKey = `uploads/${orgId}/${randomUUID()}/${safe}`;
    const ttl = ttlSec ?? this.config.s3.presignTtlSec;
    const url = await presign(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucketAssets, Key: storageKey, ContentType: contentType }),
      { expiresIn: ttl },
    );
    return { url, storageKey };
  }

  /** Finalize an upload that went through a presigned PUT: verify + row creation happens in VideosService. */
  async head(storageKey: string): Promise<{ size: number; contentType: string | null } | null> {
    if (!this.s3 || !this.bucketAssets) return null;
    const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucketAssets, Key: storageKey }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  }

  fullPath(storageKey: string): string {
    const p = normalize(join(this.root, storageKey));
    if (!p.startsWith(normalize(this.root))) throw new Error('storageKey escapes the asset root');
    return p;
  }
}

function mimeFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
    ass: 'text/plain; charset=utf-8', srt: 'text/plain; charset=utf-8',
  };
  return map[ext] ?? 'application/octet-stream';
}
