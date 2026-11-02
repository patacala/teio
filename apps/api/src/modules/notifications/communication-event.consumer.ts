import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AnalyticsService } from '../analytics/analytics.service';

interface OrgPayload {
  organization_id: string;
  [key: string]: unknown;
}

/**
 * Handles contact, conversation, and voice events.
 * These are operational events — tracked in analytics only.
 * Admins see them in realtime/dashboard, no email/SMS dispatch needed.
 */
@Controller()
export class CommunicationEventConsumer {
  private readonly logger = new Logger(CommunicationEventConsumer.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @EventPattern(RABBITMQ_QUEUES.CONTACT_CREATED)
  async handleContactCreated(@Payload() data: OrgPayload): Promise<void> {
    await this.track(data, 'contact.created', 'contact', data.contact_id as string);
  }

  @EventPattern(RABBITMQ_QUEUES.CONTACT_UPDATED)
  async handleContactUpdated(@Payload() data: OrgPayload): Promise<void> {
    await this.track(data, 'contact.updated', 'contact', data.contact_id as string);
  }

  @EventPattern(RABBITMQ_QUEUES.CONTACT_STAGE_CHANGED)
  async handleContactStageChanged(@Payload() data: OrgPayload): Promise<void> {
    await this.track(data, 'contact.stage.changed', 'contact', data.contact_id as string, {
      from_stage: data.from_stage_id,
      to_stage: data.to_stage_id,
    });
  }

  @EventPattern(RABBITMQ_QUEUES.CONVERSATION_CLOSED)
  async handleConversationClosed(@Payload() data: OrgPayload): Promise<void> {
    await this.track(data, 'conversation.closed', 'conversation', data.conversation_id as string);
  }

  private async track(
    data: OrgPayload,
    eventType: string,
    resourceType: string,
    resourceId?: string,
    extraProps?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: eventType,
        resource_id: resourceId,
        resource_type: resourceType,
        properties: extraProps,
      });
      this.logger.debug(`Tracked ${eventType} for org ${data.organization_id}`);
    } catch (err) {
      this.logger.warn(`Failed to track ${eventType}: ${(err as Error).message}`);
    }
  }
}
