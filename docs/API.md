# AutoCreator AI — API Reference (v1 contract / platform v2 design)

**Base URL:** `https://api.autocreator.ai/v1` · **Style:** REST/JSON, OpenAPI 3.1 at `GET /v1/openapi.json`
**Status:** Approved v2.0 (Phase 0.5). v2.0 extends the v1 surface with: developer OAuth platform, teams/roles, white-label, enterprise security (SSO/SCIM/IP allowlist), workflows, plugins, marketplace, AI memory, AI team, feature flags, mobile conventions.

---

## 1. Conventions (v1 base, unchanged) + v2 additions

v1 conventions stand: Bearer/Key auth, JSON only, UUIDv7 ids, RFC 3339 times,
minor-unit money, cursor pagination (`limit` ≤ 100), `Idempotency-Key`,
`RateLimit-*` headers, `X-Request-Id`, RFC 9457 errors (§17).

**v2 additions:**

| Topic | Rule |
|-------|------|
| Versioning | URI major (`/v1`); additive-only within a major; breaking → `/v2` parallel ≥ 12 mo with `Sunset` + `Deprecation` headers and developer notices |
| Absolute URLs | All media/file links are absolute CDN URLs — clients never assemble URLs (mobile-ready) |
| Caching/delta | Heavy list/detail GETs emit `ETag` + honor `If-None-Match` (304). Library/notifications/calendar accept `updatedAfter` for delta sync |
| Expand | Detail endpoints support `?expand=script,scenes,thumbnails` allowlists |
| Client bootstrap | `GET /v1/meta/capabilities` → `{ apiVersion, flags{…evaluated}, limits, locales }` for client-side gating (mobile/desktop ready) |
| AuthN modes | (a) Session JWT (first-party), (b) `X-API-Key`, (c) **OAuth app tokens** (`aud=aca-public-api`) — same authorization layer, scope-filtered |
| AuthZ | capabilities (not role names); edndpoint tables show minimal role; custom roles inherit checks via capability map (Security §6) |
| SCIM | `/scim/v2/…` (RFC 7644) — separate mount, bearer-scoped (§9.3) |

Auth markers (as v1): 🔓 public · 👤 user JWT · 🛡 ROLE org-role minimum · 🔑 API key (scope) · 🔧 system admin · 🛠 OAuth scope (third-party apps).

---

## 2. Auth & Sessions (as v1 §2 — unchanged)

Email/password (register/login/verify/forgot/reset), Google login 3-step
flow, refresh rotation with reuse detection, sessions list/revoke. **v2 adds:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/mfa/enable` | 👤 | Start TOTP enrollment → `{ otpauthUrl, recoveryCodes }` |
| POST | `/auth/mfa/verify` | 👤 | `{ code }` → activates; sessions upgraded |
| POST | `/auth/mfa/disable` | 👤 | `{ currentPassword \| totp }` |
| POST | `/auth/mfa/challenge` | pending-token | Complete login when MFA required (`{ challengeToken, code }` → tokens) |
| GET | `/auth/sso/{orgSlug}` | 🔓 | SSO-aware login start: redirects to org IdP (SAML/OIDC) when domain enforced |

---

## 3. Users & Notifications (as v1 §3 — unchanged)

`/me` CRUD incl. GDPR erasure; notifications list/read; preferences. Delta sync: `GET /me/notifications?updatedAfter=`.

---

## 4. Organizations, Teams, Roles (v2 expansion of v1 §4)

### 4.1 Organizations (v1 set retained)

create/get/patch org; members list/patch-role/remove; invitations create/accept/revoke.

### 4.2 Teams 🆕

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/organizations/{orgId}/teams` | 🛡 ADMIN | `{ name, description? }` (name unique per org) |
| GET | `/organizations/{orgId}/teams` | 🛡 VIEWER | List incl. member counts |
| GET/PATCH/DELETE | `/organizations/{orgId}/teams/{teamId}` | 🛡 VIEWER / ADMIN | Detail/PATCH name/desc/Delete (archives team; projects flip to ORG_WIDE) |
| POST | `/organizations/{orgId}/teams/{teamId}/members` | 🛡 ADMIN | `{ userId }` (must be org member) |
| DELETE | `/organizations/{orgId}/teams/{teamId}/members/{userId}` | 🛡 ADMIN | Remove from team |

Projects gain `{ teamId?, visibility: ORG_WIDE|TEAM_ONLY }` in create/patch (§7).

### 4.3 Custom roles 🆕 (Enterprise capability RBAC)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/organizations/{orgId}/roles` | 🛡 ADMIN | `{ name, permissions[] }` — validated against permission catalog |
| GET | `/organizations/{orgId}/roles` | 🛡 VIEWER | List + catalog of assignable capabilities |
| PATCH/DELETE | `/organizations/{orgId}/roles/{roleId}` | 🛡 ADMIN | Edit/delete (delete = members fall back to system role only) |
| PATCH | `/organizations/{orgId}/members/{userId}` | 🛡 ADMIN | v1 body + `customRoleId?` |

---

## 5. White Label & Domains 🆕

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/organizations/{orgId}/brand` | 🛡 VIEWER | Brand config (missing → defaults) |
| PUT | `/organizations/{orgId}/brand` | 🛡 ADMIN | `{ brandName?, logoAssetId?, logoDarkAssetId?, faviconAssetId?, primaryColor?, theme?, emailFromName?, emailTemplatePack?, supportUrl?, termsUrl?, privacyUrl?, hidePoweredBy? }` — plan-gated `hidePoweredBy` |
| POST | `/organizations/{orgId}/brand/reset` | 🛡 ADMIN | Back to platform defaults |
| GET | `/branding/resolve?host=…` 🔓 rate-limited | 🔓 | Runtime resolver used by web/portal: → `{ orgSlug, brand, localeDefault }` (no data beyond brand) |
| GET/POST | `/organizations/{orgId}/domains` | 🛡 VIEWER/OWNER | `{ domain, type: PORTAL|EMAIL_FROM }` → `{ verificationToken, instructions }` |
| POST | `/organizations/{orgId}/domains/{id}/verify` | 🛡 OWNER | Checks TXT/CNAME (PORTAL) or DKIM/SPF (EMAIL_FROM) → ACTIVE + cert issuance (PORTAL) |
| DELETE | `/organizations/{orgId}/domains/{id}` | 🛡 OWNER | Remove domain |

---

## 6. Public API Platform 🆕 — Developer Apps & OAuth 2.0 AS

### 6.1 App management (developer = an org admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/developers/apps` | 🛡 ADMIN | `{ name, redirectUris[], scopes[] }` → `{ clientId, clientSecret }` (secret once) |
| GET/PATCH/DELETE | `/developers/apps[/{id}]` | 🛡 ADMIN | Manage; DELETE revokes all grants |
| POST | `/developers/apps/{id}/rotate-secret` | 🛡 ADMIN | New secret (old dies instantly) |
| POST | `/developers/apps/{id}/submit-review` | 🛡 ADMIN | Request verification (≥ publish scopes) |

### 6.2 End-user consent & token endpoints (OAuth 2.0 + PKCE)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/oauth/authorize?client_id&redirect_uri&response_type=code&scope&state&code_challenge&code_challenge_method=S256` | Consent screen (org picker if user in several) → on approve issues code |
| POST | `/oauth/authorize/consent` 👤 | Programmatic consent `{ clientId, orgId, scopes, decision }` |
| POST | `/oauth/token` | `grant_type=authorization_code` (+`code_verifier`) or `refresh_token` → `{ access_token(15m,aud=aca-public-api), refresh_token(30d rotating), scope }` |
| POST | `/oauth/revoke` | Revoke a grant/token |
| GET | `/oauth/userinfo` | Minimal identity of token subject |
| GET/DELETE | `/organizations/{orgId}/connected-apps` 👤 | Grants of this org; revoke app access |

Apps act with `🛠 <scope>` anywhere scope tables permit (payloads identical to
first-party API-key usage; actor recorded as `OAUTH_APP` in audit).

### 6.3 SDK & discovery

`@autocreator/sdk` (TS): OpenAPI-generated methods, auto-pagination async
iterators, typed Problem errors, helpers `withApiKey(...)`, `withOAuth(...)`.
Discovery: `GET /.well-known/aca-configuration` (endpoints, JWKS, versions) +
`/v1/openapi.json`.

---

## 7. Projects, Automation, Ideas, Trends (v1 §7 + v2 deltas)

Project create/patch add: `teamId?`, `visibility?` (§4.2), `workflowId?`
(choose automation flow), `routingObjective?` (BALANCED default). Everything
else (automation config, ideas CRUD + `:generate`, trends catalog) unchanged.

---

## 8. Videos, Pipeline & **Workflows** (v1 §8 + v2)

### 8.1 Workflows 🆕

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/organizations/{orgId}/workflows` | 🛡 VIEWER | Org workflows **+ system templates** (`isTemplate`) |
| POST | `/organizations/{orgId}/workflows` | 🛡 EDITOR | `{ name, description?, fromTemplateId? }` → DRAFT with version 1 |
| GET | `/organizations/{orgId}/workflows/{id}` | 🛡 VIEWER | Detail + versions list |
| PUT | `/organizations/{orgId}/workflows/{id}/versions` | 🛡 EDITOR | Publish new version `{ definition, changelog? }` → validated (DAG/plugin resolution/cost estimate in response); becomes `currentVersion` |
| POST | `/organizations/{orgId}/workflows/{id}/validate` | 🛡 EDITOR | Dry validation → `{ valid, issues[], estimatedCredits }` |
| POST | `/organizations/{orgId}/workflows/{id}:duplicate` | 🛡 EDITOR | Clone (incl. template → org copy) |
| POST | `/organizations/{orgId}/workflows/{id}/archive` | 🛡 EDITOR | Runs keep pinned versions |

### 8.2 Pipeline v2 deltas

- `POST /videos/{id}/pipeline:start` body adds `workflowVersionId?` (default:
  project's workflow's current version → else system `autopilot-v1`) and keeps
  `creditBudget`.
- Step DTOs add `nodeId`, `step` (agent kind string), `memoryIds[]`, `provider`, `model`.
- Review endpoints unchanged semantically, now gate-node driven: `POST /pipeline-runs/{runId}/approve|reject|steps/{nodeId}/retry|cancel`.
- AI Studio sub-resources (scripts/scenes/voiceover/thumbnail select) unchanged.

### 8.3 AI Memory 🆕

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/organizations/{orgId}/channels/{id}/memory` | 🛡 VIEWER | `?subject=&status=ACTIVE` — includes inherited project/org scope entries |
| POST | `/organizations/{orgId}/channels/{id}/memory` | 🛡 EDITOR | Manual fact `{ subject, content, structured? }` (source=USER) |
| PATCH | `/organizations/{orgId}/memory/{entryId}` | 🛡 EDITOR | Edit/archive (`status=ARCHIVED`) |
| DELETE | `/organizations/{orgId}/memory/{entryId}` | 🛡 ADMIN | Hard delete (audit-logged) |
| GET | `/organizations/{orgId}/videos/{id}/memory-context` | 🛡 VIEWER | Explainability: memories actually cited by this video's steps |

### 8.4 AI Team 🆕

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/organizations/{orgId}/ai-employees` | 🛡 VIEWER | Org's team roster (10 personas, seeded from system defaults) |
| PATCH | `/organizations/{orgId}/ai-employees/{key}` | 🛡 ADMIN | `{ displayName?, avatarAssetId?, personaNotes?, enabled? }` |
| GET | `/organizations/{orgId}/ai-messages` | 🛡 VIEWER | Team room feed `?threadId=|videoId=|projectId=` (cursor) |
| POST | `/organizations/{orgId}/ai-messages` | 🛡 EDITOR | User note into a thread `{ threadId, toRole?, content }` (kind=NOTE, fromRole=user-side) |

---

## 9. Enterprise Security 🆕

### 9.1 SSO (SAML/OIDC)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/PUT/DELETE | `/organizations/{orgId}/sso` | 🛡 VIEWER / OWNER | Configure `{ protocol, domains[], idpMetadataUrl|Xml | oidc{issuer,clientId,secret}, enforced, jitProvisioning, defaultRoleId?, attributeMapping? }` |
| POST | `/organizations/{orgId}/sso/test` | 🛡 OWNER | Dry validation (metadata fetch, signature check, attribute mapping preview) |
| GET | `/sso/saml/metadata/{orgSlug}` | 🔓 | Our SP metadata for IdP import |
| POST | `/sso/saml/acs/{orgSlug}` | 🔓 (SAMLResponse-bound) | Assertion consumer service → session |
| GET | `/sso/oidc/callback/{orgSlug}` | 🔓 | OIDC code callback → session |

Enforcement: claimed email domains with `enforced=true` reject password-based
logins & API session creation (existing sessions expire by `sessionMaxHours`).

### 9.2 IP allow list & session policy

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | `/organizations/{orgId}/ip-allow-list` | 🛡 VIEWER / OWNER | `{ cidr, label? }` |
| DELETE | `/organizations/{orgId}/ip-allow-list/{entryId}` | 🛡 OWNER | Remove |
| PATCH | `/organizations/{orgId}/security-policy` | 🛡 OWNER | `{ enforceSso?, enforceMfa?, sessionMaxHours?, ipAllowListEnabled? }` |

When enabled, org-scoped routes (dashboard + API + OAuth tokens) reject callers
outside the CIDRs with `IP_NOT_ALLOWED` (guard-level, §17).

### 9.3 SCIM 2.0 provisioning

| Path prefix | Notes |
|-------------|-------|
| `/scim/v2/Users` (GET list/pager · POST create · PATCH mutate role/status · DELETE deactivate) | Bearer = SCIM token; org inferred from token |
| `/scim/v2/Groups` | CRUD mapped to **Teams** |
| Token mgmt | `POST/DELETE /organizations/{orgId}/scim-tokens` 🛡 OWNER (`{ label }` → token once) |

---

## 10. Plugins 🆕

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/plugins/catalog` | 🛡 VIEWER | Registry (first-party + marketplace-published): capabilities, versions, publisher, verification |
| GET | `/organizations/{orgId}/plugins` | 🛡 VIEWER | Installations + status |
| POST | `/organizations/{orgId}/plugins/install` | 🛡 ADMIN | `{ slug, version?, config?, secrets? }` → validates configSchema, stores secrets in vault, healthchecks → enabled |
| PATCH | `/organizations/{orgId}/plugins/{installId}` | 🛡 ADMIN | `{ config? }` (re-validated) · `:enable` · `:disable` |
| DELETE | `/organizations/{orgId}/plugins/{installId}` | 🛡 ADMIN | Uninstall (workflows referencing it fail validation loudly, never silently skip) |
| GET | `/organizations/{orgId}/plugins/{installId}/logs` | 🛡 ADMIN | Recent invocation health (remote/NPM adapters only) |

---

## 11. Billing (v1 §5 with provider-port deltas) & Feature Flags 🆕

### 11.1 Billing deltas

- Checkout/portal endpoints unchanged in shape; responses now carry `provider`
  field; `POST /billing/checkout` accepts `{ provider?: "stripe" }` (default org
  provider; additional providers appear when region-enabled).
- Invoices return `pdfUrl` as **CDN URL** of our generated PDF.
- Webhook ingress generalized: `POST /webhooks/payments/{provider}` (signature-verified per adapter → normalized `billing.*` events).

### 11.2 Feature flags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/flags/bootstrap` | 👤 | Evaluated set for current user/org (also inside `/meta/capabilities`) |
| GET/POST | `/admin/flags` · PATCH/DELETE `/admin/flags/{key}` | 🔧 | Global registry mgmt |
| POST/DELETE | `/admin/flags/{key}/overrides` | 🔧 | `{ orgId? \| planCode? \| userId?, value }` — cascade rows |

---

## 12. Marketplace 🆕

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/marketplace/listings` | 🛡 VIEWER | Browse `?kind=&q=&sort=-installs` (cursor) — free tier gets PUBLISHED only |
| GET | `/marketplace/listings/{slug}` | 🛡 VIEWER | Detail incl. artifact summary + reviews |
| POST | `/marketplace/listings` | 🛡 ADMIN (creator) | Create listing `{ kind, title, description, artifact, priceType, priceCents }` → IN_REVIEW (conformance + safety gate) |
| PATCH | `/marketplace/listings/{id}` | 🛡 ADMIN (owner) | Update while DRAFT/IN_REVIEW |
| POST | `/marketplace/listings/{id}/purchase` | 🛡 OWNER | Paid listings → checkout via org billing provider → COMPLETED event |
| POST | `/marketplace/listings/{id}/install` | 🛡 ADMIN | Materialize into org: workflow→workflow copy, template→stylePreset, voice→voice row, agent→persona pack, plugin→installation record, prompt→prompt overrides |
| POST/GET | `/marketplace/listings/{id}/reviews` | 🛡 EDITOR (has purchase) / VIEWER | Rate/review; one per user per listing |
| GET | `/marketplace/creator/summary` | 🛡 ADMIN | Earnings, splits, payout schedule (Connect-style via billing port) |

---

## 13. Channels / Assets / Voices / Publishing / Analytics / Webhooks-out

Unchanged from v1 (§§6, 9, 10, 11, 12.2) with these wire deltas only:
- Asset & rendition responses: `url` fields are **CDN URLs**; upload flow (intent/PUT/confirm) unchanged.
- `GET /videos/{id}` gains `expand` support (§1) and includes `workflow` info of active run.
- Publishing: `POST /videos/{id}/publish` accepts **no change**; responses include rescheduling events already covered by WS/webhooks.
- Webhooks-out catalog **adds**: `workflow.version_published · memory.entry_created memory.entry_superseded · plugin.installed plugin.failed · marketplace.purchase_completed · sso.enforced security.session_reuse_detected · optimizer.report_completed`.

---

## 14. Realtime (WS) — v1 catalog + additions

Adds: `workflow.version.published` · `memory.entry.created` ·
`plugin.installation.status` · `gate.review.requested` · `team.message.created`
(team room live feed).

---

## 15. Error Model — v2 additions to code table

| `code` | HTTP | Meaning |
|--------|------|---------|
| `IP_NOT_ALLOWED` | 403 | Org allow list active; caller CIDR outside |
| `SSO_ENFORCED` | 403 | Domain enforcement requires IdP login |
| `WORKFLOW_INVALID` | 400 | DAG validation failure (`meta.issues[]`) |
| `PLUGIN_NOT_INSTALLED` | 409 | Workflow references missing plugin node |
| `PLUGIN_UNHEALTHY` | 502 | Adapter failing health; router shadowed it |
| `MARKETPLACE_ITEM_UNAVAILABLE` | 409 | Listing suspended between browse & install |
| `APP_REVIEW_REQUIRED` | 403 | Unverified app requested restricted scope |
| `FLAG_LOCKED` | 403 | Feature not entitled by plan/flag |

## 16. Rate Limits — v2 additions

| Bucket | Limit |
|--------|-------|
| OAuth `/oauth/token` | 30 req/min/client |
| Developer apps (per client, aggregated) | 600 req/min + scope-based caps |
| `/branding/resolve` | 120 req/min/IP |
| Marketplace browse | 240 req/min/org |
| SCIM endpoints | 120 req/min/token |
| SSO ACS/callbacks | 60 req/min/IP |

## 17. Health/Admin (v1 §16 retained)

👁 unchanged: `/health`, `/health/ready`, admin orgs/queues/flags/reconciliation.
Adds: `GET /admin/eventbus/stats` (per-stream lag, DLX depth, relay heartbeats),
`POST /admin/eventbus/streams/{name}:replay` (from timestamp or id, dry-run support),
`GET /admin/router/decisions` (cost-optimizer audit — sampling).

---

## 18. Mobile/Desktop readiness checklist (contract guarantees)

✅ Absolute CDN URLs · ✅ delta filters + ETag · ✅ non-cookie token flows ·
✅ idempotency on all mutations · ✅ deep-link notification payloads ·
✅ capabilities bootstrap · ✅ cursor pagination everywhere · ✅ WS with
REST-snapshot resume · ✅ versioned OAuth flow usable with loopback redirect
(desktop) and ASWebAuthenticationSession (iOS) / Custom Tabs (Android).
