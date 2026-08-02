import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { uuidv7 } from '@aca/shared';
import { ApiError } from '../src/common/errors/api-error.js';
import { signSessionJwt, verifySessionJwt, type SessionClaims } from '../src/common/auth/session-jwt.js';
import { parseApiKey, sha256Hex } from '../src/common/auth/api-key.js';
import { decideApiKeyAdmission, decideUserAdmission } from '../src/common/auth/auth.guard.js';
import { decideTenantAccess } from '../src/common/auth/tenant.guard.js';
import { ipInAnyCidr, ipInCidr } from '../src/common/auth/ip-cidr.js';
import { decideCapabilities } from '../src/common/guards/rbac.guard.js';
import { decideEntitlement } from '../src/common/guards/entitlements.guard.js';
import { decideCredits } from '../src/common/guards/credits.guard.js';
import { parsePlanFeatures } from '@aca/shared';
import { resolveEffectivePermissions, hasPermission } from '@aca/shared';


function expectDetail(fn: () => unknown, code: string, pattern: RegExp): void {
  try {
    fn();
    expect.unreachable();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    const detail = (err as ApiError).detail ?? (err as ApiError).message;
    expect(detail).toMatch(pattern);
  }
}

const SECRET = 's'.repeat(32);
const OPTS = { issuer: 'https://api.autocreator.ai', audience: 'aca-first-party' };
const NOW = 1_700_000_000;

function claims(over: Partial<SessionClaims> = {}): SessionClaims {
  return {
    sub: uuidv7(),
    sid: uuidv7(),
    typ: 'access',
    iss: OPTS.issuer,
    aud: OPTS.audience,
    iat: NOW - 10,
    exp: NOW + 600,
    ...over,
  };
}

describe('session JWT (HS256, node:crypto)', () => {
  it('round-trips a signed token', () => {
    const c = claims();
    const token = signSessionJwt(c, SECRET);
    expect(verifySessionJwt(token, SECRET, { ...OPTS, nowSec: NOW })).toEqual(c);
  });

  it('rejects tampered payloads (signature mismatch)', () => {
    const token = signSessionJwt(claims(), SECRET);
    const [h, p] = token.split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify(claims({ sub: uuidv7() }))).toString('base64url')}.${token.split('.')[2]}`;
    void p;
    expectDetail(() => verifySessionJwt(tampered, SECRET, { ...OPTS, nowSec: NOW }), 'UNAUTHENTICATED', /signature/);
  });

  it('rejects wrong secret, malformed structure, bad header alg', () => {
    const good = signSessionJwt(claims(), SECRET);
    expectDetail(() => verifySessionJwt(good, 'x'.repeat(32), { ...OPTS, nowSec: NOW }), 'UNAUTHENTICATED', /signature/);
    expectDetail(() => verifySessionJwt('a.b', SECRET, { ...OPTS, nowSec: NOW }), 'UNAUTHENTICATED', /malformed/);
    const noneAlg = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${good.split('.')[1]}.sig`;
    expectDetail(() => verifySessionJwt(noneAlg, SECRET, { ...OPTS, nowSec: NOW }), 'UNAUTHENTICATED', /header/);
  });

  it('rejects expired, wrong issuer, wrong audience, malformed claims', () => {
    expectDetail(() =>
      verifySessionJwt(signSessionJwt(claims({ exp: NOW - 1 }), SECRET), SECRET, { ...OPTS, nowSec: NOW }),
      'UNAUTHENTICATED', /expired/);
    expectDetail(() =>
      verifySessionJwt(signSessionJwt(claims(), SECRET), SECRET, { ...OPTS, issuer: 'https://evil.example', nowSec: NOW }),
      'UNAUTHENTICATED', /issuer/);
    expectDetail(() =>
      verifySessionJwt(signSessionJwt(claims(), SECRET), SECRET, { ...OPTS, audience: 'other', nowSec: NOW }),
      'UNAUTHENTICATED', /audience/);
    const badClaims = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url')}`;
    // signed properly so verification reaches CLAIM validation (not signature)
    const sig = createHmac('sha256', SECRET).update(badClaims, 'utf8').digest('base64url');
    expectDetail(() => verifySessionJwt(`${badClaims}.${sig}`, SECRET, { ...OPTS, nowSec: NOW }), 'UNAUTHENTICATED', /claims/);
  });

  it('every rejection is UNAUTHENTICATED (401), never a 500', () => {
    for (const evil of ['', 'x', 'a.b.c.d', 'Bearerless']) {
      try {
        verifySessionJwt(evil, SECRET, { ...OPTS, nowSec: NOW });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).code).toBe('UNAUTHENTICATED');
        expect((err as ApiError).status).toBe(401);
      }
    }
  });
});

describe('api keys', () => {
  it('parses wire format and hashes the whole key', () => {
    const key = `aca_AbCdEf12_${'K'.repeat(40)}`;
    const parsed = parseApiKey(key);
    expect(parsed.prefix).toBe('AbCdEf12');
    expect(parsed.keyHash).toBe(sha256Hex(key));
  });

  it('rejects malformed keys', () => {
    for (const bad of ['aca_short_x', 'not-a-key', 'aca_12345678_short', `aca_12345678_${'k'.repeat(10)}`]) {
      expectDetail(() => parseApiKey(bad), 'UNAUTHENTICATED', /malformed/);
    }
  });

  it('admission decisions: revoked/expired/active', () => {
    const now = new Date('2026-08-02T00:00:00Z');
    expectDetail(() => decideApiKeyAdmission({ status: 'REVOKED', revokedAt: null, expiresAt: null }, now), 'UNAUTHENTICATED', /revoked/);
    expectDetail(() => decideApiKeyAdmission({ status: 'ACTIVE', revokedAt: new Date(now.getTime() - 1), expiresAt: null }, now), 'UNAUTHENTICATED', /revoked/);
    expectDetail(() => decideApiKeyAdmission({ status: 'ACTIVE', revokedAt: null, expiresAt: new Date(now.getTime() - 1) }, now), 'UNAUTHENTICATED', /expired/);
    expect(() => decideApiKeyAdmission({ status: 'ACTIVE', revokedAt: null, expiresAt: new Date(now.getTime() + 1000) }, now)).not.toThrow();
    expect(() => decideApiKeyAdmission({ status: 'ACTIVE', revokedAt: null, expiresAt: null }, now)).not.toThrow();
  });
});

describe('user admission', () => {
  it('maps statuses correctly', () => {
    expectDetail(() => decideUserAdmission('SUSPENDED'), 'FORBIDDEN', /suspended/);
    expectDetail(() => decideUserAdmission('DELETED'), 'FORBIDDEN', /deleted/);
    try {
      decideUserAdmission('SUSPENDED');
    } catch (err) {
      expect((err as ApiError).status).toBe(403); // suspended is 403, not 401
    }
    expect(() => decideUserAdmission('ACTIVE')).not.toThrow();
  });
});

describe('tenant isolation decisions', () => {
  const orgId = uuidv7();
  it('passes user principals to membership phase (no decision there)', () => {
    expect(() => decideTenantAccess({ principalKind: 'user', requestedOrgId: orgId })).not.toThrow();
  });
  it('pins api keys to their org (TENANT_VIOLATION masked as 404)', () => {
    try {
      decideTenantAccess({ principalKind: 'apikey', principalOrgId: uuidv7(), requestedOrgId: orgId });
      expect.unreachable();
    } catch (err) {
      expect((err as ApiError).code).toBe('TENANT_VIOLATION');
      expect((err as ApiError).status).toBe(404);
    }
  });
  it('accepts matching api-key org and rejects non-uuidv7 org ids', () => {
    expect(() => decideTenantAccess({ principalKind: 'apikey', principalOrgId: orgId, requestedOrgId: orgId })).not.toThrow();
    expect(() => decideTenantAccess({ principalKind: 'user', requestedOrgId: 'not-a-uuid' })).toThrowError(ApiError);
  });
});

describe('ip allow list (CIDR)', () => {
  it('matches v4 prefixes and exact entries', () => {
    expect(ipInCidr('203.0.113.9', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.114.9', '203.0.113.0/24')).toBe(false);
    expect(ipInCidr('10.0.0.5', '10.0.0.5')).toBe(true);
    expect(ipInCidr('10.0.0.6', '10.0.0.5')).toBe(false);
  });
  it('rejects malformed cidrs/ips safely', () => {
    expect(ipInCidr('999.1.1.1', '203.0.113.0/24')).toBe(false);
    expect(ipInCidr('203.0.113.1', '203.0.113.0/33')).toBe(false);
    expect(ipInCidr('203.0.113.1', '')).toBe(false);
  });
  it('any-cidr aggregation + /32 + /0 edges', () => {
    expect(ipInAnyCidr('8.8.8.8', ['1.1.1.1/32', '0.0.0.0/0'])).toBe(true);
    expect(ipInCidr('8.8.8.8', '8.8.8.8/32')).toBe(true);
    expect(ipInCidr('8.8.8.9', '8.8.8.8/32')).toBe(false);
  });
});

describe('rbac capabilities decisions', () => {
  it('resolves role baselines and catches missing capabilities', () => {
    const viewer = resolveEffectivePermissions('VIEWER');
    expect(hasPermission(viewer, 'project.view')).toBe(true);
    expect(hasPermission(viewer, 'project.create')).toBe(false);
    expect(() => decideCapabilities(viewer, ['project.view'])).not.toThrow();
    try {
      decideCapabilities(viewer, ['project.create']);
      expect.unreachable();
    } catch (err) {
      expect((err as ApiError<{ missing: string[] }>).code).toBe('FORBIDDEN');
      expect((err as ApiError<{ missing: string[] }>).meta?.missing).toEqual(['project.create']);
    }
  });
  it('custom-role grants extend the baseline', () => {
    const withGrant = resolveEffectivePermissions('VIEWER', ['project.create']);
    expect(() => decideCapabilities(withGrant, ['project.create', 'project.view'])).not.toThrow();
  });
  it('api-key scopes act as the capability set', () => {
    expect(() => decideCapabilities(new Set(['project.create']), ['project.create'])).not.toThrow();
    expect(() => decideCapabilities(new Set(['project.view']), ['project.create'])).toThrowError(ApiError);
  });
});

describe('entitlements decisions', () => {
  const features = parsePlanFeatures({
    trialDays: 0, watermark: false, autopilot: true, reviewModes: ['FULL_AUTO'], platforms: ['youtube'],
    apiAccess: true, byok: false, thumbnailAb: false, optimizerAutoApply: false, priorityQueue: false,
    regionPinning: false, whiteLabel: false, sso: false, auditRetentionDays: 30, auditExportApi: false,
    supportTier: 'community',
  });
  it('passes when ACTIVE + feature present', () => {
    expect(() => decideEntitlement({ subscriptionStatus: 'ACTIVE', planFeatures: features }, 'apiAccess')).not.toThrow();
    expect(() => decideEntitlement({ subscriptionStatus: 'TRIALING', planFeatures: features }, 'apiAccess')).not.toThrow();
  });
  it('FAILS CLOSED: no subscription, canceled subscription, missing feature, unparseable features', () => {
    for (const subject of [
      { subscriptionStatus: null, planFeatures: features },
      { subscriptionStatus: 'CANCELED', planFeatures: features },
      { subscriptionStatus: 'PAST_DUE', planFeatures: features },
      { subscriptionStatus: 'ACTIVE', planFeatures: null },
    ] as const) {
      try {
        decideEntitlement(subject, 'apiAccess');
        expect.unreachable();
      } catch (err) {
        expect((err as ApiError).code).toBe('FLAG_LOCKED');
        expect((err as ApiError).status).toBe(403);
      }
    }
    // feature absent on active sub
    expectDetail(() => decideEntitlement({ subscriptionStatus: 'ACTIVE', planFeatures: features }, 'whiteLabel'), 'FLAG_LOCKED', /whiteLabel/);
  });
});

describe('credits decisions', () => {
  it('passes at and above the estimate, fails below with ledger meta', () => {
    expect(() => decideCredits(500, 500)).not.toThrow();
    expect(() => decideCredits(501, 500)).not.toThrow();
    try {
      decideCredits(20, 500);
      expect.unreachable();
    } catch (err) {
      expect((err as ApiError).code).toBe('CREDIT_INSUFFICIENT');
      expect((err as ApiError).status).toBe(402);
      expect((err as ApiError<{ required: number; available: number }>).meta).toEqual({ required: 500, available: 20 });
    }
  });
  it('estimate must be a non-negative integer (programming error, loud)', () => {
    expect(() => decideCredits(100, -1)).toThrowError(Error);
    expect(() => decideCredits(100, 1.5)).toThrowError(Error);
  });
});
