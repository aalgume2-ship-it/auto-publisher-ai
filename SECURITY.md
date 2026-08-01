# Security Policy

## Reporting a Vulnerability

Email **security@autocreator.ai** (PGP key published at
`https://autocreator.ai/.well-known/security.txt`). We acknowledge within
24 hours, triage within 72 hours, and credit researchers in our hall of fame
unless anonymity is requested. A private bug bounty program launches alongside
public beta (Phase 2 GA).

Please do not: access or modify data that is not yours, degrade availability,
or test against other customers' organizations. Use a free trial workspace for
verification.

## Scope

- First-party: `app.autocreator.ai`, `api.autocreator.ai`, this repository,
  `@autocreator/*` published packages.
- Out of scope: customer white-label portals (report platform flaws to us,
  tenant content to the tenant), third-party marketplace plugins (report to
  us; we operate the quarantine process).

## Platform Security (summary)

- OAuth/platform tokens and BYOK keys: AES-256-GCM envelope encryption with
  KMS-managed keys (vault pattern), zero plaintext at rest or in logs.
- Authentication: RS256 short-lived JWTs, rotating refresh tokens with
  reuse-detection; Argon2id password hashing; TOTP MFA; SAML/OIDC SSO and
  SCIM for enterprises.
- Authorization: capability-based RBAC enforced server-side on every request;
  tenant isolation via scoped data-access layer plus Postgres RLS on
  high-blast-radius tables.
- Supply chain: signed container images, dependency/SAST/secret scanning on
  every PR, vendor SDKs confined to adapter folders by CI rule.
- Observability of abuse: append-only audit logs, structured security alerts,
  quarterly disaster-recovery and access reviews.

The full security architecture is documented in [`docs/Security.md`](./docs/Security.md).

## Supported Versions

| Version | Supported |
|---------|-----------|
| main (pre-release) | ✅ |
