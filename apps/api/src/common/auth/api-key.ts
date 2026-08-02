/**
 * API keys (`X-API-Key`, docs/API.md §1 AuthN mode b).
 *
 * Wire format: `aca_<prefix>_<secret>` — prefix is the display/audit fragment
 * stored on ApiKey.prefix; authentication is by sha256(key) == api_keys.keyHash
 * (unique index). The raw key is NEVER stored.
 */
import { createHash } from 'node:crypto';
import { apiErrors } from '../errors/api-error.js';

const API_KEY_REGEX = /^aca_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{32,64}$/;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface ParsedApiKey {
  key: string;
  prefix: string;
  keyHash: string;
}

/** Parses + hashes; throws UNAUTHENTICATED on malformed input (prefix alone is not enough). */
export function parseApiKey(raw: string): ParsedApiKey {
  if (!API_KEY_REGEX.test(raw)) {
    throw apiErrors.unauthenticated('malformed api key');
  }
  const prefix = raw.slice(4, 12);
  return { key: raw, prefix, keyHash: sha256Hex(raw) };
}
