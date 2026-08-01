# Public Contracts — Freeze v1.0

**Freeze date:** 2026-08-01 (Phase 0.75) · **Canonical source:** `packages/shared/src/contracts/**`
(this document mirrors it; on any disagreement the TypeScript in `@aca/shared` wins and this doc
is regenerated from it in CI — `contracts-drift-check`) · **Versioning:** `CONTRACT_VERSION = 1.0.0`.

### Change policy (normative)

| Change class | Rule |
|--------------|------|
| Additive (new optional field, new event type, new capability method on a NEW sub-interface) | Allowed in-place; minor bump; conformance suite extended in same PR |
| Breaking (rename/remove/re-type, semantic change) | New major: `aca.<domain>.v2` events dual-emitted ≥ 6 months with `v1` sunset headers analogue; interfaces get `…V2` versions living side-by-side; `aca.workflow/2` new schema id. **Never mutate v1.** |
| Governance | Contract changes require: an ADR, the conformance/eval suites updated, and sign-off from any team whose code implements the contract |

Consumers pin major: SDKs, plugins, and remote plugins declare the contract major
they implement (`pluginManifest.contractMajor`); the platform supports N and N−1.

---

## C1 · Event Envelope & Bus (`contracts/events.ts`)

```ts
export interface EventEnvelope<T = unknown> {
  id: string;                    // uuidv7 — inbox dedup key
  type: `aca.${string}.${string}.${string}`;  // aca.<domain>.<entity>.<past-verb>
  version: 1;
  orgId: string | null;          // null only for true global events
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;            // RFC3339 UTC
  traceId?: string;              // W3C trace-id of the producing span tree
  // ── ADR-024 (v1.1 additive) — tracing the full causal chain ──
  correlationId?: string;        // chain root id (defaults to envelope.id at write)
  causationId?: string | null;   // id of the event/command that directly caused this one
  producer?: string;             // service/agent identity, injected at outbox write
  metadata?: Record<string, unknown>;  // extensibility bag (replay markers, hints)
  payload: T;                    // zod-typed per event in the catalog (contracts/event-catalog/*)
}

export interface IEventBus {
  appendToStream(stream: string, env: EventEnvelope): Promise<void>;  // relay-internal
  subscribe(opts: SubscribeOptions, handler: (env: EventEnvelope) => Promise<void>): Promise<void>;
  ack(stream: string, group: string, streamEntryId: string, consumer: string): Promise<void>;
}
```

Rules: producers write `outbox_events` inside the domain transaction (never direct);
`appendToStream` is reserved to the outbox relay; consumers are inbox-deduped
(`(consumer, event.id)`, inserted in the SAME tx as their domain writes) and checkpoint
`consumer_cursors` in that tx — Redis consumer-group state is disposable cache.
DLQ truth lives in `dead_letter_events` (ADR-024); replay re-delivers the ORIGINAL
envelope id. Payloads are versioned per event type in the catalog — breaking payload
change ⇒ `version: 2` envelope emitted alongside; the catalog is frozen C1 material
and `docs/Event-Catalog.md` is CI-generated from it.

## C2 · Plugin Manifest (`contracts/plugin-manifest.ts`)

```ts
export const CapabilityKind = z.enum([
  "llm.chat","llm.json","llm.vision","tts.synthesize","image.generate",
  "stock.video.search","stock.image.search","music.search","transcription.transcribe",
  "search.web","publisher","video-engine","analytics.collector","storage.object",
]);
export interface PluginManifest {
  id: `${string}.${string}`;                 // namespaced slug, e.g. "pinterest.publisher"
  version: string;                           // semver of the plugin package
  contractMajor: 1;                          // contracts major implemented
  displayName: string; publisher: { name: string; orgId?: string; verified: boolean };
  kind: "builtin" | "npm" | "remote";
  capabilities: Array<{ capability: z.infer<typeof CapabilityKind>; entry: string;
    costClass?: "low"|"medium"|"high"; languages?: string[]; models?: string[] }>;
  configSchema?: unknown;                    // JSON Schema — install-time validation
  secretKeys?: string[];                     // stored in vault via provider_credentials
  oauthConfig?: {                            // publisher kind only
    authorizeUrl: string; tokenUrl: string; scopes: string[]; pkce: "required"|"optional"|"none";
    channelInfoPath?: string;                // how to resolve platformChannelId/profile
  };
  runtime?: { timeoutMs: number; maxMemoryMB: number; egressHosts?: string[] };
}
```

## C3 · AI Provider Interfaces (`contracts/ai-providers.ts`)

```ts
export interface Usage { promptTokens?: number; completionTokens?: number;
  costMicros: bigint; latencyMs: number; }
export interface ILLMProvider    { llmJson<T>(req: { model?: string; system?: string; prompt: string;
                                     schema: ZodType<T>; maxTokens?: number }): Promise<{ data: T; usage: Usage }>;
                                   llmChat(req: ChatReq): Promise<{ text: string; usage: Usage }>; }
export interface ITTSProvider    { synthesize(req: { voiceId: string; text: string; language: string;
                                     format: "mp3"|"wav"; wordTimings: true }):
                                   Promise<{ audioKey: string; durationMs: number; words: WordTiming[]; usage: Usage }>; }
export interface IImageProvider  { generate(req: { prompt: string; width: number; height: number;
                                     styleSuffix?: string; seed?: number }):
                                   Promise<{ imageKey: string; usage: Usage }>; }
export interface IStockProvider  { search(req: { query: string; kind: "video"|"image"; page: number;
                                     perPage: number }): Promise<{ hits: StockHit[]; usage: Usage }>; }
export interface IMusicProvider  { search(req: { mood: string; durationMsMin: number }):
                                   Promise<{ track: MusicTrack | null; usage: Usage }>; }
export interface ITranscriptionProvider { transcribe(req: { audioKey: string; language?: string }):
                                   Promise<{ words: WordTiming[]; usage: Usage }>; }
export interface ISearchProvider { web(req: { query: string; maxResults: number }):
                                   Promise<{ results: SearchResult[]; usage: Usage }>; }
```

`WordTiming`, `StockHit`, `MusicTrack`, `SearchResult`, `ChatReq` are zod-frozen in the file.
All providers: throw `ProviderError{ code: RATE_LIMITED|UNAVAILABLE|CONTENT_POLICY|INVALID|UPSTREAM, retryAfterMs? }` —
the router maps these uniformly (conformance suite asserts the taxonomy).

## C4 · Payment Provider (`contracts/payment-provider.ts`)

```ts
export type NormalizedBillingEvent =
  | { kind: "checkout.completed"; orgId: string; planCode: string; periodEnd: string; externalRef: string }
  | { kind: "subscription.activated" | "subscription.canceled" | "subscription.past_due"; orgId: string; externalRef: string }
  | { kind: "invoice.paid" | "invoice.failed"; orgId: string; amountCents: number; currency: string; externalRef: string }
  | { kind: "credits.purchased"; orgId: string; credits: number; amountCents: number; externalRef: string };

export interface IPaymentProvider {
  readonly id: string;                                         // "stripe" | "paddle" | …
  createCheckout(req: { orgId: string; priceRef: string; successUrl: string; cancelUrl: string }): Promise<{ url: string }>;
  createPortal(orgId: string): Promise<{ url: string }>;
  verifyAndNormalizeWebhook(headers: Record<string,string>, rawBody: Buffer): Promise<NormalizedBillingEvent[]>;
  refund(externalRef: string, amountCents?: number): Promise<void>;
  syncSubscription(externalRef: string): Promise<SubscriptionSnapshot>;
}
```

No provider payload ever crosses this boundary — core consumes `NormalizedBillingEvent` only.

## C5 · Storage (`contracts/storage-port.ts`)

```ts
export interface IStoragePort {
  createUploadIntent(req: { orgId: string; type: AssetType; bytes: number; mimeType: string }):
    Promise<{ storageKey: string; uploadUrl: string; headers: Record<string,string> }>;
  head(storageKey: string): Promise<{ bytes: number; mimeType: string } | null>;
  copy(srcKey: string, dstKey: string): Promise<void>;
  delete(storageKey: string): Promise<void>;
  presignRead(storageKey: string, ttlSec: number): Promise<string>;      // upload-flow only
  cdnUrl(cdnPath: string, opts?: { privateClass?: boolean }): string;    // absolute, CDN, immutable
}
```

## C6 · Publisher (`contracts/publisher-client.ts`)

```ts
export interface IPublisherClient {
  readonly platform: string;                                   // registry id (ADR-022)
  fetchChannelProfile(credential: VaultRef): Promise<{ platformChannelId: string; displayName: string;
    handle?: string; avatarUrl?: string; followers?: bigint }>;
  publish(task: { video: PublishVideoInput; channel: VaultRef; scheduledAt?: string;
    title: string; description?: string; hashtags: string[]; thumbnailKey?: string;
    aiDisclosure: boolean }): Promise<{ platformVideoId: string; platformUrl: string;
    platformPostId?: string; scheduled: boolean }>;
  fetchVideoMetrics(ref: { credential: VaultRef; platformVideoId: string }): Promise<PlatformMetrics>;
  fetchChannelMetrics(credential: VaultRef, sinceDays: number): Promise<PlatformMetrics>;
  quotas(credential: VaultRef): Promise<{ remainingToday?: number; resetsAt?: string }>;
}
```

## C7 · Workflow Definition & Agent Contract (`contracts/workflow.ts`)

- `WorkflowDefinition` zod schema with the literal `schema: "aca.workflow/1"` (frozen
  per docs/AI-Pipeline.md §2 — nodes: `agent.*`, `plugin.*`, `gate.review`, `gate.condition`;
  `creditBudget` required; ≤ 24 nodes; acyclic).
- Agent contract:

```ts
export interface PipelineAgent<I, O> {
  readonly kind: string;                    // "agent.script-writer" or plugin kind
  readonly qualityFloor: number;            // router may never route below this
  execute(ctx: AgentContext, input: I): Promise<O>;   // in/out zod-validated at the boundary
}
```

`AgentContext` surface (frozen): `{ run, node, orgId, db, storage, providers, ledger,
memory, team, trace, emitProgress, signal }` — additions are optional properties only.

---

### Freeze enforcement in CI

1. `contracts-drift-check` job: regenerates this document's code blocks from
   `packages/shared/src/contracts/**` and diffs — failure means doc or code not updated together.
2. `plugin-conformance.yml` runs capability suites against every first-party adapter post-change.
3. `prompt-evals` guards prompt-side behavioral contracts.
4. PRs touching `packages/shared/src/contracts/**` require label `contract-change` + linked ADR
   (checked by a small CI script on labels).
