import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AnalyticsService } from '../analytics/analytics.service';

interface MessagePayload {
  organization_id: string;
  conversation_id: string;
  message_id?: string;
  contact_id?: string;
  channel?: string;
}

interface ConversationAssignPayload {
  organization_id: string;
  conversation_id: string;
  bot_active?: boolean;
}

@Controller()
export class ConversationEventConsumer {
  private readonly logger = new Logger(ConversationEventConsumer.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @EventPattern(RABBITMQ_QUEUES.MESSAGE_RECEIVED)
  async handleMessageReceived(@Payload() data: MessagePayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'message.received',
        resource_id: data.conversation_id,
        resource_type: 'conversation',
        properties: {
          message_id: data.message_id,
          contact_id: data.contact_id,
          channel: data.channel,
        },
      });
      this.logger.debug(`Tracked message.received for conv ${data.conversation_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle message.received: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.MESSAGE_SEND)
  async handleMessageSend(@Payload() data: MessagePayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'message.send',
        resource_id: data.conversation_id,
        resource_type: 'conversation',
        properties: {
          message_id: data.message_id,
        },
      });
      this.logger.debug(`Tracked message.send for conv ${data.conversation_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle message.send: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.CONVERSATION_ASSIGN)
  async handleConversationAssign(@Payload() data: ConversationAssignPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'conversation.assign',
        resource_id: data.conversation_id,
        resource_type: 'conversation',
        properties: {
          bot_active: data.bot_active,
        },
      });
      this.logger.debug(`Tracked conversation.assign for conv ${data.conversation_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle conversation.assign: ${(err as Error).message}`);
    }
  }
}
