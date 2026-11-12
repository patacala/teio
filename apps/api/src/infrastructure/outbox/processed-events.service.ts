import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consumer-side idempotency: `claim` returns false when this consumer already
 * handled the event, so a redelivered event never messages a contact twice.
 */
@Injectable()
export class ProcessedEventsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async claim(consumer: string, eventId: unknown): Promise<boolean> {
    // Events published before the outbox have no id: nothing to deduplicate on.
    if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) return true;
    const result: unknown = await this.dataSource.query(
      `INSERT INTO core.processed_events (consumer, event_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING event_id`,
      [consumer, eventId],
    );
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    return Array.isArray(rows) && rows.length > 0;
  }

  /** Lets a failed attempt be retried. */
  async release(consumer: string, eventId: unknown): Promise<void> {
    if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) return;
    await this.dataSource.query(`DELETE FROM core.processed_events WHERE consumer = $1 AND event_id = $2`, [
      consumer,
      eventId,
    ]);
  }
}
