/**
 * At-rest envelope encryption for TOTP secrets — AES-256-GCM, node:crypto
 * only. Interim stand-in for the vault/KMS adapter (Security.md §4 / Roadmap
 * Phase-0 "Token vault + KMS"); the stored FORMAT is key-id-namespaced
 * (`v1.<keyId>.<iv>.<tag>.<ct>`) so swapping the key source for KMS later is
 * a configuration change, not a data migration. `User.totpSecretKeyId` in the
 * schema already anticipates this.
 *
 * Fail-closed: no key configured → constructor throws; wrong key → decrypt
 * throws `EnvelopeDecryptError` (auth tag mismatch) — callers map to a
 * retry-safe error, never to silent success.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;

export class EnvelopeDecryptError extends Error {
  constructor() {
    super('envelope decryption failed (wrong key or corrupted ciphertext)');
    this.name = 'EnvelopeDecryptError';
  }
}

export interface EnvelopeKeyring {
  /** Active (encrypt) key — 32 raw bytes. */
  key: Buffer;
  /** Identifier stored alongside ciphertext (`User.totpSecretKeyId`). */
  keyId: string;
  /** Previous keys still allowed to DECRYPT (rotation window). */
  previous?: ReadonlyArray<{ key: Buffer; keyId: string }>;
}

export class SecretEnvelope {
  constructor(private readonly ring: EnvelopeKeyring) {
    if (ring.key.length !== 32) throw new Error('SecretEnvelope: active key must be 32 bytes (AES-256)');
    for (const prev of ring.previous ?? []) {
      if (prev.key.length !== 32) throw new Error(`SecretEnvelope: previous key ${prev.keyId} must be 32 bytes`);
    }
  }

  encrypt(plaintext: string): { ciphertext: string; keyId: string } {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.ring.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const packed = [VERSION, this.ring.keyId, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
    return { ciphertext: packed, keyId: this.ring.keyId };
  }

  decrypt(packed: string): string {
    const parts = packed.split('.');
    if (parts.length !== 5 || parts[0] !== VERSION) throw new EnvelopeDecryptError();
    const [, keyId, ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];
    const key = this.keyFor(keyId);
    if (!key) throw new EnvelopeDecryptError();
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new EnvelopeDecryptError();
    }
  }

  private keyFor(keyId: string): Buffer | undefined {
    if (keyId === this.ring.keyId) return this.ring.key;
    return (this.ring.previous ?? []).find((k) => k.keyId === keyId)?.key;
  }
}

/** Parses the 64-char hex key from config (`AUTH_TOTP_ENCRYPTION_KEY`); fails closed on anything else. */
export function keyringFromHex(hex: string, keyId: string): EnvelopeKeyring {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('TOTP encryption key must be 32 bytes hex-encoded (64 chars)');
  return { key: Buffer.from(hex, 'hex'), keyId };
}
