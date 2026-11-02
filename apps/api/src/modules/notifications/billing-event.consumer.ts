import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { CommunicationDispatchService } from '../communications/communication-dispatch.service';
import { UserEntity } from '../users/user.entity';
import { CommunicationEventType } from '@crm/shared';

interface SubscriptionPayload {
  organization_id: string;
  subscription_id: string;
  plan_id?: string;
  plan_name?: string;
  status?: string;
}

interface InvoicePayload {
  organization_id: string;
  invoice_id: string;
  amount?: number;
  currency?: string;
  status?: string;
}

@Controller()
export class BillingEventConsumer {
  private readonly logger = new Logger(BillingEventConsumer.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly dispatchService: CommunicationDispatchService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  @EventPattern(RABBITMQ_QUEUES.SUBSCRIPTION_UPDATED)
  async handleSubscriptionUpdated(@Payload() data: SubscriptionPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'subscription.updated',
        resource_id: data.subscription_id,
        resource_type: 'subscription',
        properties: { plan_id: data.plan_id, plan_name: data.plan_name, status: data.status },
      });
      await this.dispatchToAdmins(data.organization_id, CommunicationEventType.SUBSCRIPTION_UPDATED, {
        plan_name: data.plan_name ?? '',
        status: data.status ?? '',
      });
    } catch (err) {
      this.logger.warn(`Failed to handle subscription.updated: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.SUBSCRIPTION_CANCELED)
  async handleSubscriptionCanceled(@Payload() data: SubscriptionPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'subscription.canceled',
        resource_id: data.subscription_id,
        resource_type: 'subscription',
        properties: { plan_id: data.plan_id, plan_name: data.plan_name },
      });
      await this.dispatchToAdmins(data.organization_id, CommunicationEventType.SUBSCRIPTION_CANCELLED, {
        plan_name: data.plan_name ?? '',
      });
    } catch (err) {
      this.logger.warn(`Failed to handle subscription.canceled: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.INVOICE_PAID)
  async handleInvoicePaid(@Payload() data: InvoicePayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'invoice.paid',
        resource_id: data.invoice_id,
        resource_type: 'invoice',
        properties: { amount: data.amount, currency: data.currency },
      });
      await this.dispatchToAdmins(data.organization_id, CommunicationEventType.INVOICE_PAID, {
        amount: String(data.amount ?? 0),
        currency: data.currency ?? 'USD',
      });
    } catch (err) {
      this.logger.warn(`Failed to handle invoice.paid: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.INVOICE_PAYMENT_FAILED)
  async handleInvoicePaymentFailed(@Payload() data: InvoicePayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'invoice.payment.failed',
        resource_id: data.invoice_id,
        resource_type: 'invoice',
        properties: { amount: data.amount, currency: data.currency, status: data.status },
      });
      await this.dispatchToAdmins(data.organization_id, CommunicationEventType.INVOICE_PAYMENT_FAILED, {
        amount: String(data.amount ?? 0),
        currency: data.currency ?? 'USD',
      });
    } catch (err) {
      this.logger.warn(`Failed to handle invoice.payment.failed: ${(err as Error).message}`);
    }
  }

  private async dispatchToAdmins(
    organizationId: string,
    eventType: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const admins = await this.userRepo.find({
      where: { organization_id: organizationId, role: 'admin' },
      select: ['id', 'email', 'full_name'],
    });

    for (const admin of admins) {
      if (!admin.email) continue;
      const vars = { admin_name: admin.full_name ?? '', ...variables };

      await this.dispatchService.dispatch({
        organizationId,
        eventType,
        channelType: 'email',
        recipient: admin.email,
        variables: vars,
      });
    }
  }
}
