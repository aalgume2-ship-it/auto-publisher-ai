# Event Catalog (generated — do not edit by hand)

**Source of truth:** `packages/shared/src/contracts/event-catalog.ts` (C1, frozen v1.1) ·
**Generator:** `infra/scripts/generate-event-catalog.mjs` · **Fingerprint:** `b67f035efbbd0235`

Envelope fields: `id` (uuidv7) · `type` · `version` · `orgId` · `aggregateType/Id` · `occurredAt` · `traceId?` · `correlationId?` (= id at chain root) · `causationId?` · `producer?` · `metadata?` · `payload` (this document).

**Event types:** 58 · **Catalog ↔ EventNames parity:** OK

Consumers are the canonical fleet ids: orchestrator · autopilot · notifications · ws-bridge · webhooks-out · audit · analytics-projections · memory-writer · quota-guard · search-indexer · billing-projection.

## aca.ai_team.* (1)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.ai_team.message.posted` | 1 | apps/worker | ws-bridge, notifications | `fromRole`: string, `kind`: APPROVAL_REQUEST\|BRIEF\|FEEDBACK\|HANDOFF\|NOTE\|REPORT, `messageId`: string, `orgId`: string, `projectId?`: string, `runId?`: string, `threadId`: string, `toRole`: string, `videoId?`: string | Crew message on the run/project thread (ADR-017). |

## aca.analytics.* (2)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.analytics.video.metrics_updated` | 1 | apps/worker | analytics-projections, memory-writer | `metrics`: object, `orgId`: string, `platform`: string, `videoId`: string, `window`: 1h\|24h\|28d\|7d | Fresh per-video platform metrics ingested. |
| `aca.analytics.channel.metrics_updated` | 1 | apps/worker | analytics-projections, memory-writer | `channelId`: string, `followersGained?`: number, `followersTotal?`: string, `orgId`: string, `platform`: string, `window`: 24h\|28d\|7d | Fresh per-channel platform metrics ingested. |

## aca.auth.* (1)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.auth.user.registered` | 1 | apps/api | notifications, analytics-projections, audit | `locale?`: string, `orgId`: string, `role`: ADMIN\|EDITOR\|OWNER\|VIEWER, `userId`: string | Account created with its owning organization. |

## aca.billing.* (9)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.billing.checkout.completed` | 1 | apps/api | billing-projection, notifications, analytics-projections | `externalRef`: string, `orgId`: string, `periodEnd`: string, `planCode`: string | Checkout finished; activates subscription at period start. |
| `aca.billing.subscription.activated` | 1 | apps/api | billing-projection, quota-guard, notifications, analytics-projections | `externalRef`: string, `orgId`: string, `planCode`: string, `seats`: number | Subscription active; plan limits and monthly credit grant apply. |
| `aca.billing.subscription.canceled` | 1 | apps/api | billing-projection, quota-guard, notifications | `effectiveAt?`: string, `externalRef`: string, `orgId`: string, `planCode`: string | Subscription canceled (effective now or at period end). |
| `aca.billing.subscription.past_due` | 1 | apps/api | billing-projection, quota-guard, notifications | `externalRef`: string, `orgId`: string, `planCode`: string | Payment failed; org enters dunning window. |
| `aca.billing.invoice.paid` | 1 | apps/api | billing-projection, audit | `amountCents`: number, `currency`: string, `externalRef`: string, `invoiceId`: string, `orgId`: string | Invoice settled. |
| `aca.billing.invoice.failed` | 1 | apps/api | billing-projection, notifications | `amountCents`: number, `currency`: string, `externalRef`: string, `invoiceId`: string, `orgId`: string | Invoice payment attempt failed. |
| `aca.billing.credits.granted` | 1 | apps/worker | notifications, analytics-projections | `balanceAfter`: number, `credits`: number, `orgId`: string, `reason`: ADJUSTMENT\|MONTHLY_GRANT\|PURCHASE\|REFUND | Credits landed in the org ledger (grant/purchase/refund). |
| `aca.billing.credits.depleted` | 1 | apps/worker | notifications, quota-guard, autopilot | `balanceAfter`: 0, `orgId`: string | Ledger hit zero — runs block until top-up (never surprise bills). |
| `aca.billing.credits.low` | 1 | apps/worker | notifications, autopilot | `balanceAfter`: number, `orgId`: string, `thresholdPct`: number | Ledger crossed the configured low threshold (80%/95%). |

## aca.channel.* (4)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.channel.connected` | 1 | apps/api | notifications, analytics-projections, autopilot | `channelId`: string, `displayName?`: string, `orgId`: string, `platform`: string, `platformChannelId`: string | OAuth channel connected and profile resolved. |
| `aca.channel.disconnected` | 1 | apps/api | notifications, autopilot, analytics-projections | `channelId`: string, `orgId`: string, `platform`: string, `reason`: ERROR\|TOKEN_REVOKED\|USER | Channel detached (user action or revoked token). |
| `aca.channel.token_expired` | 1 | apps/worker | notifications, autopilot | `channelId`: string, `orgId`: string, `platform`: string | Stored token expired; refresh failed — reconnect nudge. |
| `aca.channel.health_changed` | 1 | apps/worker | notifications, analytics-projections, autopilot | `channelId`: string, `from`: DEGRADED\|DOWN\|HEALTHY, `orgId`: string, `platform`: string, `to`: DEGRADED\|DOWN\|HEALTHY | Channel health transition from scheduled health probes. |

## aca.flags.* (1)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.flags.changed` | 1 | apps/api | audit, analytics-projections | `changedById?`: string, `from?`: unknown, `key`: string, `scope`: GLOBAL\|ORG\|PLAN\|USER, `to`: unknown | Feature flag or override changed (global/org/plan/user scope). |

## aca.idea.* (2)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.idea.generated` | 1 | apps/worker | autopilot, notifications, ws-bridge, analytics-projections | `ideaIds`: string[], `orgId`: string, `projectId`: string, `runId?`: string, `source`: AUTOPILOT\|MANUAL\|TREND_SCAN | Idea batch produced by trend analysis. |
| `aca.idea.approved` | 1 | apps/api | autopilot | `approvedById?`: string, `ideaIds`: string[], `orgId`: string, `projectId`: string | Idea(s) approved for production. |

## aca.marketplace.* (3)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.marketplace.listing.published` | 1 | apps/api | search-indexer, analytics-projections | `kind`: AI_EMPLOYEE\|PLUGIN\|PROMPT_PACK\|TEMPLATE\|VOICE\|WORKFLOW, `listingId`: string, `orgId`: string, `priceCents`: number | Seller listing published to the marketplace. |
| `aca.marketplace.purchase.completed` | 1 | apps/api | billing-projection, notifications, analytics-projections | `amountCents`: number, `currency`: string, `listingId`: string, `orgId`: string, `purchaseId`: string, `sellerOrgId`: string | Purchase settled (revenue split booked). |
| `aca.marketplace.install.completed` | 1 | apps/worker | notifications, analytics-projections | `installedRefId`: string, `kind`: AI_EMPLOYEE\|PLUGIN\|PROMPT_PACK\|TEMPLATE\|VOICE\|WORKFLOW, `listingId`: string, `orgId`: string | Artifact materialized into the buyer org. |

## aca.memory.* (2)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.memory.entry.created` | 1 | apps/worker | analytics-projections, ws-bridge | `channelId?`: string, `confidence`: number, `memoryId`: string, `orgId`: string, `projectId?`: string, `scope`: CHANNEL\|ORG\|PROJECT, `subject`: AUDIENCE\|DURATION\|FORMAT\|FREQUENCY\|HASHTAG\|HOOK_STYLE\|MUSIC\|POST_TIME\|THUMBNAIL_STYLE\|TOPIC\|VOICE\|WRITING_STYLE | Durable memory fact added to the channel/project/org scope. |
| `aca.memory.entry.superseded` | 1 | apps/worker | analytics-projections | `memoryId`: string, `orgId`: string, `subject`: string, `supersededById`: string | A memory truth was replaced by newer evidence. |

## aca.optimizer.* (2)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.optimizer.report.completed` | 1 | apps/worker | notifications, analytics-projections | `findings`: number, `memoriesWritten`: number, `orgId`: string, `projectId`: string, `reportId`: string, `windowDays`: number | Optimization report produced for a project window. |
| `aca.optimizer.actions.applied` | 1 | apps/worker | audit, analytics-projections, memory-writer | `actions`: string[], `appliedBy`: OPTIMIZER_AUTO\|USER, `orgId`: string, `projectId`: string, `reportId`: string | Approved optimizer actions applied (auto or user-driven). |

## aca.pipeline.* (9)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.pipeline.run.started` | 1 | apps/worker (workflow executor) | orchestrator, ws-bridge, notifications, analytics-projections | `creditBudget`: number, `orgId`: string, `projectId`: string, `runId`: string, `triggerSource`: API\|AUTOPILOT\|MANUAL\|OPTIMIZER\|RETRY\|WORKFLOW, `videoId`: string, `workflowVersionId`: string | Run began executing its pinned workflow version. |
| `aca.pipeline.run.step_completed` | 1 | apps/worker (workflow executor) | orchestrator, analytics-projections, ws-bridge | `attempt`: number, `costMicros?`: string, `durationMs?`: number, `nodeId`: string, `orgId`: string, `runId`: string, `step`: string, `videoId`: string | One DAG node finished (metered). |
| `aca.pipeline.run.step_failed` | 1 | apps/worker (workflow executor) | orchestrator, notifications, analytics-projections | `attempt`: number, `error`: string, `nodeId`: string, `orgId`: string, `runId`: string, `step`: string, `videoId`: string, `willRetry`: boolean | Node failed; willRetry reflects backoff budget. |
| `aca.pipeline.run.awaiting_review` | 1 | apps/worker (workflow executor) | notifications, ws-bridge, analytics-projections | `artifact`: string, `gateNodeId`: string, `orgId`: string, `runId`: string, `timeoutHours`: number, `videoId`: string | Review gate reached; run halts for a human decision. |
| `aca.pipeline.run.review_approved` | 1 | apps/api | orchestrator, ws-bridge, analytics-projections | `decidedById`: string, `gateNodeId`: string, `note?`: string, `orgId`: string, `runId`: string, `videoId`: string | Human approved the gate; run resumes. |
| `aca.pipeline.run.review_rejected` | 1 | apps/api | orchestrator, notifications, analytics-projections | `decidedById`: string, `gateNodeId`: string, `note?`: string, `orgId`: string, `runId`: string, `videoId`: string | Human rejected; loopback or abort per workflow. |
| `aca.pipeline.run.completed` | 1 | apps/worker (workflow executor) | notifications, analytics-projections, webhooks-out, autopilot | `creditsUsed`: number, `durationMs`: number, `orgId`: string, `runId`: string, `videoId`: string | All nodes done; video ready for scheduling. |
| `aca.pipeline.run.failed` | 1 | apps/worker (workflow executor) | notifications, analytics-projections, webhooks-out | `atNodeId?`: string, `creditsUsed`: number, `error`: string, `orgId`: string, `runId`: string, `videoId`: string | Run aborted (budget, unrecoverable step, or guardrail). |
| `aca.pipeline.run.canceled` | 1 | apps/api | orchestrator, analytics-projections | `canceledById?`: string, `orgId`: string, `reason?`: string, `runId`: string, `videoId`: string | Run canceled by user or gate timeout policy. |

## aca.plugin.* (4)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.plugin.installed` | 1 | apps/api | audit, ws-bridge | `installedById?`: string, `orgId`: string, `pluginId`: string, `slug`: string, `version`: string | Plugin installed into the org (config pending). |
| `aca.plugin.enabled` | 1 | apps/api | audit, orchestrator | `orgId`: string, `pluginId`: string, `slug`: string | Plugin enabled after config validation + healthcheck. |
| `aca.plugin.disabled` | 1 | apps/api | audit, orchestrator | `orgId`: string, `pluginId`: string, `slug`: string | Plugin disabled; router excludes it. |
| `aca.plugin.failed` | 1 | apps/worker | notifications, audit | `error`: string, `operation`: HEALTHCHECK\|INSTALL\|INVOKE, `orgId?`: string, `pluginId`: string, `slug`: string | Plugin operation failed (install/health/invoke). |

## aca.project.* (3)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.project.created` | 1 | apps/api | analytics-projections, search-indexer, ws-bridge | `language`: string, `name`: string, `orgId`: string, `projectId`: string, `targetPlatforms`: string[] | Project shell created. |
| `aca.project.automation.enabled` | 1 | apps/api | autopilot, notifications, analytics-projections | `orgId`: string, `projectId`: string, `reviewMode`: FULL_AUTO\|REVIEW_FINAL\|REVIEW_MEDIA\|REVIEW_SCRIPT, `scheduleCron?`: string | Autopilot armed for the project. |
| `aca.project.automation.disabled` | 1 | apps/api | autopilot, analytics-projections | `disabledById?`: string, `orgId`: string, `projectId`: string | Autopilot disarmed; in-flight runs continue. |

## aca.publishing.* (5)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.publishing.task.scheduled` | 1 | apps/worker (workflow executor) | notifications, analytics-projections, ws-bridge | `channelId`: string, `orgId`: string, `platform`: string, `scheduledAt`: string, `taskId`: string, `videoId`: string | Publish task queued for a channel/slot. |
| `aca.publishing.task.rescheduled` | 1 | apps/api | notifications, analytics-projections | `channelId`: string, `from`: string, `orgId`: string, `platform`: string, `taskId`: string, `to`: string, `videoId`: string | Task moved to a new slot. |
| `aca.publishing.publish.started` | 1 | apps/worker | analytics-projections, ws-bridge | `attempt`: number, `channelId`: string, `orgId`: string, `platform`: string, `taskId`: string, `videoId`: string | Upload to the platform began. |
| `aca.publishing.publish.completed` | 1 | apps/worker | notifications, analytics-projections, webhooks-out, memory-writer, autopilot | `channelId`: string, `orgId`: string, `platform`: string, `platformUrl`: string, `platformVideoId`: string, `scheduled`: boolean, `taskId`: string, `videoId`: string | Video live (or scheduled) on the platform — the north-star event. |
| `aca.publishing.publish.failed` | 1 | apps/worker | notifications, analytics-projections, webhooks-out | `attempt`: number, `channelId`: string, `error`: string, `orgId`: string, `platform`: string, `taskId`: string, `videoId`: string, `willRetry`: boolean | Upload failed within retry budget. |

## aca.security.* (3)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.security.session.reuse_detected` | 1 | apps/api | audit, notifications | `revokedCount`: number, `sessionId`: string, `userId`: string | Refresh-token reuse detected; session family revoked. |
| `aca.security.sso.enforced` | 1 | apps/api | audit, notifications | `domain`: string, `enforcedById`: string, `orgId`: string | SSO enforcement switched on for a domain. |
| `aca.security.membership.revoked` | 1 | apps/api | audit, notifications | `memberId`: string, `orgId`: string, `reason?`: string, `revokedById`: string, `userId`: string | Org membership revoked. |

## aca.system.* (1)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.system.quota.threshold` | 1 | apps/worker | notifications, analytics-projections | `limit`: number, `orgId`: string, `quota`: AI_CREDITS\|CHANNELS\|PROJECTS\|STORAGE_GB\|TEAM_SEATS\|VIDEOS_MONTHLY, `thresholdPct`: number, `used`: number | A plan quota crossed a configured threshold. |

## aca.video.* (3)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.video.created` | 1 | apps/api | analytics-projections, search-indexer, ws-bridge | `ideaId?`: string, `orgId`: string, `projectId`: string, `source`: API\|PIPELINE\|UPLOAD, `videoId`: string | Video row exists (pipeline target or upload). |
| `aca.video.generated` | 1 | apps/worker (workflow executor) | notifications, analytics-projections, ws-bridge, autopilot | `durationMs`: number, `orgId`: string, `projectId`: string, `qualityScore?`: number, `runId`: string, `videoId`: string | Render finished; media package ready. |
| `aca.video.deleted` | 1 | apps/api | analytics-projections, search-indexer, audit | `deletedById?`: string, `orgId`: string, `projectId`: string, `reason?`: string, `videoId`: string | Video soft-deleted per retention policy. |

## aca.webhook.* (1)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.webhook.endpoint.autodisabled` | 1 | apps/worker | notifications, audit | `consecutiveFailures`: number, `endpointId`: string, `lastStatus`: string, `orgId`: string | Endpoint auto-disabled after consecutive delivery failures. |

## aca.workflow.* (2)

| Event | v | Producer | Consumers | Payload | Description |
|---|---|---|---|---|---|
| `aca.workflow.published` | 1 | apps/api | orchestrator, search-indexer, audit | `isTemplate`: boolean, `orgId`: string, `version`: number, `versionId`: string, `workflowId`: string | Workflow version published (immutable from now on). |
| `aca.workflow.deprecated` | 1 | apps/api | orchestrator, audit | `orgId`: string, `version`: number, `versionId`: string, `workflowId`: string | Workflow version deprecated for new runs. |

---

**Versioning (C1):** payloads evolve additively only (new optional fields). Breaking change ⇒ new envelope `version` dual-emitted ≥ 6 months; never mutate v1. Contract changes require the `contract-change` label + linked ADR; the fingerprint above is asserted byte-for-byte by `packages/shared/test/event-catalog.spec.ts`.
