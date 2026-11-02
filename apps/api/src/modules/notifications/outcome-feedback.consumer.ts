import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { ProsalesClientService } from '../ai-agents/prosales-client.service';

interface AppointmentConfirmedPayload {
  organization_id: string;
  appointment_id: string;
  contact_id?: string;
  conversation_id?: string | null;
}

/**
 * Verified-outcome learning loop (Phase 2): a confirmed appointment is
 * unambiguous ground truth, independent of any payment. Push it to ProSales so
 * the originating conversation's moves get re-scored.
 *
 * Phase 1 covers the payment path (payment.completed). This covers appointments
 * confirmed WITHOUT a payment. When a payment DOES confirm an appointment both
 * events fire and report the same 'scheduled' outcome for the same conversation;
 * ProSales is idempotent-ish, so the redundant push is harmless.
 */
@Controller()
export class OutcomeFeedbackConsumer {
  private readonly logger = new Logger(OutcomeFeedbackConsumer.name);

  constructor(private readonly prosales: ProsalesClientService) {}

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED)
  async handleAppointmentConfirmed(@Payload() data: AppointmentConfirmedPayload): Promise<void> {
    // Only conversation-linked appointments carry a learning signal. Manually
    // created CRM appointments have no conversation and are skipped.
    if (!data.conversation_id) return;

    try {
      await this.prosales.reportOutcome(data.organization_id, data.conversation_id, 'scheduled');
      this.logger.debug(
        `Reported 'scheduled' outcome to ProSales for conversation ${data.conversation_id} ` +
          `(appointment ${data.appointment_id})`,
      );
    } catch (err) {
      // Non-fatal: the learning loop must never break the event ack.
      this.logger.warn(
        `Failed to report outcome to ProSales for appointment ${data.appointment_id}: ${(err as Error).message}`,
      );
    }
  }
}
