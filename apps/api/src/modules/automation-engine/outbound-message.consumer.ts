import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AutomationSequenceService } from './automation-sequence.service';
import { AutomatedAppointmentService } from './automated-appointment.service';
import { ClientManagementService } from '../client-management/client-management.service';
import { ChannelType } from '@crm/shared';
import type { CallCompletedEvent } from '@crm/shared';

const CHAT_CHANNELS = new Set<string>([
  ChannelType.WHATSAPP, ChannelType.SMS, ChannelType.WEBCHAT, ChannelType.FACEBOOK, ChannelType.INSTAGRAM,
]);

interface MessageSendPayload {
  organization_id: string;
  conversation_id: string;
  message_id: string;
  contact_id: string;
  direction: string;
  channel: string;
}

@Controller()
export class OutboundMessageConsumer {
  private readonly logger = new Logger(OutboundMessageConsumer.name);

  constructor(
    private readonly sequenceService: AutomationSequenceService,
    private readonly appointmentService: AutomatedAppointmentService,
    private readonly clientService: ClientManagementService,
  ) {}

  @EventPattern(RABBITMQ_QUEUES.MESSAGE_SEND)
  async handleMessageSend(@Payload() data: MessageSendPayload): Promise<void> {
    if (data.direction !== 'outbound' || !data.contact_id) return;

    // 1. Auto-complete processing follow-up for this contact's active sequence
    await this.tryCompleteFollowUp(data);

    // 2. Auto-create follow-up sequence if none exists (chat channels only)
    if (CHAT_CHANNELS.has(data.channel)) {
      await this.tryCreateSequence(data);
    }
  }

  /**
   * A finished call completes the follow-up step that requested it.
   *
   * The voice module emits CALL_COMPLETED for *every* call — inbound, manual,
   * agent-initiated — so this must only act when the pending step actually
   * asked for a call. Without that guard, any unrelated call to a contact with
   * an active sequence would advance it spuriously.
   */
  @EventPattern(RABBITMQ_QUEUES.CALL_COMPLETED)
  async handleCallCompleted(@Payload() data: CallCompletedEvent): Promise<void> {
    if (!data?.contact_id || !data?.organization_id) return;

    try {
      // Keyed on the contact and on action='call', so an unrelated inbound call
      // to a contact whose pending step is a message still cannot advance it.
      const appt = await this.appointmentService.findProcessingByContactAndAction(
        data.organization_id,
        data.contact_id,
        'call',
      );
      if (!appt) return;

      await this.appointmentService.markCompleted(data.organization_id, appt.id, 'voice');

      if (appt.sequence_id) {
        const seq = await this.sequenceService.findActive(data.organization_id, data.contact_id);
        if (seq?.id === appt.sequence_id) {
          await this.sequenceService.advanceOrComplete(data.organization_id, seq.id);
        }
      }

      this.logger.log(
        `Call completed follow-up appointment ${appt.id} (sequence ${appt.sequence_id ?? 'none'}) for contact ${data.contact_id}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to complete call follow-up for contact ${data.contact_id}: ${(err as Error).message}`,
      );
    }
  }

  private async tryCompleteFollowUp(data: MessageSendPayload): Promise<void> {
    try {
      const active = await this.sequenceService.findActive(data.organization_id, data.contact_id);
      if (!active) return;

      const appt = await this.appointmentService.findProcessingBySequence(data.organization_id, active.id);
      if (!appt) return;

      await this.appointmentService.markCompleted(data.organization_id, appt.id);
      await this.sequenceService.advanceOrComplete(data.organization_id, active.id);

      this.logger.log(
        `Auto-completed follow-up appointment ${appt.id} and advanced sequence ${active.id} for contact ${data.contact_id}`,
      );
    } catch (err) {
      this.logger.warn(`Failed to auto-complete follow-up for contact ${data.contact_id}: ${(err as Error).message}`);
    }
  }

  private async tryCreateSequence(data: MessageSendPayload): Promise<void> {
    try {
      // Skip if contact has opt-out tag
      const contact = await this.clientService.findById(data.contact_id, data.organization_id);
      const tags: string[] = (contact.tags as string[]) ?? [];
      if (tags.includes('opt-out')) return;

      const active = await this.sequenceService.findActive(data.organization_id, data.contact_id);
      if (active) return;

      await this.sequenceService.create(data.organization_id, {
        contact_id: data.contact_id,
        conversation_id: data.conversation_id,
        sequence_type: 'no_response',
        source: 'auto',
      });

      this.logger.log(`Auto-created follow-up sequence for contact ${data.contact_id}`);
    } catch {
      // ConflictException if race condition — safe to ignore
    }
  }
}
