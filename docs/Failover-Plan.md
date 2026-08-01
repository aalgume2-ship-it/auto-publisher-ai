# Failure Injection & Failover Plan

**Philosophy:** failures are rehearsed monthly (GameDay) and injected continuously in
staging (chaos job) — not discovered by customers. Every scenario below states:
**Detection → Immediate behavior (customer impact) → Recovery → Verification.**
Drills run via `infra/scripts/gameday.sh`; results are recorded as GitHub issues tagged
`gameday` with attached evidence (dashboards, traces).

---

## F1 · AI Provider outage (e.g. OpenAI down / key revoked / 429 storm)

| Aspect | Behavior |
|--------|----------|
| Detection | `ai_provider_errors{provider}` spike; circuit breaker opens (50% failures / 30 s) |
| Immediate | In-call retry (2×, jitter) → breaker opens → **router fails over to next preferred provider** for that capability, same quality floor; per-run budget guards hold; affected step emits `pipeline.step.retrying` |
| If ALL providers for a capability down | Step job fails after queue retries → run PAUSED (not FAILED) with `provider_outage` reason; user notified "will auto-resume"; orchestrator resumes runs automatically on `provider.healthy` event (30 min probe) |
| Recovery | Breaker half-open probes; health score recovers → traffic rebalances per objective scores |
| Verify (drill) | Block egress to provider IPs in staging for 30 min: **target: 0 permanently failed runs, P95 step added delay < 3 min, cost variance vs baseline < 20%** |

## F2 · Redis loss (queues + bus + cache)

| Aspect | Behavior |
|--------|----------|
| Detection | Redis down → API/Worker readiness flips (`/health/ready` 503), API refuses new work gracefully (503 + Retry-After), no partial writes |
| Immediate | In-flight BullMQ jobs: new workers can't fetch; existing workers finish current job ackless (will redeliver on stall detect after restart) |
| Recovery | AOF everysec + failover replica (managed). Point-in-time regained ≤ 60 s data exposure. Then: **run-resync job** scans `pipeline_runs.status IN (RUNNING, PAUSED)` and re-enqueues the current node (idempotent step re-execution re-attaches artifacts by content hash → zero duplicate billing); outbox relay catches up from `published_at IS NULL` (no event loss ever — events live in PG first) |
| Cache | Cold-start stampede guarded by jittered TTLs + request coalescing on hot keys |
| Verify (drill) | `redis-cli DEBUG FAILOVER` mid-render storm: **0 lost runs, 0 duplicate ledger entries, catch-up < 5 min** |

## F3 · PostgreSQL primary failure

| Aspect | Behavior |
|--------|----------|
| Detection | Managed failover (RDS Multi-AZ) promotes replica ≤ 60 s; app sees brief connection errors → pool reconnect with backoff |
| Immediate | Writes pause ≤ failover window; reads on replica continue (read router); outbox writer retries survive (in-tx guarantee) |
| Recovery | PgBouncer re-pools; sessions unaffected (JWT stateless); if rollback needed → PITR ≤ 5 min RPO |
| Verify (drill) | Force reboot-with-failover during checkout + pipeline run: **no double-charges (idempotency keys + processed events), no lost runs, error page wave < 90 s** |

## F4 · FFmpeg crash / render node death (segfault, OOM, bad input)

| Aspect | Behavior |
|--------|----------|
| Detection | job failure w/ exit code + ffmpeg log tail captured to S3 (`render_logs_key`) |
| Immediate | Retry #1 same spec (transient); Retry #2 → **degraded-spec fallback**: retry on different node type; if a specific scene asset corrupts x264 → asset-collector re-fetches that scene once (`specHash` partial invalidation) |
| If persistent | Step FAILED with parsed reason (`exit 69 = OOM` → memory-class bump; filtergraph parse error → fail fast to QC with defect report) → run PAUSED + ops alert with log link |
| Verify (drill) | Chaos pod-kill during render (SIGKILL mid-encode): **job redelivers via stalled detection ≤ 40 s, final video passes all render probes, 0 corrupted outputs shipped** (QC probes are the last word: duration/audiostream/black-frame) |

## F5 · Storage (S3/MinIO/R2) outage

| Aspect | Behavior |
|--------|----------|
| Detection | S3 5xx/timeouts on `IStoragePort` ops; readiness degrades on media-serving paths only |
| Immediate | Upload/copy/render-write steps fail → queue retries (exp); **publishing is NOT blocked for already-rendered assets** behind CDN (CDN cached-hit continues; signed URL minting requires API, so reads degrade for cold objects) |
| Multi-region event | Cross-region replica bucket failover for reads (docs/Deployment DR runbook); writes queue-retry until origin returns (RPO 0 for committed rows since keys are DB-committed after write success — no phantom references) |
| Verify (drill) | Blackhole S3 endpoint 20 min: **no 500s on already-published content pages (CDN), renders retry-success after restore, 0 dangling asset rows** (confirm-step invariant) |

## F6 · OAuth platform provider outage (YouTube/TikTok/IG OAuth or API down)

| Aspect | Behavior |
|--------|----------|
| Connect flow | Unavailable → user-facing degraded banner, retries; nothing half-connected (credential write is post-exchange) |
| Token refresh | Failures retry ×5 over 2 h; **two consecutive failures → channel TOKEN_EXPIRED + notification** (never silent) |
| Publishing | Publisher honors `Retry-After`, platform 5xx → jittered queue retries (up to 24 h for scheduled tasks); persistent outage → tasks shift to next posting window (`publish.rescheduled` events); scheduled backlog drains FIFO when provider returns |
| Analytics | Collector skips cycle, backfills later (`capturedAt` distinguishes staleness); dashboards show "delayed" marker |
| Verify (drill) | Mock provider 500s for 2 h in staging: **0 tasks FAILED for transient codes, 100% eventual success rate, correct rescheduled notifications** |

## F7 · Payment provider outage (Stripe down)

| Aspect | Behavior |
|--------|----------|
| Checkout/Portal | Degraded UX (retry later notice) — no partial local state; webhooks |
| Webhook delivery pause | Provider retries webhooks itself (24 h+); `processed_webhook_events` dedup means replay storms are safe; `subscription sync-on-read` fallback pulls current state when a webhook is suspected stale (>15 min on critical actions) |
| Entitlements | Never gated on live provider calls at request time — entitlements read local subscription rows; a provider outage can delay upgrades/downgrades but cannot break runtime features |
| Verify (drill) | Block webhook ingress 1 h, then replay: **exactly-once entitlement transitions (processed-events proof), MRR dashboard ±0 after reconciliation job** |

---

## Recurring chaos schedule

| Cadence | Injection | Success gate |
|---------|-----------|--------------|
| Weekly (staging, automated) | random: provider block / worker kill / redis failover / s3 blackhole, one at a time, 30 min | gates per scenario above; regression opens `chaos-fail` issue, blocks next prod deploy |
| Monthly GameDay (prod-adjacent env, scripted) | full matrix including pause-the-unpausable (outbox relay kill) + restore drill | RTO/RPO table in Deployment §10 re-attested |
| Pre-milestone (before Phase 2 GA, before stage B) | all of the above + **restore-from-backup** full rehearsal | signed runbook notes in ops log |

**Known single points after v2.1 (honest list):** orchestrator (mitigated: replicas +
OCC), outbox relay (2 replicas, shardless), Cloudflare control plane (acceptable
regional AnyCast design), KMS decrypt path (cached data keys per pod session,
documented IR for KMS outage in Security §4 — decrypt cache TTL 5 min then open-
circuit publish steps only, reads of ciphertext never in request path).
