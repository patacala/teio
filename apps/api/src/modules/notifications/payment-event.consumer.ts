import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { ProsalesClientService } from '../ai-agents/prosales-client.service';

interface PaymentPayload {
  organization_id: string;
  payment_id: string;
  contact_id?: string;
  conversation_id?: string | null;
  amount?: number;
  currency?: string;
  appointment_id?: string | null;
  appointment_confirmed?: boolean;
}

@Controller()
export class PaymentEventConsumer {
  private readonly logger = new Logger(PaymentEventConsumer.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prosales: ProsalesClientService,
  ) {}

  @EventPattern(RABBITMQ_QUEUES.PAYMENT_COMPLETED)
  async handlePaymentCompleted(@Payload() data: PaymentPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'payment.received',
        resource_id: data.payment_id,
        resource_type: 'payment',
        properties: {
          contact_id: data.contact_id,
          conversation_id: data.conversation_id,
          amount: data.amount,
          currency: data.currency,
          appointment_id: data.appointment_id,
          appointment_confirmed: data.appointment_confirmed,
        },
      });
      this.logger.debug(`Tracked payment.received for payment ${data.payment_id}`);

      // Verified-outcome learning loop: a completed payment is unambiguous
      // ground truth. Push it to ProSales so the conversation's moves are
      // re-scored. Non-fatal — must never break analytics/ack.
      if (data.conversation_id) {
        try {
          await this.prosales.reportOutcome(
            data.organization_id,
            data.conversation_id,
            data.appointment_confirmed ? 'scheduled' : 'converted',
          );
        } catch (err) {
          this.logger.warn(
            `Failed to report outcome to ProSales for payment ${data.payment_id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to handle payment.completed: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.PAYMENT_EXPIRED)
  async handlePaymentExpired(@Payload() data: PaymentPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'payment.expired',
        resource_id: data.payment_id,
        resource_type: 'payment',
        properties: {
          contact_id: data.contact_id,
          conversation_id: data.conversation_id,
          amount: data.amount,
          currency: data.currency,
          appointment_id: data.appointment_id,
        },
      });
      this.logger.debug(`Tracked payment.expired for payment ${data.payment_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle payment.expired: ${(err as Error).message}`);
    }
  }
}
