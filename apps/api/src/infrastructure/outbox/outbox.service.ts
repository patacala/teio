import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Cron, Interval } from '@nestjs/schedule';
import { EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { lastValueFrom } from 'rxjs';
import { RABBITMQ_SERVICE } from '../rabbitmq/rabbitmq.constants';
import { OutboxEventEntity } from './outbox-event.entity';

const BATCH_SIZE = 100;
/** A claimed row is invisible to other relays for this long (crash safety). */
const LEASE_SECONDS = 60;
const PUBLISH_TIMEOUT_MS = 10_000;

interface ClaimedEvent {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
  seq: string;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * Transactional outbox. Events are stored in the same transaction as the
 * change that caused them and published afterwards by a relay, so a broker
 * outage (or a crash right after commit) delays events instead of losing
 * them. Delivery is at-least-once: every payload carries `event_id` so
 * consumers can ignore repeats.
 *
 * Latency: `kick()` publishes right after the writing transaction commits;
 * the interval only picks up what a crash or an outage left behind. It suits
 * domain events (appointments, payments), not real-time traffic: chat and
 * in-app notifications go through RealtimeBroadcastService, never here.
 */
@Injectable()
export class OutboxService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private inFlight: Promise<number> | null = null;
  private kickTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repo: Repository<OutboxEventEntity>,
    @Inject(RABBITMQ_SERVICE) private readonly client: ClientProxy,
  ) {}

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.kickTimer) clearTimeout(this.kickTimer);
  }

  /** Stores an event inside the caller's transaction. Call `kick()` after commit. */
  async add(
    manager: EntityManager,
    topic: string,
    payload: Record<string, unknown>,
    organizationId?: string | null,
  ): Promise<string> {
    const id = randomUUID();
    await manager.getRepository(OutboxEventEntity).insert({
      id,
      topic,
      organization_id: organizationId ?? (payload.organization_id as string | undefined) ?? null,
      payload: { ...payload, event_id: id },
    });
    return id;
  }

  /** Stores an event outside any transaction and publishes it right away. */
  async publish(topic: string, payload: Record<string, unknown>, organizationId?: string | null): Promise<string> {
    const id = await this.add(this.repo.manager, topic, payload, organizationId);
    this.kick();
    return id;
  }

  /** Publishes pending events soon, without waiting for the next interval. */
  kick(): void {
    if (this.kickTimer || this.destroyed) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.relay();
    }, 25);
  }

  @Interval(5_000)
  async relay(): Promise<number> {
    if (this.destroyed) return 0;
    // One pass at a time per process; a caller arriving mid-pass waits for it
    // and then runs its own pass, so everything stored before the call is sent.
    while (this.inFlight) await this.inFlight.catch(() => undefined);
    this.inFlight = this.relayPass();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async relayPass(): Promise<number> {
    let published = 0;
    try {
      for (;;) {
        const batch = await this.claim();
        if (!batch.length) break;
        for (const event of batch) {
          if (await this.publishOne(event)) published++;
        }
        if (batch.length < BATCH_SIZE) break;
      }
    } catch (err) {
      this.logger.error(`Outbox relay failed: ${(err as Error).message}`);
    }
    return published;
  }

  /** Published events are kept a week for debugging; then removed. */
  @Cron('17 3 * * *')
  async cleanup(): Promise<void> {
    try {
      await this.repo.manager.query(
        `DELETE FROM core.outbox_events WHERE published_at < NOW() - INTERVAL '7 days'`,
      );
      await this.repo.manager.query(
        `DELETE FROM core.processed_events WHERE processed_at < NOW() - INTERVAL '30 days'`,
      );
    } catch (err) {
      this.logger.warn(`Outbox cleanup failed: ${(err as Error).message}`);
    }
  }

  private async claim(): Promise<ClaimedEvent[]> {
    const result: unknown = await this.repo.manager.query(
      `UPDATE core.outbox_events
          SET attempts = attempts + 1,
              available_at = NOW() + make_interval(secs => $2)
        WHERE id IN (
          SELECT id FROM core.outbox_events
           WHERE published_at IS NULL AND available_at <= NOW()
           ORDER BY seq
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
        RETURNING id, topic, payload, attempts, seq`,
      [BATCH_SIZE, LEASE_SECONDS],
    );
    // RETURNING has no order: publish in the order the events were written.
    return rowsOf<ClaimedEvent>(result).sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1));
  }

  private async publishOne(event: ClaimedEvent): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        lastValueFrom(this.client.emit(event.topic, event.payload), { defaultValue: undefined }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('publish timed out')), PUBLISH_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timer);
      await this.repo.manager.query(
        `UPDATE core.outbox_events SET published_at = NOW(), last_error = NULL WHERE id = $1`,
        [event.id],
      );
      return true;
    } catch (err) {
      clearTimeout(timer);
      const backoffSeconds = Math.min(2 ** Math.min(event.attempts, 10), 600);
      await this.repo.manager.query(
        `UPDATE core.outbox_events SET last_error = $2, available_at = NOW() + make_interval(secs => $3) WHERE id = $1`,
        [event.id, (err as Error).message.slice(0, 1000), backoffSeconds],
      );
      if (event.attempts >= 5) {
        this.logger.error(`Outbox event ${event.id} (${event.topic}) failed ${event.attempts} times: ${(err as Error).message}`);
      }
      return false;
    }
  }
}
