/**
 * IPv4 CIDR matching for org IP allow lists (docs/API.md §9.2).
 * Entries without a slash are exact matches (any family, string-compared after
 * trimming); slash entries are IPv4 prefix math (documented v1 scope).
 */

function parseIpv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

/** True when `ip` is inside `cidr` ("203.0.113.0/24" or exact "203.0.113.7"). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [base, prefixRaw] = cidr.trim().split('/');
  if (base === undefined || base === '') return false;
  if (prefixRaw === undefined) return ip === base;
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = parseIpv4(ip);
  const baseInt = parseIpv4(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  return cidrs.some((c) => ipInCidr(ip, c));
}
