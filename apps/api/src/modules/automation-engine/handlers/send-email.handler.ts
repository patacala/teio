import { Injectable, Logger } from '@nestjs/common';
import { CommunicationEventType } from '@crm/shared';
import type { IActionHandler, ActionResult } from './action-handler.interface';
import { AppointmentEntity } from '../../scheduling/appointment.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { CommunicationDispatchService } from '../../communications/communication-dispatch.service';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

@Injectable()
export class SendEmailHandler implements IActionHandler {
  readonly actionType = 'send_email';
  private readonly logger = new Logger(SendEmailHandler.name);

  constructor(
    private readonly dispatchService: CommunicationDispatchService,
  ) {}

  async execute(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    _resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult> {
    const email = contact.email;
    if (!email) {
      throw new Error(`Contact ${contact.id} has no email address`);
    }

    const variables: Record<string, string> = {
      contact_name: `${contact.first_name} ${contact.last_name ?? ''}`.trim(),
      organization_name: org.name,
      message: appointment.message_content ?? '',
    };

    const result = await this.dispatchService.dispatch({
      organizationId: appointment.organization_id,
      eventType: CommunicationEventType.APPOINTMENT_REMINDER,
      channelType: 'email',
      recipient: email,
      variables,
      subject: appointment.title ?? 'Follow-up',
    });

    if (!result.dispatched) {
      throw new Error(result.error ?? 'Email dispatch failed');
    }

    this.logger.log(`Sent follow-up email to ${email} for appointment ${appointment.id}`);
    return { completed: true, channel: 'email' };
  }
}
