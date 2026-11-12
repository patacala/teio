import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WebhookEventType } from '@crm/shared';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { ProcessedEventsService } from '../../infrastructure/outbox/processed-events.service';
import { WebhookDispatcherService } from '../integrations/webhook-dispatcher.service';

type AppointmentEvent = Record<string, unknown> & { organization_id: string; event_id?: string };

const CONSUMER = 'appointment-webhooks';

/**
 * Forwards appointment events to the organization's outbound webhooks. Fed
 * from the outbox, so a webhook subscriber hears about every change even if
 * the broker was down when it happened. Status changes also send
 * `appointment.updated`, which is what subscribers received before.
 */
@Controller()
export class AppointmentWebhookRelay {
  private readonly logger = new Logger(AppointmentWebhookRelay.name);

  constructor(
    private readonly dispatcher: WebhookDispatcherService,
    private readonly processed: ProcessedEventsService,
  ) {}

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CREATED)
  created(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_CREATED], data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED)
  confirmed(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_CONFIRMED, WebhookEventType.APPOINTMENT_UPDATED], data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED)
  rescheduled(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_RESCHEDULED, WebhookEventType.APPOINTMENT_UPDATED], data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CANCELLED)
  cancelled(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_CANCELLED, WebhookEventType.APPOINTMENT_UPDATED], data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_COMPLETED)
  completed(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_COMPLETED, WebhookEventType.APPOINTMENT_UPDATED], data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_NO_SHOW)
  noShow(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_NO_SHOW, WebhookEventType.APPOINTMENT_UPDATED], data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_HOLD_RELEASED)
  holdReleased(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_HOLD_RELEASED], data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_UPDATED)
  updated(@Payload() data: AppointmentEvent) {
    return this.forward([WebhookEventType.APPOINTMENT_UPDATED], data);
  }

  private async forward(events: string[], data: AppointmentEvent): Promise<void> {
    if (!(await this.processed.claim(CONSUMER, data.event_id))) return;
    const { event_id: _eventId, ...body } = data;
    try {
      for (const event of events) await this.dispatcher.dispatch(event, data.organization_id, body);
    } catch (err) {
      // Let a redelivery try again.
      await this.processed.release(CONSUMER, data.event_id);
      this.logger.warn(`Webhook relay failed for ${events[0]}: ${(err as Error).message}`);
      throw err;
    }
  }
}
