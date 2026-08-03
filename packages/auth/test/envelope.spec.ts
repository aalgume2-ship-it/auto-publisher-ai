import { describe, expect, it } from 'vitest';
import { EnvelopeDecryptError, SecretEnvelope, keyringFromHex } from '../src/envelope.js';

const KEY_A = Buffer.alloc(32, 0x11);
const KEY_B = Buffer.alloc(32, 0x22);
const HEX_64 = 'a'.repeat(64);

describe('SecretEnvelope (AES-256-GCM)', () => {
  it('round-trips with keyId metadata', () => {
    const env = new SecretEnvelope({ key: KEY_A, keyId: 'k1' });
    const { ciphertext, keyId } = env.encrypt('JBSWY3DPEHPK3PXP');
    expect(keyId).toBe('k1');
    expect(ciphertext.startsWith('v1.k1.')).toBe(true);
    expect(env.decrypt(ciphertext)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('different encryptions of the same secret differ (random IV)', () => {
    const env = new SecretEnvelope({ key: KEY_A, keyId: 'k1' });
    expect(env.encrypt('same-secret').ciphertext).not.toBe(env.encrypt('same-secret').ciphertext);
  });

  it('wrong key or tampered ciphertext → EnvelopeDecryptError (never plaintext)', () => {
    const envA = new SecretEnvelope({ key: KEY_A, keyId: 'k1' });
    const envB = new SecretEnvelope({ key: KEY_B, keyId: 'k2' });
    const { ciphertext } = envA.encrypt('topsecret');
    expect(() => envB.decrypt(ciphertext)).toThrow(EnvelopeDecryptError); // unknown keyId
    const envBTolerant = new SecretEnvelope({ key: KEY_B, keyId: 'k2', previous: [{ key: KEY_B, keyId: 'k1' }] });
    expect(() => envBTolerant.decrypt(ciphertext)).toThrow(EnvelopeDecryptError); // right keyId, wrong bytes
    const tampered = `${ciphertext.slice(0, -4)}AAAA`;
    expect(() => envA.decrypt(tampered)).toThrow(EnvelopeDecryptError); // GCM tag mismatch
    expect(() => envA.decrypt('garbage')).toThrow(EnvelopeDecryptError);
  });

  it('previous keys decrypt during rotation window; current key encrypts', () => {
    const oldEnv = new SecretEnvelope({ key: KEY_A, keyId: 'k1' });
    const { ciphertext } = oldEnv.encrypt('rotatable');
    const newEnv = new SecretEnvelope({ key: KEY_B, keyId: 'k2', previous: [{ key: KEY_A, keyId: 'k1' }] });
    expect(newEnv.decrypt(ciphertext)).toBe('rotatable');
    expect(newEnv.encrypt('x').ciphertext.startsWith('v1.k2.')).toBe(true);
  });

  it('keyringFromHex validates strictly (fail-closed)', () => {
    const ring = keyringFromHex(HEX_64, 'local-v1');
    expect(ring.key).toEqual(Buffer.alloc(32, 0xaa));
    expect(() => keyringFromHex('zz'.repeat(32), 'x')).toThrow('32 bytes hex');
    expect(() => keyringFromHex('a'.repeat(62), 'x')).toThrow('32 bytes hex');
    expect(() => new SecretEnvelope({ key: Buffer.alloc(16), keyId: 'x' })).toThrow('32 bytes');
  });
});
