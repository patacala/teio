import { Injectable, Logger } from '@nestjs/common';
import type { IActionHandler, ActionResult } from './action-handler.interface';
import { ScheduledActionEntity } from '../scheduled-action.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { ConversationManagementService } from '../../conversation-management/conversation-management.service';
import { MailService } from '../../../infrastructure/mail/mail.service';
import { emailFromTemplate } from '../../../infrastructure/messaging';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';
import { followUpText } from './follow-up-text';

/**
 * An agenda follow-up "send a message": the step's text (or the default
 * follow-up text) on the channel the strategy resolved. Email is sent as an
 * email — a conversation on the email channel is never dispatched.
 */
@Injectable()
export class SendMessageHandler implements IActionHandler {
  readonly actionType = 'send_message';
  private readonly logger = new Logger(SendMessageHandler.name);

  constructor(
    private readonly conversationService: ConversationManagementService,
    private readonly mailService: MailService,
  ) {}

  async execute(
    appointment: ScheduledActionEntity,
    contact: ContactEntity,
    resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult> {
    if (!resolved) {
      throw new Error(`No channel resolved for contact ${contact.id} — cannot send message`);
    }
    const content = followUpText(appointment, contact, org);

    if (resolved.channel === 'email') {
      await this.mailService.send({
        to: resolved.recipientId,
        ...emailFromTemplate('follow_up', { subject: appointment.title ?? 'Follow-up', message: content, organization_name: org.name }),
      });
      this.logger.log(`Sent follow-up email for step ${appointment.id}`);
      return { completed: true, channel: 'email' };
    }

    const { conversation } = await this.conversationService.findOrCreateActiveConversation(
      appointment.organization_id,
      contact.id,
      '',
      resolved.channel,
    );

    await this.conversationService.sendMessage(conversation.id, appointment.organization_id, {
      content,
      direction: 'outbound',
      sender_type: 'automation',
      metadata: { follow_up: true, appointment_id: appointment.id },
    });

    this.logger.log(`Sent follow-up message via ${resolved.channel} for step ${appointment.id}`);
    return { completed: true, channel: resolved.channel };
  }
}
