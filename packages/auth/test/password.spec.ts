import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCRYPT_PARAMS,
  hashPassword,
  needsRehash,
  parsePasswordHash,
  verifyPassword,
} from '../src/password.js';

describe('password hashing (scrypt)', () => {
  it('round-trips: hash → verify true; different password → false', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.startsWith('scrypt$16384$8$1$')).toBe(true);
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong password 1234', stored)).resolves.toBe(false);
  });

  it('salts are random: same password twice → different hashes', async () => {
    const a = await hashPassword('identical-password-1');
    const b = await hashPassword('identical-password-1');
    expect(a).not.toBe(b);
    await expect(verifyPassword('identical-password-1', a)).resolves.toBe(true);
    await expect(verifyPassword('identical-password-1', b)).resolves.toBe(true);
  });

  it('parse exposes params; needsRehash flags cost drift only', async () => {
    const legacy = await hashPassword('a-very-long-password', { N: 2048, r: 8, p: 1 });
    const current = await hashPassword('a-very-long-password');
    expect(parsePasswordHash(legacy).params).toEqual({ N: 2048, r: 8, p: 1 });
    expect(needsRehash(legacy)).toBe(true);
    expect(needsRehash(current)).toBe(false);
    // legacy params still verify (parameters travel with the hash)
    await expect(verifyPassword('a-very-long-password', legacy)).resolves.toBe(true);
  });

  it('verify is false (never throws) on malformed/tampered stored values', async () => {
    for (const bad of ['', 'bcrypt$2y$10$xxx', 'scrypt$abc$8$1$AA$BB', 'scrypt$16384$8$1$$$', 'plaintext']) {
      await expect(verifyPassword('whatever-123456', bad)).resolves.toBe(false);
    }
    const stored = await hashPassword('tamper-target-pass');
    const tampered = `${stored.slice(0, -4)}AAAA`;
    await expect(verifyPassword('tamper-target-pass', tampered)).resolves.toBe(false);
  });

  it('params constant matches documented OWASP cost tier', () => {
    expect(CURRENT_SCRYPT_PARAMS).toEqual({ N: 16_384, r: 8, p: 1 });
  });
});
