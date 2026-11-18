import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES as Q } from '../../../../infrastructure/rabbitmq/rabbitmq.constants';
import { ProcessedEventsService } from '../../../../infrastructure/outbox/processed-events.service';
import { EnrollmentService } from './enrollment.service';
import { normalizeEvent } from './trigger-events';

type Payload = Record<string, unknown>;

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

/**
 * Every event an automation can react to. Each is handled once (event ids
 * are deduplicated); a failure after retries goes to the dead-letter queue
 * rather than being dropped, since it may be a message the AI must answer.
 */
@Controller()
export class AutomationEventConsumer {
  private readonly logger = new Logger(AutomationEventConsumer.name);

  constructor(
    private readonly enrollment: EnrollmentService,
    private readonly processed: ProcessedEventsService,
  ) {}

  async handle(topic: string, payload: Payload): Promise<void> {
    const events = normalizeEvent(topic, payload ?? {});
    if (!events.length) return;
    const consumer = `automations:${topic}`;
    if (!(await this.processed.claim(consumer, payload.event_id))) return;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        for (const event of events) await this.enrollment.handleEvent(event);
        return;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`Automations could not handle ${topic} (attempt ${attempt}/${ATTEMPTS}): ${lastError.message}`);
        if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
    await this.processed.release(consumer, payload.event_id).catch(() => undefined);
    throw lastError;
  }

  @EventPattern(Q.MESSAGE_RECEIVED) onMessageReceived(@Payload() p: Payload) { return this.handle(Q.MESSAGE_RECEIVED, p); }
  @EventPattern(Q.MESSAGE_SEND) onMessageSent(@Payload() p: Payload) { return this.handle(Q.MESSAGE_SEND, p); }
  @EventPattern(Q.CONVERSATION_OPENED) onConversationOpened(@Payload() p: Payload) { return this.handle(Q.CONVERSATION_OPENED, p); }
  @EventPattern(Q.CONVERSATION_CLOSED) onConversationClosed(@Payload() p: Payload) { return this.handle(Q.CONVERSATION_CLOSED, p); }
  @EventPattern(Q.CONTACT_CREATED) onContactCreated(@Payload() p: Payload) { return this.handle(Q.CONTACT_CREATED, p); }
  @EventPattern(Q.CONTACT_TAG_ADDED) onTagAdded(@Payload() p: Payload) { return this.handle(Q.CONTACT_TAG_ADDED, p); }
  @EventPattern(Q.CONTACT_TAG_REMOVED) onTagRemoved(@Payload() p: Payload) { return this.handle(Q.CONTACT_TAG_REMOVED, p); }
  @EventPattern(Q.CONTACT_STAGE_CHANGED) onStageChanged(@Payload() p: Payload) { return this.handle(Q.CONTACT_STAGE_CHANGED, p); }
  @EventPattern(Q.APPOINTMENT_CREATED) onAppointmentCreated(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_CREATED, p); }
  @EventPattern(Q.APPOINTMENT_CONFIRMED) onAppointmentConfirmed(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_CONFIRMED, p); }
  @EventPattern(Q.APPOINTMENT_RESCHEDULED) onAppointmentRescheduled(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_RESCHEDULED, p); }
  @EventPattern(Q.APPOINTMENT_CANCELLED) onAppointmentCancelled(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_CANCELLED, p); }
  @EventPattern(Q.APPOINTMENT_COMPLETED) onAppointmentCompleted(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_COMPLETED, p); }
  @EventPattern(Q.APPOINTMENT_NO_SHOW) onAppointmentNoShow(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_NO_SHOW, p); }
  @EventPattern(Q.APPOINTMENT_CONFIRMATION_REQUESTED) onConfirmationRequested(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_CONFIRMATION_REQUESTED, p); }
  @EventPattern(Q.APPOINTMENT_REMINDER_DUE) onReminderDue(@Payload() p: Payload) { return this.handle(Q.APPOINTMENT_REMINDER_DUE, p); }
  @EventPattern(Q.PAYMENT_COMPLETED) onPaymentCompleted(@Payload() p: Payload) { return this.handle(Q.PAYMENT_COMPLETED, p); }
  @EventPattern(Q.PAYMENT_EXPIRED) onPaymentExpired(@Payload() p: Payload) { return this.handle(Q.PAYMENT_EXPIRED, p); }
  @EventPattern(Q.CALL_COMPLETED) onCallCompleted(@Payload() p: Payload) { return this.handle(Q.CALL_COMPLETED, p); }
}
