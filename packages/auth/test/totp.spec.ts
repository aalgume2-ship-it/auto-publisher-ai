import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpCode,
  totpUri,
  verifyTotp,
} from '../src/totp.js';

// RFC 6238 reference vectors (SHA-1, 8 digits, T0=0, X=30 s):
// secret = ASCII "12345678901234567890" → base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC6238_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC6238_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1_111_111_109, '07081804'],
  [1_111_111_111, '14050471'],
  [1_234_567_890, '89005924'],
  [2_000_000_000, '69279037'],
  [20_000_000_000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  it('matches the official RFC 6238 SHA-1 reference vectors', () => {
    for (const [timeSec, expected] of RFC6238_VECTORS) {
      expect(totpCode(RFC6238_SECRET, { digits: 8, forTimeSec: timeSec }), `t=${timeSec}`).toBe(expected);
    }
  });

  it('verify accepts current step and ±1 window, rejects beyond', () => {
    const t = 1_000_000_000;
    const here = totpCode(RFC6238_SECRET, { digits: 6, forTimeSec: t });
    const prev = totpCode(RFC6238_SECRET, { digits: 6, forTimeSec: t - 30 });
    const next = totpCode(RFC6238_SECRET, { digits: 6, forTimeSec: t + 30 });
    const beyond = totpCode(RFC6238_SECRET, { digits: 6, forTimeSec: t + 90 });
    expect(verifyTotp(RFC6238_SECRET, here, { forTimeSec: t })).toBe(true);
    expect(verifyTotp(RFC6238_SECRET, prev, { forTimeSec: t })).toBe(true);
    expect(verifyTotp(RFC6238_SECRET, next, { forTimeSec: t })).toBe(true);
    expect(verifyTotp(RFC6238_SECRET, beyond, { forTimeSec: t })).toBe(beyond === here || beyond === prev || beyond === next);
  });

  it('rejects malformed codes without throwing', () => {
    for (const bad of ['', '12345', 'abcdef', '123456789', '12 34 56']) {
      expect(verifyTotp(RFC6238_SECRET, bad)).toBe(false);
    }
  });

  it('base32 round-trips; decode rejects out-of-alphabet input', () => {
    const buf = Buffer.from('AutoCreator!2026');
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(() => base32Decode('not-valid!!')).toThrow('malformed base32 secret');
    expect(base32Decode('gezdgnbvgy3tqojq')).toEqual(base32Decode('GEZDGNBVGY3TQOJQ')); // case-insensitive
  });

  it('generates 160-bit secrets and well-formed otpauth URIs', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret).length).toBe(20);
    const uri = totpUri({ issuer: 'AutoCreator AI', accountName: 'demo@autocreator.test', secretBase32: secret });
    expect(uri).toBe(
      `otpauth://totp/AutoCreator%20AI:demo%40autocreator.test?secret=${secret}&issuer=AutoCreator%20AI&algorithm=SHA1&digits=6&period=30`,
    );
  });
});
