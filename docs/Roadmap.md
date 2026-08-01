# AutoCreator AI — Roadmap (v2)

**Horizon:** Aug 2026 → May 2027 (10 months) · **Cadence:** 2-week sprints, demo every sprint end
**Planning unit:** each phase has *Deliverables* (what ships) and *Exit Criteria* (measurable gate before next phase)

**v2 (Phase 0.5) changes:** scope merged — tenancy v2 (teams/roles/branding), event backbone (outbox/inbox), workflow engine, plugin system, AI memory & AI team, feature flags, developer platform, marketplace — distributed into phases below without moving the revenue-first sequence. Phase 0 is +2 weeks (6 total) to absorb backbone-first construction; later phases were re-balanced, end date unchanged (major scope moves INTO the same timeline because the backbone replaces work that would otherwise be re-done).

---

## 0. Guiding Principle

Sequencing follows **revenue-path-first**: YouTube Shorts is the fastest
approvable integration with the loosest posting caps → ship the full loop on
YouTube, monetize, then layer TikTok & Instagram once their app reviews clear.
Vertical slices over horizontal layers: every phase ends with a *usable
product*, not a pile of components.

---

## Phase 0 — Foundation (Weeks 1–6 · Aug–mid-Sep 2026)

**Deliverables**
- Monorepo bootstrap v2 (Turborepo + pnpm): `apps/web`, `apps/api`, `apps/worker`, `apps/worker-plugins`, all shared packages with boundary linting (incl. vendor-SDK confinement rule); local compose incl. **Jaeger**; CI suite incl. plugin-conformance gate.
- **Event backbone first** (ADR-009): `@aca/events` (envelope/catalog/redis-streams adapter), transactional outbox + relay, inbox dedup, DLX — before any domain module (cheaper now than retrofit).
- Auth complete: email/password, Google OAuth, JWT rotation/reuse-detection, MFA (TOTP) schema+API, sessions UI.
- **Tenancy v2:** organizations, **teams**, members + invitations w/ team assignment, system + **custom roles** w/ capability guards + matrix tests, **brand basics** (logo/colors), audit service.
- Billing skeleton via **`IPaymentProvider`** (Stripe adapter): Checkout/Portal → normalized `billing.*` events; credit ledger + grants; plan-limit middleware.
- **Feature flags** (OpenFeature + DB provider + cascade) — all subsequent features ship flagged.
- Token vault + KMS; channel OAuth (YouTube) behind flag; **CDN URL** path established for assets.
- Web shell: dashboard + brand-theming provider, en/ar + RTL, SDK client, flags bootstrap.

**External dependencies started NOW (long lead time):**
| Item | Action week |
|------|-------------|
| Google Cloud project + YouTube Data API OAuth consent screen (unverified is fine for dev) | 1 |
| TikTok Developer app + Content Posting API **app review submission** | 2 |
| Meta/Facebook app + Instagram Graph API **App Review** (`instagram_content_publish`) | 2 |
| YouTube API **compliance audit & quota increase** request | 3 |

**Exit criteria:** a user can register, create org, invite teammate, subscribe
to a paid plan, and connect a YouTube channel with tokens verifiably encrypted
at rest. CI gate security checks all green.

---

## Phase 1 — Workflow Engine + AI Core (Weeks 7–13 · mid-Sep–Oct 2026)

**Deliverables**
- `@aca/plugin-kit` + first-party adapters converted into registry plugins (OpenAI/Anthropic/Google/OpenRouter/DeepSeek LLMs; ElevenLabs/OpenAI/Google TTS; Pexels/Pixabay; Stability/OpenAI images) behind the **cost-optimizing router** (4 objectives + learned Q̂ v0 from eval harness).
- **Workflow Engine:** definition schema, validator + cost estimator, generic executor, gates, loopback caps; system template `autopilot-v1` (15 nodes) seeded; workflow CRUD + JSON editor in web.
- Agents 1–12 per spec with **memory context injection**; `worker-plugins` pool live (isolation policies); conformance suite green.
- **AI Memory v1:** entries model, compose/read API, manual facts, decay job; **AI Team v1:** 10 personas seeded, `ai_messages` team room feed, Content-Manager brief per run.
- `packages/video-engine`: FFmpeg 7, captions (RTL), loudness, renditions; **AI Studio** with live progress + gates + credit meter; assets via **CDN URLs** end-to-end.
- Ops v2 dashboards (Event bus health, router decisions, plugin SLIs) + Jaeger traces across outbox.

**Exit criteria:** from a keyword to a finished watermarked short *without
publishing*, P50 ≤ 12 min, QC gates functioning, per-video cost ≤ $0.60 on
default routing (measured from ledger, 100-video sample), all quality gates
(spell/grammar/fact/audio/sync/render) enforced before QC passes.

---

## Phase 2 — YouTube GA + Public API v1 (Weeks 14–18 · Nov–Dec 2026)

**Deliverables**
- Publisher agent (YouTube): resumable uploads, quota service, scheduling, AI-disclosure; **post-time memory** reader.
- Autopilot scheduler with fairness; Calendar UI; Publishing board.
- Analytics Collector v1 (YT) + dashboards; Analyst digests into team room.
- **Public API v1:** API-key auth GA, **`/v1` freeze & version policy published**, `@autocreator/sdk` (TS) published to npm, OpenAPI reference site v1 (static).
- **White label v1:** brand editor (logo/colors/email sender), portal domain support (custom_domains PORTAL + Cloudflare for SaaS).
- Memory writer v1 (optimizer → entries + supersede) turning the learning loop on for first customers.
- **Launch** Starter/Pro + 14-day trial.

**Exit criteria:** customer's channel fully autopilots for 14 consecutive days
without human touch (FULL_AUTO mode); publish success ≥ 99.5% (auto-retry);
first 50 paying orgs.

---

## Phase 3 — TikTok + Instagram GA + Workflows & Marketplace Schema (Weeks 19–24 · Dec 2026–Jan 2027)

**Deliverables**
- TikTok (Direct Post/draft fallback) + Instagram (container two-step) publishers; platform SEO profiles & renditions; TT/IG analytics; unified calendar.
- **Visual Workflow Builder** (node editor, gate placement, cost-estimate preview) + per-node routing objectives.
- **Marketplace schema live (internal catalog):** listings/purchases/reviews rows + install flow for workflows & templates; internal-only storefront dogfooded by our own templates & personas; Stripe Connect onboarding path built.
- Thumbnail A/B experiments + Optimization Reports + optimizer-augmented Idea Generator; **memory supersede chains live**; Growth Manager weekly reports.
- Localization pass: Arabic-first UX hardened; MENA trend regions.

**Exit criteria:** ≥ 3 platforms publishing from one pipeline run; ≥ 1,000
paying orgs; monthly churn < 6%; TikTok/IG approval emails archived in
compliance register.

---

## Phase 4 — Enterprise & Developer Platform (Jan–Feb 2027)

**Deliverables**
- Optimizer GA: memory-driven evolution (auto in FULL_AUTO / suggestions otherwise), experiment engine, niche baselines (k-anonymized).
- **Enterprise pack:** SSO (SAML+OIDC) w/ domain enforcement & JIT, **SCIM 2.0**, **IP allow lists**, session policies, audit export API w/ signed checksums, BYOK GA, priority queue lanes, EU-region option.
- **Developer platform v2:** OAuth 2.0 AS GA (consent, grants, connected-apps UI), app review pipeline, developer portal (guides + OpenAPI reference), webhooks-out GA + Zapier/Make apps.
- Billing adapters: **LemonSqueezy** + regional PSP (mada) joins Stripe behind the port; payout flow (Connect) prepared for marketplace launch.
- 20-language pipelines; render autoscaling on spot; API p95 < 300 ms @ 1k RPS weekly k6.

**Exit criteria:** measured uplift — optimizer-managed projects show ≥ 20%
higher median `avgPercentWatched` vs control after 4 weeks; 3+ Business
contracts; SOC 2 Type I audit started.

---

## Phase 5 — Marketplace Public + Scale (Mar–Apr 2027)

**Deliverables**
- **Marketplace public launch:** all kinds (templates, voices, prompts, agent personas, **plugins**, workflows) with 70/30 revenue share + payouts, review/moderation pipeline, featured editorial.
- Facebook Reels + X + LinkedIn publishers (as registry plugins — proof that platform additions bypass Core).
- Brand kits per project (fonts/logos), multi-variant generation; white-label **full** (custom emails, invoice branding, portal themes).
- Comments ingestion + auto-reply suggestions v1.
- **Scale stage B:** Kafka eventbus flip (flag), ClickHouse analytics read port, replica routing for PG, cell-architecture groundwork doc (org→cell keyspace).
- SOC 2 Type I → Type II window; pen-test remediation program.

**Exit criteria:** 10k orgs capacity proven in load/stress (Architecture §14
rehearsal); NRR ≥ 110%; Type II clock running.

---

## Phase 6 — Expansion (May 2027+)

Long-form engine (5–15 min YouTube videos), Snapchat spotlight, white-label
agency mode, self-serve credit marketplace, Series A data room (audit trail +
cost ledger + retention cohorts already first-class citizens of the schema).

---

## Team Plan

| Phase | Engineers | Notes |
|-------|-----------|-------|
| 0–1 | 3 (1 platform/lead, 1 full-stack, 1 video/AI) | Contractor: motion designer for caption/thumbnail templates |
| 2–3 | 4 (+1 backend) | Fractional compliance counsel (platform ToS) |
| 4–6 | 6–8 | +DevOps, +support engineer |

## KPI Targets

| Milestone | Metric |
|-----------|--------|
| End Phase 2 | 50 paying orgs; P50 pipeline ≤ 12 min |
| End Phase 3 | 1,000 paying orgs; $35k MRR |
| End Phase 5 | 6,000 paying orgs; $240k MRR; churn < 4%/mo |

## Risk Register (top 5 — full list in Architecture §18)

| Risk | Early signal | Mitigation |
|------|--------------|------------|
| TikTok/Meta app review slip | No approval by week 10 | YouTube-first revenue path; draft-mode fallback keeps TT value |
| YouTube quota throttles scale | Quota alerts > 80% daily | Cohort projects; pacing; quota extension in week 3 queue |
| Provider cost inflation | Unit-cost trend +15% | Routed fallbacks, price abstraction in ledger, plan repricing policy |
| Render COGS | cost/video > $0.15 compute | Preset tuning, spot nodes, resolution gating per plan |
| Key-person dependency | bus factor 1 on video-engine | ADR-005 port design + recording of engine internals walkthrough in Phase 1 |
