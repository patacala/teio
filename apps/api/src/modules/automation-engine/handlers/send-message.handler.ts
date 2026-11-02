import { Injectable, Logger, Optional } from '@nestjs/common';
import type { IActionHandler, ActionResult } from './action-handler.interface';
import { AppointmentEntity } from '../../scheduling/appointment.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { ConversationManagementService } from '../../conversation-management/conversation-management.service';
import { WebhookDispatcherService } from '../../integrations/webhook-dispatcher.service';
import { FollowUpContextBuilder } from './context-builder.service';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

@Injectable()
export class SendMessageHandler implements IActionHandler {
  readonly actionType = 'send_message';
  private readonly logger = new Logger(SendMessageHandler.name);

  constructor(
    private readonly conversationService: ConversationManagementService,
    private readonly contextBuilder: FollowUpContextBuilder,
    @Optional() private readonly webhookDispatcher?: WebhookDispatcherService,
  ) {}

  async execute(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult> {
    if (!resolved) {
      throw new Error(`No channel resolved for contact ${contact.id} — cannot send message`);
    }

    // If message_content exists, send directly
    if (appointment.message_content) {
      await this.sendDirect(appointment, contact, resolved, org);
      return { completed: true, channel: resolved.channel };
    }

    // If sequence appointment and there are webhook subscribers, dispatch to n8n
    if (appointment.sequence_id && this.webhookDispatcher) {
      const hasWebhook = await this.webhookDispatcher.hasSubscribers(
        'follow_up.due',
        appointment.organization_id,
      );

      if (hasWebhook) {
        // Same context shape every handler sends, so n8n branches on `action`
        const context = await this.contextBuilder.build(
          appointment,
          contact,
          'send_message',
          resolved.channel,
        );

        try {
          await this.webhookDispatcher.dispatch(
            'follow_up.due',
            appointment.organization_id,
            context as unknown as Record<string, unknown>,
          );
          this.logger.log(
            `Dispatched follow_up.due webhook for appointment ${appointment.id} — awaiting completion via tool`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to dispatch follow_up.due webhook for appointment ${appointment.id}: ${err}`,
          );
          throw err;
        }
        // Appointment stays in 'processing', n8n calls complete_follow_up tool
        return { completed: false, channel: resolved.channel, executedAction: 'send_message' };
      }

      // No webhook subscribers — fall through to send generic message directly
      this.logger.log(
        `No follow_up.due webhook subscribers for org ${appointment.organization_id} — sending generic message`,
      );
    }

    // Fallback: send generic message
    await this.sendDirect(appointment, contact, resolved, org);
    return { completed: true, channel: resolved.channel };
  }

  private async sendDirect(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    resolved: ResolvedChannel,
    org: OrganizationEntity,
  ): Promise<void> {
    const content = appointment.message_content
      ?? `Hola ${contact.first_name}, te contactamos para dar seguimiento. ¿Hay algo en lo que podamos ayudarte? - ${org.name}`;

    const { conversation } = await this.conversationService.findOrCreateActiveConversation(
      appointment.organization_id,
      contact.id,
      '',
      resolved.channel,
    );

    await this.conversationService.sendMessage(conversation.id, appointment.organization_id, {
      content,
      direction: 'outbound',
      metadata: { follow_up: true, appointment_id: appointment.id },
    });

    this.logger.log(`Sent follow-up message via ${resolved.channel} for appointment ${appointment.id}`);
  }
}
