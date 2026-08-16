/**
 * AssetStore — durable binary persistence for generated/uploaded media.
 *
 * Two real tiers (never a mock):
 *   1. S3 (or S3-compatible) when S3_BUCKET_* is set — the production path
 *      uses the ECS task role; explicit credentials are optional for local use.
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

const TEXT_SAFE_BINARY_PREFIX = Buffer.from('ACA_BASE64_V1\n', 'ascii');

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
    if (c.bucketAssets) {
      const cfg: S3ClientConfig = {
        region: c.region,
      };
      // ECS uses the task role through the AWS SDK default credential chain.
      // Explicit keys remain supported for local S3-compatible development.
      if (c.accessKeyId && c.secretAccessKey) {
        cfg.credentials = { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey };
      }
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
    // MP4 payloads have been observed crossing one production storage adapter
    // through UTF-8, replacing high bytes with EF BF BD. Persist them as
    // marked Base64 text and decode transparently on reads.
    const durableData = /\.mp4$/i.test(fileName)
      ? Buffer.concat([TEXT_SAFE_BINARY_PREFIX, Buffer.from(data.toString('base64'), 'ascii')])
      : data;

    if (this.s3 && this.bucketAssets) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketAssets,
          Key: storageKey,
          Body: durableData,
          ContentType: /\.mp4$/i.test(fileName) ? 'text/plain; charset=us-ascii' : mimeFor(fileName),
        }),
      );
    } else {
      // Durable copy — the ONLY guarantee bytes survive an ephemeral-disk wipe.
      await this.prisma.assetBlob.upsert({
        where: { storageKey },
        update: {},
        create: { storageKey, data: Buffer.from(durableData) },
      });
    }
    return { storageKey, bytes: data.byteLength };
  }

  /** Persist an MP4 that is already Base64 without carrying raw media bytes across service boundaries. */
  async putBase64(orgId: string, fileName: string, base64: string): Promise<{ storageKey: string; bytes: number }> {
    const safe = fileName.replace(/[^\w.\-]+/g, '_');
    const storageKey = `assets/${orgId}/${randomUUID()}/${safe}`;
    const full = this.fullPath(storageKey);
    const bytes = Buffer.byteLength(base64, 'base64');
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(base64, 'base64'));
    const durableData = Buffer.concat([TEXT_SAFE_BINARY_PREFIX, Buffer.from(base64, 'ascii')]);
    if (this.s3 && this.bucketAssets) {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucketAssets,
        Key: storageKey,
        Body: durableData,
        ContentType: 'text/plain; charset=us-ascii',
      }));
    } else {
      await this.prisma.assetBlob.upsert({
        where: { storageKey },
        update: {},
        create: { storageKey, data: durableData },
      });
    }
    return { storageKey, bytes };
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
        const data = this.decodeDurable(Buffer.from(await body.transformToByteArray() as unknown as ArrayBuffer));
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
    const data = this.decodeDurable(Buffer.from(blob.data));
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
  async presignedUrl(storageKey: string, ttlSec?: number, downloadName?: string): Promise<string | null> {
    if (!this.s3 || !this.bucketAssets) return null;
    if (/\.mp4$/i.test(storageKey)) return null;
    const ttl = ttlSec ?? this.config.s3.presignTtlSec;
    return presign(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucketAssets,
        Key: storageKey,
        ...(downloadName
          ? {
              ResponseContentDisposition: `attachment; filename="${downloadName.replace(/["\\]/g, '_')}"`,
              ResponseContentType: 'video/mp4',
            }
          : {}),
      }),
      { expiresIn: ttl },
    );
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

  private decodeDurable(data: Buffer): Buffer {
    if (data.subarray(0, TEXT_SAFE_BINARY_PREFIX.byteLength).equals(TEXT_SAFE_BINARY_PREFIX)) {
      return Buffer.from(data.subarray(TEXT_SAFE_BINARY_PREFIX.byteLength).toString('ascii'), 'base64');
    }
    return data;
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
