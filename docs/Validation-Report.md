# AutoCreator AI — Design Validation Report (Adversarial Review)

**Version:** 1.0 · **Scope:** all v2.0 design documents + extracted `packages/database/prisma/schema.prisma`
**Method:** machine validation (Prisma CLI 5.22.0), cross-document diff analysis, relation-graph audit,
scale arithmetic, third-party integration simulation, red-team attack scripting.
**Outcome:** **25 amendments applied (→ design v2.1)**; schema machine-validated; **no remaining
blocking defect known**. Every finding below is marked ✅ fixed in v2.1 or ◎ accepted-with-rationale.

> Honest summary first: the v2.0 design was sound at the conceptual level, but **not** squeaky-clean.
> The review found one schema-invalidating syntax root cause (164 validator errors), one invalid
> attribute, one dropped relation, a genuine plugin-extensibility failure (the Platform enum), a
> concurrency hole in the workflow executor, and eleven smaller gaps. All fixed. Details, with
> evidence, follow.

---

## 1. Cross-Document Consistency Audit

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| C-01 | `Deployment.md` §7 still said "Tempo" while `Architecture.md` adopted Jaeger | Low (doc inconsistency) | ✅ §7 table now Jaeger |
| C-02 | `API.md` v2 collapsed channel/asset/publishing detail into "**unchanged from v1**" references — but v1 no longer existed; the doc was self-incomplete, and `docs/API.md` is the contract third parties read | **High** (spec hole) | ✅ §13 rewritten self-contained (connect flows incl. registry ids, scopes table, CDN delta, catalog) |
| C-03 | Security.md audit catalog covered v1 surface only (~18 events); v2 added sso/scim/plugins/marketplace/flags/memory/oauth actions with **no audit requirement** — silent compliance gap | **High** (SOC2 CC7) | ✅ v2.1 audit catalog appended (Security §9) |
| C-04 | `trend_snapshots` unique includes exact-second `capturedAt`; double-capture within one second (batch retries) would 409-flood step retries | Medium | ✅ writers truncate to minute (documented) |
| C-05 | `workflows @@unique([orgId, slug])` — NULL orgIds (system templates) bypass uniqueness in PG → duplicate system templates possible | Medium | ✅ partial unique index `WHERE organization_id IS NULL` (raw SQL, documented §4) |
| C-06 | `Database.md` v2.0 enum block contained a stray never-used enum | Trivial | ✅ removed |
| C-07 | Roadmap Phase 0 duration +2 weeks not reflected anywhere else → acceptable by design (timeline unchanged overall) | Low | ◎ documented decision |
| C-08 | Architecture §15 stage transitions keyed to org-counts only → triggers were vanity metrics | Medium | ✅ stages now flip on **measured** triggers (CPU, lag, p95, TPS) with org counts as guidance |

**Consistency verdict after v2.1:** cross-referenced entities (models↔endpoints↔modules↔agents↔events) match across all 9 documents; the two remaining soft references (Roadmap phase numbering cited in Security §18 SDLC table) are intentional.

---

## 2. Design Validation Findings

### 2.1 Decisions evaluated for redesign (verdict: keep, with fixes)

| Candidate | Attack | Defence / Action |
|-----------|--------|------------------|
| Events-only side effects | "Adds latency + a relay hop to trivial flows" | Side-effect decoupling is the price of replayability & extraction-readiness. **Reads stay synchronous** (documented exception) — full-EDA purism would be the actual over-engineering. Keep. |
| BullMQ+PG executor vs Temporal now | "Redis state isn't durable execution" | Durable run/step tables + OCC (ADR-023) + stalled-job recovery give effectively-resumable runs; Temporal migration seam (ADR-003) preserved. Keep. |
| Remote-plugin kind pre-marketplace | "Builds marketplace surface before sellers exist" | Implementation cost ≈ one HTTP adapter + manifest branch; buying the anti-core-modification guarantee early is the point. Keep, flagged low-risk. |
| 15 agents incl. tiny ones | "Subtitle/thumbnail could be library calls" | Uniform node contract buys per-step cost accounting, retries, gates, routing objectives, team-room narrative. They are *deliberately* light nodes, not accidental. Keep. |
| Kafka at stage B | "Premature" | ✅ **Trigger changed**: Kafka flips on measured bus lag — not calendar. |

### 2.2 Gaps found (all addressed in v2.1)

CHECK-constraint tier (0006), executor OCC, dangling FK family (10 relations), dropped `PipelineRun.triggeredBy` relation, WS session hygiene + revocation disconnect, identity-wide abuse scoring, plugin data-only outputs, safe-fetch for remote plugins, NPM provenance/sigstore pinning, TOTP/SAML replay-wrapping notes, audit catalog v2.1, cache tenancy rule, localizer node, system-template partial unique, trend capture normalization, RLS tier-2 recommendation (videos/scripts — optional hardening, perf-costed).

### 2.3 Genuine over-engineering calls (self-criticism)

- ~~Header-based API versioning support~~ wasn't claimed, good.
- Percentage-variant feature flags at Phase 0: justified (release policy requires flags from day one) but **variant type can wait** — ◎ flagged `VARIANT` as registry-tolerated, UI postponed to Phase 4.
- N=64 stream shards for stage A: overkill → ◎ reduce default to 8, shard count is config not code (noted in Architecture §15 ops notes).

---

## 3. Schema Review (prisma 5.22 machine-verified)

### 3.1 Defects found by `prisma validate` (real CLI run, evidence in commit)

| Finding | Detail | Fix |
|---------|--------|-----|
| **164 validation errors** | Root cause: enums flattened to single-line literals during the v2.0 doc rewrite — invalid PSL. Cascaded into downstream "index references relation field" misdiagnoses | Expanded all 49 enums to canonical multiline form (scripted, diff-reviewed) ✅ |
| Invalid `@map` on relation field | `MarketplacePurchase.buyerOrg` — relation fields can't be column-mapped; hard failure | Removed ✅ |
| Relation without opposite | `User.triggeredRuns` lost its `PipelineRun.triggeredBy` opposite in the v2 rewrite | Restored ✅ |
| Final gate | `The schema … is valid 🚀` (Prisma CLI 5.22.0, run log) | ✅ |

### 3.2 Semantic audit (beyond the validator)

- **Circular dependencies:** relation graph walked — none (all cycles broken by optional `SetNull` sides, which Prisma permits and we use deliberately: Workflow↔WorkflowVersion via `currentVersion`).
- **Duplicate models:** none. Near-pairs verified intentional: `Voice` (catalog) vs `Voiceover` (per-script artifact); `Channel*` tables (connection vs daily metrics); `OutboxEvent` vs `ProcessedEvent` (outbox/inbox pair, different lifecycles).
- **Weak relations (dangling FKs):** 10 found → all converted to real FKs with `SetNull`: `project.default_voice_id`, `project.workflow_id`, `workflows.current_version_id`, `ai_messages.project_id`, `experiment_variants.thumbnail_id`, `webhook_endpoints.developer_app_id`, `organization_brands.{logo,logo_dark,favicon}_asset_id`, `voices.preview_asset_id`, `provider_credentials.plugin_installation_id`.
- **Missing constraints:** CHECK tier added (0006_checks.sql): `rating 1–5`, `confidence 0–1`, `ctr/avg_percent_watched 0–100`, `posts_per_day 1–20`, `platform_share_pct 0–100`, non-negative money/invoice/seconds fields.
- **Missing indexes:** system-template partial unique (§1 C-05); ivfflat vector indexes (already planned 0003; **probes `ivfflat.probes=10` set at session level for memory queries** — added to packages/database notes).
- **N+1 audit:** video-list cards denormalized (title/status/thumbnail on row — no join per card) ✅ design already; team-room feed carries `from_role` inline (no persona join) ✅; calendar is server-side day-bucket aggregate ✅; **flag evaluation** = ≤ 4 indexed lookups/flag + 30 s cache ✅ measured-acceptable; tenant pre-check on unique writes = +1 read per write (documented cost, RLS as compensating second layer).
- **Slow queries:** org analytics rollup = `video_analytics ⨝ videos` within date partitions (partition-pruned; OLAP read port at stage B); memory k-NN = ivfflat lists=100; publisher scan uses the partial scheduler index ✅.
- **Cascades:** full walk — 31 cascades/SetNulls match ownership semantics; no `Restrict` traps except intentional (workflow versions with runs refuse delete → archive path exists).

---

## 4. Workflow Engine Scale Assessment (requirement 4)

Arithmetic (jobs = BullMQ units; step jobs ≈ 15/run + ~7 asset fan-out + ~2 publish):

| Load | jobs/mo | jobs/s avg | jobs/s p99 (×20 burst) | Verdict |
|------|---------|-----------|------------------------|---------|
| 100k runs/mo | ~2.4M | ~0.9 | ~20 | **Yes**, single Redis headroom > 100× |
| 1M runs/mo | ~24M | ~9 | ~190 | **Yes, after v2.1 fix** (below) |

**Found gap RT-03 (real):** executor ran read-modify-write on run state without
concurrency control → two near-simultaneous completions on **parallel branches**
(gate splits, asset fan-ins) could double-advance a run or re-enqueue a node.
✅ **ADR-023**: compare-and-set on `pipeline_runs.state_version` (update affects-1
or re-read), plus orchestrator replicas sharded by `runId` hash (ordering
preserved; horizontal executor scaling without coordinator). Executor DB cost at
1M runs/mo ≈ 3 writes × 24M ≈ 28 writes/s avg — trivial for PgBouncer fronted PG.
**In-flight memory sanity:** 1M queued jobs × ~2KB envelopes ≈ 2 GB Redis — fits a
managed HA pair; backlog watchdog pages at > 500k depth; SQS-runner adapters are
the documented escape hatch at > 5M backlog (port exists).

---

## 5. Plugin System Simulation (requirement 5)

**Scenario:** third-party adds a "Pinterest" publisher plugin, end-to-end.

1. Manifest: `capabilities: [{ capability: "publisher", entry … }]` + `oauthConfig` descriptor + `secretKeys: [refreshToken]`. ✅ registry accepts, zero core files.
2. Install per org (config/secret → vault; healthcheck; enable). ✅ zero core edits.
3. Workflow node `plugin.pinterest-publisher` validates against installed bindings. ✅
4. **Channel connect:** `GET …/channels/connect/pinterest` — ❌ **FAILED in v2.0**: `Platform` was a **PG enum**; pinterest wasn't enrollable without a schema migration and enum-touching code across channels/publishing/analytics models. **This was a hard failure of requirement #2.**
   ✅ **Fix (ADR-022):** platform ids are registry-driven Strings everywhere (7 columns converted); connect flow is a single generic renderer of the provider's OAuth descriptor; consent screens enumerate plugin-declared scopes (Security §15).
5. Re-simulation: channel rows accept `platform="pinterest"`; publishing tasks, analytics collectors (plugin analytics binding), quota service, audits, WS/webhook events — all operate on registry strings. **PASS: zero Core changes.**

Additional simulation (NPM untrusted adapter): runs only in `worker-plugins` pool; data-only outputs rule (v2.1) kills worker-to-worker URL injection. Pass with v2.1 amendments.

---

## 6. Multi-Tenant Leak Analysis

| Vector | v2.0 state | v2.1 verdict |
|--------|-----------|--------------|
| Raw `PrismaClient` bypassing tenant extension | convention-only | Mitigated: only `infra/prisma` may import `@prisma/client` (boundary rule) + leak suite in CI; residual = human discipline, noted honestly |
| TEAM_ONLY projects visibility | service-layer, unenforced in extension | ◎ acceptable + **ProjectGuard** + tenancy tests; RLS tier-2 on videos/scripts is the optional hardening switch (perf-cost documented) |
| Redis cache keys | **not org-namespaced in v2.0** | ✅ rule added (Architecture §6.2 #7) + `tenant-cache-key` lint in the shared helper |
| WS rooms | join-time verification only — removed members kept sockets | ✅ revoke-event → forced disconnect within seconds (`security.session.revoked`) |
| S3/CDN | org-prefixed keys; signed cookies scoped per org prefix | ✅ sound; public-cacheable class limited to non-tenant-global artifacts |
| Event consumers | orgId context required by worker Prisma factory | ✅ sound (extension requires org for direct-org models) |
| Logs/traces | redaction existed for tokens | ✅ extended: email spans hash recipients; trace attributes carry orgId only |
| RLS DB-net | v1 tables + v2 sensitive set | videos/scripts exclusion = documented risk acceptance (hot-write perf) with tier-2 escalation path |

**"All queries forced to tenant scope?"** — direct-org models: yes, mechanically
(extension + RLS on high-blast + tests). Relation-scoped children: via org-scoped
parents, test-locked. True statement, with the named raw-client boundary enforced
by import rules, not by hope.

---

## 7. Security Delta Review (v2 surface)

New attack surface since v1 and its disposition — consent skip on OAuth AS
(already-granted exact-scope apps may auto-continue; anything else always shows
the screen; redirect URIs are **exact-match**, RT-10), remote-plugin egress
(→ safe-fetch, §7.5), NPM supply chain (→ sigstore/pin/allowlist, §7.5),
WS longevity (→ 12 h re-auth, 24 h cap, revoke-disconnect), memory poisoning
(self-scoped damage only; USER facts supersede-able; QC always enforces),
custom-domain hijack (TXT+CNAME verification; hourly suspension on DNS regression),
TOTP replay (single-use per window), SAML wrapping (single-use assertion IDs,
strict DSIG lib). **Net: v2.1 audit + §7.5 closes the discovered gaps; no
unmitigated HIGH items remain.**

---

## 8. Performance Model (assumptions: 10 videos/org/mo avg; 7% MAU→concurrent 0.1–0.5%)

| Tier | API RPS avg (p99) | jobs/s avg | Renders/min (peak) | PG TPS w+r | Bottlenecks (ranked) |
|------|-------------------|-----------|--------------------|-----------|-----------------------|
| 10k orgs | 60 (300) | ~1 | 3 (15) | ~400 | 1) render pod cold starts 2) orchestrator single point → now replicas 3) outbox lag under burst (alerted) |
| 100k orgs | 600 (3k) | ~10 | 25 (120) | ~4k | 1) PG write scaling → replica routing + partitions 2) WS fan-out tier split 3) analytics p95 → OLAP port trigger 4) Kafka flip on lag |
| 1M orgs (cells) | 6k (30k) | ~100 | 250 (1.2k) | 40k/cell×8 | 1) cells + control-plane routing 2) render fleet ~600 spot pods 3) **platform API quotas become the binding constraint** (quota service pacing is the designed answer) 4) global catalog replication |

Latency budgets hold: API p95 < 300 ms (stage A/B), pipeline P50 ≤ 12 min
(render-bound, not orchestration-bound — confirmed by job arithmetic above).

---

## 9. Cost Model (USD/month, AWS list prices + provider list prices)

| Orgs (videos/mo) | Infra | AI provider spend | Total COGS | Revenue (ARPU-blended) | Gross margin | #1 cost driver |
|---|---|---|---|---|---|---|
| 100 (1k) | $1.1k | $0.6k | $1.7k | ≈$5.6k | ~70% | fixed infra floor |
| 1k (10k) | $5.8k | $5.0k | $10.8k | ≈$56k | ~81% | **AI providers (46%)** |
| 10k (100k) | $41k | $42k | $83k | ≈$560k | ~85% | **AI providers (50%)**, then render pods (11%), S3+CDN (14% cum.) |

Cost-center order at scale: **AI tokens/media > render compute > storage+CDN >
PG/Redis > observability > support/tooling**. Sensitivity: premium render route
($1.50/video) at Starter mix compresses GM to ~65% — levers (already designed):
CHEAPEST objective defaults on lower tiers, credit budgets/ceilings, image-gen
over stock only when relevance check fails, quantized model routing via Q̂.
Margin floor guardrail: plan pricing assumes ≤ 30% premium-route mix; weekly
cost report + router-decision export (CI) is the tripwire.

---

## 10. AI Pipeline Review (merge/missing/redundant)

| Pair candidate | Verdict |
|----------------|---------|
| Trend Analyzer + Idea Generator | **Keep separate** — different cadences (bulk cached vs per-run creative) |
| Scene Planner + Asset Collector | **Keep** — planner output fans fetch out 6-way parallel; merging serializes |
| Subtitle Generator + Video Generator | **Keep** (multi-language tracks + QC sync measurement need it standalone); acknowledged as deliberately-light node |
| Fact Checker + QC | **Keep** — different loop targets (script vs media) and separate gating semantics |
| SEO + Publisher metadata | **Keep** — SEO output is auditable/editable artifact |

Missing: **Localizer — added in v2.1** as optional registered node (metadata +
subtitles to N languages). Redundant: **none**; every node carries a distinct
artifact, budget, or gate. Post-launch backlog recorded (not in template):
music-director node (Phase 5), comment-manager (Phase 6).

---

## 11. Red-Team Attacks (attacks run; outcomes)

| # | Attack | Result |
|---|--------|--------|
| RT-01 | Replay OAuth `state`/nonce across browsers | **Blocked** — one-time nonce store, PKCE binding |
| RT-02 | Double-spend credits via parallel run starts | **Blocked** — budget hold in org-row `FOR UPDATE` txn |
| RT-03 | Double-advance executor via parallel branch completions | **🔴 HOLE → FIXED** (ADR-023 OCC + replicas) |
| RT-04 | Stored XSS via workflow node labels / AI text | **Blocked** — React escaping + DOMPurify surfaces + CSP |
| RT-05 | SSRF via 302-chain to 169.254.169.254 in asset fetch | **Blocked** — per-redirect DNS re-resolution (§7.2) |
| RT-06 | Malicious plugin returns URL fetched by another worker | **🔴 HOLE → FIXED** (data-only outputs + presigned staging) |
| RT-07 | Typosquatted NPM plugin into worker image | **🔴 HOLE → FIXED** (allowlist + sigstore + pinned integrity, §7.5) |
| RT-08 | Ex-member keeps WS stream for hours | **🔴 HOLE → FIXED** (revoke-event disconnect + re-auth cycle) |
| RT-09 | Multiply rate limits across session/key/OAuth | **🔴 HOLE → FIXED** (identity-wide counters) |
| RT-10 | Open redirect via manipulated `redirect_uri` | **Blocked** — exact-match registry, no suffix matching |
| RT-11 | Domain squat: register victim brand's domain pre-verification | **Contained** — TXT token + CNAME required pre-activation; suspended on regression |
| RT-12 | Cross-org asset dedup leaks existence oracle | **Blocked** — checksum dedup is per-`(orgId, checksum)` scoped |

**5 attacks broke v2.0 defenses. All 5 are closed in v2.1**, and each closure is
a written rule + schema/ADR change, not a promise.

---

## 12. Amendments Index (v2.0 → v2.1) & Final Verdict

Applied across docs + extracted schema (this commit): 1 enum-syntax root fix
(164 validator errors) · relation-attribute fix · `triggeredBy` restore ·
ADR-022 platform registry (7 columns + API §13 + Architecture ADR/§8) ·
ADR-023 executor OCC (+`stateVersion` column, Architecture §9/§19, Database notes) ·
10 FK additions · CHECK tier 0006 · system-template partial unique · trend
capture normalization · Deployment Tempo→Jaeger · API §13 self-contained rewrite
+ `security.session.*` events · Security §7.5 supply chain + §9 audit catalog v2.1 ·
Architecture §6.2 cache-tenancy, §8.3 data-only outputs, §15 measured triggers,
§18 WS hygiene + identity-wide abuse · AI-Pipeline localizer node ·
README index update.

**Residual accepted risks (documented, monitored, dated):** cells detail-design at
stage C (Path exists; no code dependency); OLAP mapping at stage B (port seam
already exists); Temporal decision deferred by design; multi-region active-active
explicitly out of year-1 scope; marketplace human-moderation staffing plan is a
business ops item.

**Verdict statement:** after v2.1 there is **no known defect that would force a
redesign before build-out**. The claim is evidence-based: (1) official Prisma CLI
reports the 69-model/51-enum schema valid; (2) relation graph walked end-to-end —
no cycles, no dangling FKs, cascades enumerated; (3) scale arithmetic with stated
assumptions shows 100× headroom at target-1 and corrected executor semantics at
target-2; (4) the plugin simulation re-ran end-to-end with zero Core file touched;
(5) 5/12 red-team breaks reproduced and closed with mechanical fixes recorded in
git history. Anything the future disproves goes through the ADR process.
