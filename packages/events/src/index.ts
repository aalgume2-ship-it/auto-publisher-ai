/**
 * @aca/events — public surface (ADR-024).
 * Producers: OutboxWriter (same-tx). Infra: OutboxRelay, ConsumerRunner.
 * Ops: replayFromOutbox, deleteProcessedForScope, readCursor.
 */
export { type Logger, ConsoleLogger } from './types.js';
export {
  EventsConfigSchema,
  RetryPolicySchema,
  RelayConfigSchema,
  ConsumerConfigSchema,
  resolveEventsConfig,
  type EventsConfig,
  type EventsConfigInput,
  type RetryPolicy,
  type RetryPolicyInput,
  type RelayConfig,
  type ConsumerConfig,
} from './types.js';
export { resolveRetryPolicy, backoffMs, backoffCurve } from './retry.js';
export {
  fnv1a32,
  shardSlotForAggregate,
  streamKey,
  allStreamKeys,
  parseStreamKey,
  compositeEntryId,
  parseCompositeEntryId,
} from './shards.js';
export { buildEnvelope, buildEnvelopes, EventContractError } from './envelope.js';
export { OutboxWriter, createOutboxWriter, envelopeToRow, type OutboxTx } from './outbox-writer.js';
export { OutboxRelay } from './relay.js';
export { ConsumerRunner, type ConsumerRunnerOptions } from './consumer.js';
export {
  RedisStreamsBus,
  type BusOptions,
  type StreamEntry,
  type PendingEntry,
  type GroupLag,
} from './adapters/redis-streams-bus.js';
export {
  runWithInboxDedup,
  isUniqueViolation,
  readCursor,
  deleteProcessedForScope,
  type CursorMap,
  type InboxRunInput,
  type DedupOutcome,
} from './dedup.js';
export {
  writeDeadLetter,
  buildDeadLetterRow,
  dlxMirrorStream,
  DLQ_ERROR_MAX_CHARS,
  type DeadLetterRowInput,
} from './dlq.js';
export {
  planReplay,
  replayFromOutbox,
  REPLAY_BATCH,
  type ReplayFilter,
  type ReplayStats,
} from './replay.js';
export {
  type EventsMetrics,
  NoopEventsMetrics,
  OtelEventsMetrics,
  LoggingEventsMetrics,
} from './metrics.js';
export {
  extractProducerSpanContext,
  withConsumerSpan,
  injectProducerTrace,
} from './tracing.js';
