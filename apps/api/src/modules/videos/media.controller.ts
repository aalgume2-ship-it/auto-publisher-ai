/**
 * Signed media URLs — browsers load <video>/<img> WITHOUT Authorization
 * headers, so media bytes ride on short-lived HMAC URLs (presigned-URL
 * pattern): the signature binds the EXACT storageKey + expiry to the session
 * secret. URLs are issued only by authenticated detail/list reads; the raw
 * endpoint is @Public but refuses anything unsigned/expired/foreign.
 */
import { createHmac } from 'node:crypto';
import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AppConfig } from '@aca/config';
import type { DbClient } from '@aca/database';
import { Public } from '../../common/auth/auth.guard.js';
import { ApiError } from '../../common/errors/api-error.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { AssetStore } from './asset-store.js';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ass': 'text/plain; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
};

function sign(key: string, expSec: number, secret: string): string {
  return createHmac('sha256', secret).update(`media:${key}:${expSec}`).digest('base64url');
}

export function rawMediaUrl(secret: string, storageKey: string, expMsFromNow = 2 * 3_600_000): string {
  const e = Math.floor((Date.now() + expMsFromNow) / 1000);
  const s = sign(storageKey, e, secret);
  return `/v1/media/raw?key=${encodeURIComponent(storageKey)}&e=${e}&s=${s}`;
}

@ApiTags('media')
@Controller({ path: 'media', version: '1' })
export class MediaController {
  private readonly secret: string;

  constructor(
    @Inject(API_CONFIG) config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly store: AssetStore,
  ) {
    if (!config.auth.jwtSecret) throw new Error('AUTH_JWT_SECRET required for media signing');
    this.secret = config.auth.jwtSecret;
  }

  @Get('raw')
  @Public()
  @ApiOperation({ operationId: 'mediaRaw', summary: 'Serve media bytes via a short-lived signed URL (2h, Range-aware)' })
  @ApiUnauthorizedResponse({ description: 'Bad/expired signature' })
  async raw(
    @Query('key') key: string | undefined,
    @Query('e') e: string | undefined,
    @Query('s') s: string | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    if (!key) throw new ApiError('VALIDATION_FAILED', 'Missing key', { detail: 'media/raw requires a key query param' });
    if (!e || !s || Number(e) * 1000 < Date.now() || sign(key, Number(e), this.secret) !== s) {
      throw new ApiError('UNAUTHENTICATED', 'Invalid media link', { detail: 'missing/expired/invalid signature — re-fetch the video for a fresh link' });
    }
    let mime = MIME_BY_EXT[extname(key).toLowerCase()] ?? 'application/octet-stream';
    const asset = await this.prisma.asset.findFirst({ where: { storageKey: key }, select: { mimeType: true } });
    if (asset) mime = asset.mimeType;
    const buf = await readFile(this.store.fullPath(key));
    const range = req.headers.range;
    const m = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
      if (start < buf.byteLength && end >= start) {
        return reply
          .status(206)
          .headers({ 'content-type': mime, 'content-range': `bytes ${start}-${end}/${buf.byteLength}`, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' })
          .send(buf.subarray(start, end + 1));
      }
    }
    return reply
      .headers({ 'content-type': mime, 'content-length': String(buf.byteLength), 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' })
      .send(buf);
  }
}
