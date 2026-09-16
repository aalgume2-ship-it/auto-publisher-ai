/**
 * Resolved on-disk locations for locally-managed media (voice packs +
 * realistic footage clips). Explicit config (ACA_LOCAL_VOICES_DIR /
 * ACA_LOCAL_FOOTAGE_DIR) always wins; otherwise they live beside the
 * asset store under ACA_STORAGE_DIR — the same place media already
 * persists — so operators and the import API share one source of truth.
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AppConfig } from '@aca/config';

function storageRoot(): string {
  return process.env.ACA_STORAGE_DIR ?? join(tmpdir(), 'aca-storage');
}

export function resolveVoicesDir(config: Pick<AppConfig, 'localMedia'>): string {
  return config.localMedia.voicesDir ?? join(storageRoot(), 'voices');
}

export function resolveFootageDir(config: Pick<AppConfig, 'localMedia'>): string {
  return config.localMedia.footageDir ?? join(storageRoot(), 'footage');
}
