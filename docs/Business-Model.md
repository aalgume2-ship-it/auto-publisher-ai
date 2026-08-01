# AutoCreator AI — Business Model

**Status:** Approved-for-design · **Currency:** USD · **Horizon:** FY2026–FY2029

---

## 1. Market & Positioning

Short-form video is the default attention format; creators, faceless-channel
operators, agencies and SMB brands all face the same bottleneck: *consistent,
quality output at scale*. Existing tools each solve a slice (clipping,
scripting, or templated assembly). AutoCreator AI is the **full autonomous
loop**: research → creation → QC → publish → learn, with review modes that
let a customer dial autonomy from "approve everything" to "never log in."

**Differentiation (defensible):**

| Moat | Why it's hard to copy |
|------|------------------------|
| Closed-loop optimizer | Requires our combined pipeline+analytics dataset; attached to our schema, improves with every video |
| Multi-provider AI routing | Cost/latency/quality arbitrage competitors on single providers can't match; survives provider outages |
| Compliance-by-design publishing | AI-disclosure flags, originality gates, quota management — passes platform audits that kill gray-hat tools |
| RTL/Arabic-first quality | Caption shaping, voices, MENA trend sources — competitors treat RTL as an afterthought |
| Deterministic cost ledger | Per-video and per-org unit economics exposed to customers — agencies repackage us confidently |

---

## 2. Target Segments & ICPs

1. **Faceless-channel operators** (hobby→pro): 3–30 channels, volume-driven, price-sensitive → Starter/Pro.
2. **Solo creators & experts:** repurpose knowledge into shorts; value review gates → Pro.
3. **Agencies:** manage client channels; need seats, white-label reports, API → Business.
4. **SMB brands:** product/UGC content cadence without a videographer → Pro/Business.
5. **Enterprise networks (Phase 4+):** media groups: SSO/BYOK/audit → Enterprise.

---

## 3. Competitive Landscape

| Product | What it does | Gap we exploit |
|---------|--------------|----------------|
| revid.ai / AutoShorts / ShortX | Template shorts generators | No closed loop, thin QC, single platform focus, no per-org learning |
| Opus Clip / vidyo.ai / quso.ai | Clip long videos into shorts | Needs source footage — not autonomous creation |
| Pictory / InVideo AI | Prompt-to-video editors | Generation ≠ channel operation (no autopilot publishing + optimization) |
| Synthesia / HeyGen | Avatar presenters | High price, avatar niche, no trend/SEO loop |
| Buffer/vista (schedulers) | Scheduling only | No creation at all — actually a future *partner* channel |

None of the above owns the full 15-step loop with quality gates and an
optimizer — that is the category we define.

---

## 4. Pricing

**Principle:** subscription buys capacity + autonomy features; **AI credits**
buy consumption. Credits: **1 credit ≈ $0.004–0.005 blended provider cost**
→ customer-visible price **$0.012/credit** in packs → ≥ 65% floor margin even
on the premium render route (§5).

| | Free Trial (14d) | Starter $29/mo | Pro $79/mo | Business $199/mo | Enterprise (custom) |
|---|---|---|---|---|---|
| Videos / month | 10 | 30 | 120 | 400 | negotiated |
| AI credits / month | 250 | 750 | 3,000 | 10,000 | negotiated |
| Connected channels | 1 | 3 | 10 | 30 | unlimited |
| Projects | 1 | 2 | 10 | 50 | unlimited |
| Platforms | YouTube | all 3 | all 3 | all 3 | all + priority |
| Automation (autopilot) | — | ✅ | ✅ | ✅ | ✅ |
| Review modes | REVIEW_FINAL | all | all | all | all |
| Render quality | standard+watermark | standard | high | high | high + 4K eval |
| Team seats | 1 | 1 | 3 | 5 (extra $15/seat) | SSO/SAML, unlimited seats |
| API access | — | — | ✅ | ✅ higher limits | dedicated |
| BYOK (own AI keys) | — | — | — | ✅ | ✅ |
| Thumbnail A/B, optimizer auto-apply | — | — | ✅ | ✅ | ✅ |
| Priority queue lanes | — | — | — | ✅ | ✅ + region pinning |
| Support | community | email (48h) | email+chat (24h) | chat (4h) | dedicated CSM, SLA 99.9% |
| Audit log retention | 30d | 30d | 13mo | 13mo + export API | 7y archive |

- **Credit top-up packs** (never expire while subscribed): 1k/$12 · 5k/$55 · 20k/$199.
- Yearly = 2 months free. Overage policy: runs block at credit 0 (never surprise
  bills) with one-click top-up; soft notification at 80% and 95%.
- Launch offers: lifetime-deal cap (max 200 seats) for early traction; affiliates 25% first-year recurring.

**Price-experiment backlog:** usage-based-only tier; per-channel pricing;
regional PPP pricing for MENA/LatAm from month 6.

---

## 5. Unit Economics

Per-video cost (from AI-Pipeline §3): **$0.39 default / $0.60 premium-avg**;
infra (render/compute/storage/bandwidth) ≈ $0.05. Fully loaded ≈ **$0.60/video**
at default mix. Credit consumption billed to customer ≈ 100 credits ($1.20
pack-equivalent) per standard short → **~50% margin on consumption** layered
over subscription margin.

Blended P&L target per org/month (steady state, Pro cohort):

| Line | Amount |
|------|--------|
| Subscription revenue | $79 |
| Credit revenue (uplift ~20%) | $16 |
| COGS: AI spend | −$12 |
| COGS: infra (share) | −$7 |
| COGS: support+platform fees (Stripe 2.9% etc.) | −$7 |
| **Gross margin** | **≈ 87%** |

Models built on the measured ledger (not estimates) from week 6; cost-anomaly
alerts protect the margin automatically.

---

## 6. Projections (base case; conservative = 0.6×, stretch = 1.6×)

| | End FY26 (Dec) | End FY27 | End FY28 |
|---|---|---|---|
| Paying orgs | 1,000 | 6,500 | 22,000 |
| ARPU / mo | $48 | $56 | $61 |
| MRR | $48k | $364k | $1.34M |
| ARR run-rate | — | $4.4M | $16.1M |
| Gross margin | 78% | 84% | 86% |
| Monthly logo churn | 8% (early) | 4.5% | 3.5% |
| Payback (CAC payback) | — | ≤ 4 months | ≤ 3 months |

Assumes: trial→paid 18–24%, affiliate+SEO CAS mix below, annual-plan mix 30%
by FY28, NRR ≥ 110% by FY28 via seats+credits+upsell.

---

## 7. Go-To-Market

**Phase A (launch, Phase-2 GA):** Product Hunt/#buildinpublic + faceless-channel
YouTube itself (dogfooding: our own channel runs on the platform, documented
publicly as proof) + 50 micro-influencer affiliates in the "faceless automation"
niche + SEO ("how to automate a faceless channel", "youtube shorts automation")
with programmatic comparison pages vs each competitor.

**Phase B (multi-platform GA):** agency partnerships (rev-share 15%), Zapier/Make
marketplace listings, TikTok/Meta marketing-partner applications, MENA push:
Arabic-first onboarding, local payment methods (mada via Stripe), creator
community events Riyadh/Dubai.

**Phase C (Business+):** outbound to media groups, SOC 2 badge, partner program
with white-label option, marketplace flywheel (template creators earn → bring
their audiences).

**Retention loops:** weekly "your channel this week" digest (optimizer insights),
credit-fear removed (transparent ledger), switching cost = accumulated
learning data (top-performer corpus the optimizer depends on).

CAC assumptions: blended $90 FY27 via 60% organic/affiliate; LTV:CAC target ≥ 4.

---

## 8. Compliance & Policy Strategy (a moat, not overhead)

- **AI disclosure everywhere by default** (YouTube altered-content flag)
  with educated opt-out UX — protects customers' monetization and our quota
  relationship with platforms.
- **Originality gate in QC** blocks mass-produced duplicate content patterns
  that YouTube's YPP "inauthentic content" enforcement targets; marketing
  positions AutoCreator as the *compliant* automation tool.
- **Platform relationships:** quota audits answered with clean compliance
  artifacts (audit logs, disclosure records); goal: become the reference
  "good citizen" automation platform.
- **Subprocessors list** public (legal trust center): Stripe, OpenAI et al.,
  AWS, Cloudflare, Sentry, Resend — kept current by legal calendar.
- Content禁忌 policy (revenue-risk topics): medical/financial advice niches
  get stricter fact thresholds and forced review — priced into Enterprise
  guardrails feature.

---

## 9.1 Marketplace Economics (v2 addition)

- **Kinds:** templates, voices, prompts, agent personas, plugins, workflows (schema ready from Phase 0; public launch Phase 5).
- **Take rate:** 30% platform / 70% creator (payouts via Connect through the billing port; weekly cadence, $25 minimum).
- **Flywheel math:** creators bring audiences (content about their listings = free CAC), buyers become creators (one-click "publish this workflow as listing"). Target by FY28: 15% of orgs have ≥ 1 install; marketplace GMV = 8–12% of revenue with ~95% GM on the take rate (cost ≈ payout processing + moderation).
- **Quality gates:** conformance kit + review pipeline + refunds within 14 days (auto if install fails); rating weight favors recency to keep listings honest.
- **Risk control:** publisher KYC, code review for write-scope plugins, quarantine killswitch.

## 9.2 White-Label & Reseller Stream

Brand editor + custom domains + branded emails/invoices are Business-tier
included; **agency reseller add-on** ($399/mo): full client portals on agency
domains, per-client sub-org billing rollup, revenue-share reports. Positions
agencies to *sell channels-as-a-service* on top of us — high LTV, low churn
(they own their client), adds a second ARPU engine priced on value not credits.

## 9.3 Developer Ecosystem Stream

Public API tiers: included quota per plan; **overage API packs** for heavy
integrators; marketplace plugin distribution gives developers a revenue path
(70/30) — the platform earns on ecosystem transactions, and enterprise deals
close faster when integrations exist (classic platform effect; Zapier/Make
apps are our first-party proof points).

## 9.4 Risks & Sensitivities

| Risk | Impact | Hedge |
|------|--------|-------|
| Platform deprioritizes AI content | Model change for quality bar | QC originality + disclosure + human-review tiers diversify risk; long-form Phase 6 |
| AI price inflation | GM compression | Multi-provider routing + credit repricing clause + BYOK shift for big accounts |
| Copycat with big-brand distribution | CAC pressure | Data moat (optimizer), speed of multi-platform coverage, community |
| Key platform API removal | Channel loss | Never single-platform: 3 at GA, 6 by Phase 5; product value persists cross-platform |
| Payment fraud / promo abuse | Cash bleed | Stripe Radar, trial credit caps, disposable-email blocks, velocity rules |

---

## 10. North-Star Metric

**Published videos per week with Quality Score ≥ 80.**
Everything compounds from it: credits consumed (revenue), analytics corpus
(optimizer), customer-visible results (retention), platform trust (compliance).
Guardrails: publish success ≥ 99.5%, churn ≤ 4.5%/mo, GM ≥ 84%.
