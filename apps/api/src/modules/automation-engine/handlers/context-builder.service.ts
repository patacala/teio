import { Injectable, Optional } from '@nestjs/common';
import { AppointmentEntity } from '../../scheduling/appointment.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { ConversationManagementService } from '../../conversation-management/conversation-management.service';
import { PaymentServiceService } from '../../payments/payment-service.service';
import { PaymentSettingsService } from '../../payments/payment-settings.service';

const RECENT_MESSAGES_LIMIT = 30;
const DEFAULT_MAX_FOLLOW_UPS = 7;

/**
 * Payload delivered to n8n on the `follow_up.due` webhook.
 *
 * Every channel — message, call, email — receives the exact same shape, so an
 * n8n workflow branches on `action` rather than on which handler fired.
 */
export interface FollowUpContext {
  appointment_id: string;
  contact_id: string;
  conversation_id: string | null;
  action: string;
  channel: string;
  sequence_type: string;
  follow_up_number: number;
  total_follow_ups: number;
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    tags: string[];
  };
  recent_messages: unknown[];
  payment_services: Array<{
    id: string;
    name: string;
    description: string | null;
    amount: number;
    currency: string;
  }>;
  payment_currency: string;
  payment_pending: boolean;
}

/**
 * Builds the follow-up context shared by SendMessageHandler and CallHandler.
 *
 * Extracted because both need the same two non-trivial lookups: the recent
 * message history and the conversation to attach to.
 */
@Injectable()
export class FollowUpContextBuilder {
  constructor(
    private readonly conversationService: ConversationManagementService,
    @Optional() private readonly paymentServiceService?: PaymentServiceService,
    @Optional() private readonly paymentSettingsService?: PaymentSettingsService,
  ) {}

  async build(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    action: string,
    channel: string,
  ): Promise<FollowUpContext> {
    // Last N messages across every conversation this contact has
    const recentMessages = await this.conversationService.getRecentMessagesForContact(
      appointment.organization_id,
      contact.id,
      RECENT_MESSAGES_LIMIT,
    );
    // Query returns DESC — n8n expects chronological
    recentMessages.reverse();

    // Prefer the appointment's conversation, else the contact's latest
    let conversationId = appointment.conversation_id ?? null;
    if (!conversationId) {
      const convos = await this.conversationService.findByContactId(
        appointment.organization_id,
        contact.id,
      );
      conversationId = convos[0]?.id ?? null;
    }

    const metadata = appointment.metadata as Record<string, unknown>;

    let paymentCurrency = 'usd';
    let paymentServices: FollowUpContext['payment_services'] = [];
    try {
      if (this.paymentSettingsService) {
        const settings = await this.paymentSettingsService.getRaw(appointment.organization_id);
        paymentCurrency = settings.currency ?? 'usd';
      }
      if (this.paymentServiceService) {
        const services = await this.paymentServiceService.findAll(appointment.organization_id, true);
        paymentServices = services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          amount: s.amount,
          currency: paymentCurrency,
        }));
      }
    } catch {
      // Non-critical — follow-ups still run without the payment catalog
    }

    return {
      appointment_id: appointment.id,
      contact_id: contact.id,
      conversation_id: conversationId,
      action,
      channel,
      sequence_type: (metadata?.sequence_type as string) ?? 'no_response',
      follow_up_number: (metadata?.attempt as number) ?? 1,
      total_follow_ups: (metadata?.total_follow_ups as number) ?? DEFAULT_MAX_FOLLOW_UPS,
      contact: {
        id: contact.id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        tags: contact.tags,
      },
      recent_messages: recentMessages,
      payment_services: paymentServices,
      payment_currency: paymentCurrency,
      payment_pending: appointment.status === 'pending' && !appointment.action,
    };
  }
}
