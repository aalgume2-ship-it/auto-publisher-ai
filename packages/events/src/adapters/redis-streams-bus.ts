/**
 * Redis Streams transport — the ONLY file in @aca/events allowed to import the
 * vendor SDK (§16 zero-lock-in policy; the Kafka adapter maps 1:1 against the
 * same semantic surface: logical stream→topic, group→group, slot→partition).
 *
 * Transport rules (ADR-024): Redis holds NO truth. Every entry here is a copy
 * of an outbox row; loss/rebuild is repairable from PG via replay or cursor
 * re-bootstrap. Physical key = `${logical}:${slot-padded}` (64 slots default).
 */
import { Redis } from 'ioredis';
import type { EventEnvelope } from '@aca/shared';
import {
  allStreamKeys,
  compositeEntryId,
  parseCompositeEntryId,
  parseStreamKey,
  shardSlotForAggregate,
  streamKey,
} from '../shards.js';
import type { Logger } from '../types.js';

export interface StreamEntry {
  /** Physical stream key. */
  key: string;
  /** Logical stream (events:<domain>), slot suffix stripped. */
  logical: string;
  slot: number;
  /** Redis entry id ("<ms>-<seq>"). */
  entryId: string;
  envelope: EventEnvelope;
}

export interface PendingEntry {
  slot: number;
  entryId: string;
  consumer: string;
  idleMs: number;
  deliveries: number;
}

export interface GroupLag {
  /** Entries never delivered to the group (sum over slots). */
  undelivered: number;
  /** Delivered but unacked (sum over slots). */
  pending: number;
}

export interface BusOptions {
  url: string;
  shardCount: number;
  /** Approximate MAXLEN trim per shard (memory bound; PG remains truth). */
  streamMaxLen: number;
  logger?: Logger;
}

type RawXReadGroup = Array<[key: string, entries: Array<[id: string, fields: string[]]>]> | null;

function fieldsToObject(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) out[fields[i] as string] = fields[i + 1] as string;
  return out;
}

function parseEntry(
  key: string,
  shardCount: number,
  id: string,
  fields: string[],
): StreamEntry {
  const obj = fieldsToObject(fields);
  if (obj.env === undefined) throw new Error(`stream entry ${id} in ${key} missing 'env' field`);
  const envelope = JSON.parse(obj.env as string) as EventEnvelope;
  if (obj.id !== undefined && obj.id !== envelope.id) {
    throw new Error(`stream entry ${id} in ${key}: id field/envelope id mismatch`);
  }
  const { logical, slot } = parseStreamKey(key, shardCount);
  return { key, logical, slot, entryId: id, envelope };
}

export class RedisStreamsBus {
  readonly redis: Redis;
  private readonly shardCount: number;
  private readonly streamMaxLen: number;
  private readonly logger: Logger | undefined;

  constructor(opts: BusOptions) {
    this.shardCount = opts.shardCount;
    this.streamMaxLen = opts.streamMaxLen;
    this.logger = opts.logger;
    this.redis = new Redis(opts.url, {
      // Bull-style hard defaults: fail fast, never queue writes offline — a transport
      // hiccup must surface as an error (the outbox still holds the truth).
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
  }

  async quit(): Promise<void> {
    await this.redis.quit();
  }

  /* ---------------- producer (relay) side ---------------- */

  async appendToStream(logicalStream: string, env: EventEnvelope): Promise<void> {
    const slot = shardSlotForAggregate(env.aggregateId, this.shardCount);
    const key = streamKey(logicalStream, slot, this.shardCount);
    await this.redis.xadd(
      key,
      'MAXLEN',
      '~',
      String(this.streamMaxLen),
      '*',
      'env',
      JSON.stringify(env),
      'id',
      env.id,
      'type',
      env.type,
    );
  }

  /* ---------------- group management ---------------- */

  /**
   * Creates the group on every physical shard (idempotent). `startIdForSlot`
   * re-bootstraps from PG consumer cursors when Redis state was lost.
   */
  async ensureConsumerGroup(
    logicalStream: string,
    group: string,
    startIdForSlot: (slot: number) => string = () => '0',
  ): Promise<void> {
    for (let slot = 0; slot < this.shardCount; slot++) {
      const key = streamKey(logicalStream, slot, this.shardCount);
      try {
        await this.redis.xgroup('CREATE', key, group, startIdForSlot(slot), 'MKSTREAM');
      } catch (err) {
        if (err instanceof Error && err.message.includes('BUSYGROUP')) continue;
        throw err;
      }
    }
  }

  /* ---------------- consumer side ---------------- */

  /** Blocking XREADGROUP for NEW entries ('>') across all shards. */
  async readGroup(
    logicalStream: string,
    group: string,
    consumer: string,
    opts: { count: number; blockMs: number },
  ): Promise<StreamEntry[]> {
    const keys = allStreamKeys(logicalStream, this.shardCount);
    const raw = (await this.redis.xreadgroup(
      'GROUP',
      group,
      consumer,
      'COUNT',
      String(opts.count),
      'BLOCK',
      String(opts.blockMs),
      'STREAMS',
      ...keys,
      ...keys.map(() => '>'),
    )) as RawXReadGroup;
    if (raw === null) return [];
    const out: StreamEntry[] = [];
    for (const [key, entries] of raw) {
      for (const [id, fields] of entries) out.push(parseEntry(key, this.shardCount, id, fields));
    }
    return out;
  }

  ack(logicalStream: string, group: string, composite: string): Promise<number> {
    const { slot, entryId } = parseCompositeEntryId(composite);
    return this.redis.xack(streamKey(logicalStream, slot, this.shardCount), group, entryId);
  }

  /** Pending entries of the whole group (optionally filtered by idle), across shards. */
  async pendingEntries(
    logicalStream: string,
    group: string,
    opts: { minIdleMs: number; count: number },
  ): Promise<PendingEntry[]> {
    const out: PendingEntry[] = [];
    for (let slot = 0; slot < this.shardCount; slot++) {
      const key = streamKey(logicalStream, slot, this.shardCount);
      // XPENDING key group IDLE min-idle - + count
      const raw = (await this.redis.call(
        'XPENDING',
        key,
        group,
        'IDLE',
        String(opts.minIdleMs),
        '-',
        '+',
        String(opts.count),
      )) as Array<[id: string, consumer: string, idleMs: number, deliveries: number]> | null;
      if (!raw) continue;
      for (const [id, consumer, idleMs, deliveries] of raw) {
        out.push({ slot, entryId: id, consumer, idleMs, deliveries });
      }
    }
    return out;
  }

  /** Steal one pending entry for this consumer (post-idle-maturation). */
  async claimEntry(
    logicalStream: string,
    group: string,
    consumer: string,
    entry: PendingEntry,
  ): Promise<void> {
    await this.redis.xclaim(
      streamKey(logicalStream, entry.slot, this.shardCount),
      group,
      consumer,
      String(entry.idleMs),
      entry.entryId,
    );
  }

  /** Fetches one entry by id (payload not present in XPENDING/XCLAIM replies). */
  async fetchEntry(logicalStream: string, slot: number, entryId: string): Promise<StreamEntry | null> {
    const key = streamKey(logicalStream, slot, this.shardCount);
    const raw = (await this.redis.xrange(key, entryId, entryId)) as Array<[string, string[]]> | null;
    if (!raw || raw.length === 0) return null;
    const first = raw[0];
    if (!first) return null;
    return parseEntry(key, this.shardCount, first[0], first[1]);
  }

  /** Composite handle "<slot>#<entryId>" used as the ack/cursor unit. */
  compositeOf(entry: StreamEntry): string {
    return compositeEntryId(entry.slot, entry.entryId);
  }

  /* ---------------- lag ---------------- */

  async groupLag(logicalStream: string, group: string): Promise<GroupLag> {
    let undelivered = 0;
    let pending = 0;
    for (let slot = 0; slot < this.shardCount; slot++) {
      const key = streamKey(logicalStream, slot, this.shardCount);
      const raw = (await this.redis.call('XINFO', 'GROUPS', key).catch((err: unknown) => {
        // ERR no such key — empty shard contributes zero
        if (err instanceof Error && /no such key/i.test(err.message)) return null;
        throw err;
      })) as unknown[] | null;
      if (raw === null) continue;
      // Reply shape: [groupA, groupB, ...] where each group is a flat k/v array
      // ['name', g, 'consumers', n, 'pending', n, 'last-delivered-id', id, 'lag', n].
      const groups = raw as Array<Array<string | number>>;
      for (const g of groups) {
        const kv = fieldsToObject(g.map(String));
        if (kv.name !== group) continue;
        pending += Number(kv.pending ?? 0);
        undelivered += Number(kv.lag ?? 0);
      }
    }
    return { undelivered, pending };
  }
}
