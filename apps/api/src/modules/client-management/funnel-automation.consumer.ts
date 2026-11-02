import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { FunnelRulesService } from './funnel-rules.service';

interface ContactEventPayload {
  organization_id: string;
  contact_id?: string | null;
}

interface MessageReceivedPayload extends ContactEventPayload {
  message?: { direction?: string };
}

interface AppointmentPayload extends ContactEventPayload {
  origin?: string;
}

/** Origins that represent a real booking (not a follow-up task on a follow_up calendar). */
const REAL_BOOKING_ORIGINS = new Set(['human', 'ai']);

/**
 * Drives automatic funnel movement off domain events. Silent: it only moves the
 * contact's stage, never sends anything to the customer (that stays n8n's job).
 */
@Controller()
export class FunnelAutomationConsumer {
  private readonly logger = new Logger(FunnelAutomationConsumer.name);

  constructor(private readonly rules: FunnelRulesService) {}

  private run(event: string, data: ContactEventPayload): Promise<void> | void {
    if (!data.contact_id) return;
    return this.rules.evaluate(data.organization_id, data.contact_id, event);
  }

  @EventPattern(RABBITMQ_QUEUES.MESSAGE_RECEIVED)
  async onMessageReceived(@Payload() data: MessageReceivedPayload): Promise<void> {
    // Only an inbound (customer) message advances the funnel, not our own replies.
    if (data.message?.direction !== 'inbound') return;
    await this.run('message.received', data);
  }

  @EventPattern(RABBITMQ_QUEUES.CONTACT_DATA_CAPTURED)
  async onDataCaptured(@Payload() data: ContactEventPayload): Promise<void> {
    await this.run('contact.data.captured', data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CREATED)
  async onAppointmentCreated(@Payload() data: AppointmentPayload): Promise<void> {
    // Follow-up tasks (origin automation/system on a follow_up calendar) also emit
    // this event — only a real booking should advance the funnel.
    if (!REAL_BOOKING_ORIGINS.has(data.origin ?? '')) return;
    await this.run('appointment.created', data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED)
  async onAppointmentConfirmed(@Payload() data: ContactEventPayload): Promise<void> {
    await this.run('appointment.confirmed', data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_COMPLETED)
  async onAppointmentCompleted(@Payload() data: ContactEventPayload): Promise<void> {
    await this.run('appointment.completed', data);
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_NO_SHOW)
  async onAppointmentNoShow(@Payload() data: ContactEventPayload): Promise<void> {
    await this.run('appointment.no_show', data);
  }

  @EventPattern(RABBITMQ_QUEUES.SEQUENCE_EXHAUSTED)
  async onSequenceExhausted(@Payload() data: ContactEventPayload): Promise<void> {
    await this.run('sequence.exhausted', data);
  }
}
