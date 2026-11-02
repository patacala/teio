import { Injectable, Logger } from '@nestjs/common';
import type { IActionHandler, ActionResult } from './action-handler.interface';
import { AppointmentEntity } from '../../scheduling/appointment.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { ConversationManagementService } from '../../conversation-management/conversation-management.service';
import { ProsalesClientService } from '../../ai-agents/prosales-client.service';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

/**
 * Places the follow-up call through ProSales (CRM -> ProSales -> Retell), which
 * drives the actual Retell call. We never dial directly — completion comes back
 * through the `complete_follow_up` tool or the CALL_COMPLETED event. If the org
 * has no usable voice channel, we degrade to a message so the touch isn't lost.
 */
@Injectable()
export class CallHandler implements IActionHandler {
  readonly actionType = 'call';
  private readonly logger = new Logger(CallHandler.name);

  constructor(
    private readonly conversationService: ConversationManagementService,
    private readonly prosales: ProsalesClientService,
  ) {}

  async execute(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult> {
    if (!contact.phone) {
      this.logger.warn(
        `Contact ${contact.id} has no phone — degrading call to message for appointment ${appointment.id}`,
      );
      return this.degradeToMessage(appointment, contact, resolved, org);
    }

    try {
      await this.prosales.startOutboundCall(appointment.organization_id, contact.phone);
    } catch (err) {
      // No usable voice channel / Retell config → don't lose the touch.
      this.logger.warn(
        `Outbound call via ProSales failed for appointment ${appointment.id} (${(err as Error).message}) — degrading to message`,
      );
      return this.degradeToMessage(appointment, contact, resolved, org);
    }

    this.logger.log(
      `Started outbound call via ProSales for appointment ${appointment.id} — awaiting call completion`,
    );
    // Stays in 'processing'; CALL_COMPLETED (or complete_follow_up) closes it.
    return { completed: false, channel: resolved?.channel ?? 'voice', executedAction: 'call' };
  }

  private async degradeToMessage(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult> {
    if (!resolved) {
      throw new Error(
        `No channel resolved for contact ${contact.id} — cannot degrade call to message`,
      );
    }

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
      metadata: { follow_up: true, appointment_id: appointment.id, degraded_from: 'call' },
    });

    return { completed: true, channel: resolved.channel, executedAction: 'send_message' };
  }
}
