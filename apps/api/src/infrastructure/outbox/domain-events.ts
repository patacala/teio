import type { ClientProxy } from '@nestjs/microservices';
import type { OutboxService } from './outbox.service';

/**
 * Publishes a domain event that other modules react to (automation triggers,
 * funnel rules, analytics).
 *
 * Goes through the outbox so the event survives a broker outage and carries
 * an `event_id` consumers deduplicate on. The insert is awaited: if it fails,
 * the action that caused the event fails too, instead of silently losing the
 * event. The plain emit is only used where no outbox is wired (unit tests that
 * build services by hand).
 */
export async function publishDomainEvent(
  outbox: OutboxService | undefined,
  rmqClient: ClientProxy | undefined,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (outbox) {
    await outbox.publish(topic, data);
    return;
  }
  rmqClient?.emit(topic, data);
}
