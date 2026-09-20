/**
 * Local media library — import endpoints for offline-realistic production.
 *
 * The sandbox/air-gapped server cannot reach model hubs or stock-footage
 * CDNs, but the USER'S BROWSER can. The web app fetches neural voice packs
 * (Piper ONNX) and real footage clips client-side, then ships the raw bytes
 * here (application/octet-stream — registered in main.ts) into the local
 * library directories the generation pipeline already reads:
 *
 *   POST /v1/organizations/:orgId/local-media/voice?fileName=ar_JO-kareem-medium.onnx
 *   POST /v1/organizations/:orgId/local-media/footage?fileName=clip.mp4&tags=space,galaxy
 *   GET  /v1/organizations/:orgId/local-media          → library status
 *   DELETE /v1/organizations/:orgId/local-media/footage/:file
 *
 * Voice packs land in ACA_LOCAL_VOICES_DIR (default <storage>/voices);
 * footage in ACA_LOCAL_FOOTAGE_DIR (default <storage>/footage) with a
 * ffprobe-validated footage-index.json. Access mirrors normal asset
 * uploads (tenant + asset.upload capability).
 */
import { BadRequestException, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AppConfig } from '@aca/config';
import { Inject } from '@nestjs/common';
import {
  resolveVoicesDir,
  resolveFootageDir,
  readFootageIndex,
  addFootageClip,
  removeFootageClip,
} from '@aca/video-engine';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { createLogger, type Logger } from '@aca/logger';

const VOICE_EXTENSIONS = new Set(['.onnx', '.json']);
const MAX_VOICE_BYTES = 220 * 1024 * 1024; // largest piper voices stay well under this
const MAX_FOOTAGE_BYTES = 600 * 1024 * 1024;

function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

@ApiTags('local-media')
@Controller({ path: 'organizations/:orgId/local-media', version: '1' })
export class LocalMediaController {
  private readonly logger: Logger;

  constructor(@Inject(API_CONFIG) private readonly config: AppConfig) {
    this.logger = createLogger({ service: 'apps/api', level: 'info' }).child({ module: 'local-media' });
  }

  @Get()
  @TenantRequired()
  @RequiresCapabilities('asset.upload')
  @ApiOperation({ operationId: 'localMediaStatus', summary: 'List locally installed voice packs and footage clips (offline production library)' })
  async status(): Promise<{ voices: { file: string; neural: boolean }[]; footage: Awaited<ReturnType<typeof readFootageIndex>>; localGeneration: boolean }> {
    const voicesDir = resolveVoicesDir(this.config);
    const files = existsSync(voicesDir) ? await readdir(voicesDir) : [];
    const voices = files
      .filter((f) => VOICE_EXTENSIONS.has(ext(f)))
      .map((f) => ({ file: f, neural: ext(f) === '.onnx' }));
    const footage = await readFootageIndex(resolveFootageDir(this.config));
    return { voices, footage, localGeneration: this.config.localMedia.generation };
  }

  @Post('voice')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('asset.upload')
  @ApiOperation({
    operationId: 'localMediaImportVoice',
    summary: 'Import a neural voice pack (Piper *.onnx or *.onnx.json) into the local voice library (raw octet-stream body)',
  })
  async importVoice(@Query('fileName') fileName: string | undefined, @Req() req: FastifyRequest) {
    const safe = this.assertUpload(fileName, VOICE_EXTENSIONS, MAX_VOICE_BYTES, req);
    const voicesDir = resolveVoicesDir(this.config);
    await mkdir(voicesDir, { recursive: true });
    // .onnx.json configs must keep their exact name so the piper scanner pairs them
    await writeFile(join(voicesDir, safe), req.body as Buffer);
    this.logger.info({ file: safe, bytes: (req.body as Buffer).length }, 'local-media.voice.imported');
    return { file: safe, bytes: (req.body as Buffer).length };
  }

  @Post('footage')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('asset.upload')
  @ApiOperation({
    operationId: 'localMediaImportFootage',
    summary: 'Import a real footage clip (mp4/webm/mov) into the local library with topic tags (raw octet-stream body)',
  })
  async importFootage(
    @Query('fileName') fileName: string | undefined,
    @Query('tags') tags: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const safe = this.assertUpload(fileName, new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv']), MAX_FOOTAGE_BYTES, req);
    const body = req.body as Buffer;
    // stage to a temp path, then let the engine validate (ffprobe) + index it
    const staging = join(tmpdir(), `aca-footage-${Date.now()}-${safe}`);
    await writeFile(staging, body);
    try {
      const entry = await addFootageClip(resolveFootageDir(this.config), staging, safe, (tags ?? '').split(',').map((t) => t.trim()).filter(Boolean));
      this.logger.info({ file: entry.file, tags: entry.tags, durationMs: entry.durationMs }, 'local-media.footage.imported');
      return entry;
    } catch (err) {
      throw new BadRequestException(`footage import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  @Delete('footage/:file')
  @TenantRequired()
  @RequiresCapabilities('asset.delete')
  @ApiOperation({ operationId: 'localMediaDeleteFootage', summary: 'Remove a footage clip from the local library' })
  async deleteFootage(@Param() params: { orgId: string; file: string }) {
    const safe = params.file.replace(/[/\\]/g, '_');
    const removed = await removeFootageClip(resolveFootageDir(this.config), safe);
    return { removed, file: safe };
  }

  /** Shared upload sanity: safe name, allowed extension, non-empty in-memory body. */
  private assertUpload(fileName: string | undefined, allowed: Set<string>, maxBytes: number, req: FastifyRequest): string {
    if (!fileName || fileName.length > 160 || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new BadRequestException('fileName query param is required (plain file name, no path)');
    }
    if (!allowed.has(ext(fileName))) {
      throw new BadRequestException(`unsupported file type — allowed: ${[...allowed].join(' ')}`);
    }
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('raw binary body required (Content-Type: application/octet-stream)');
    }
    if (body.length > maxBytes) {
      throw new BadRequestException(`file exceeds ${Math.round(maxBytes / 1048576)}MB limit`);
    }
    return fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  }
}
