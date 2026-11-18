import { Injectable, Logger } from '@nestjs/common';
import type { IActionHandler, ActionResult } from './action-handler.interface';
import { ScheduledActionEntity } from '../scheduled-action.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { MailService } from '../../../infrastructure/mail/mail.service';
import { emailFromTemplate } from '../../../infrastructure/messaging';
import { followUpText } from './follow-up-text';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

@Injectable()
export class SendEmailHandler implements IActionHandler {
  readonly actionType = 'send_email';
  private readonly logger = new Logger(SendEmailHandler.name);

  constructor(private readonly mailService: MailService) {}

  async execute(
    appointment: ScheduledActionEntity,
    contact: ContactEntity,
    _resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult> {
    const email = contact.email;
    if (!email) {
      throw new Error(`Contact ${contact.id} has no email address`);
    }

    await this.mailService.send({
      to: email,
      ...emailFromTemplate('follow_up', {
        subject: appointment.title ?? 'Follow-up',
        message: followUpText(appointment, contact, org),
        organization_name: org.name,
      }),
    });

    this.logger.log(`Sent follow-up email to ${email} for appointment ${appointment.id}`);
    return { completed: true, channel: 'email' };
  }
}
