import { Controller, Logger, Optional } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../../infrastructure/mail/mail.service';
import type { MailAttachment } from '../../infrastructure/mail/mail.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { ProcessedEventsService } from '../../infrastructure/outbox/processed-events.service';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { buildIcs } from './ics';
import {
  emailFromTemplate,
  smsFromTemplate,
  type EmailTemplateKey,
  type SmsTemplateKey,
  type TemplateVars,
} from '../../infrastructure/messaging';

/** Used only if the organization row is missing. */
const DEFAULT_ORGANIZATION_NAME = 'Our team';

interface AppointmentPayload {
  event_id?: string;
  organization_id: string;
  appointment_id: string;
  contact_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location?: string;
  meeting_url?: string;
  timezone: string;
  created_by?: string;
  description?: string;
  origin?: string;
  /** Only on events published before follow-up steps left the appointments table. */
  action?: string | null;
  status?: string;
  sequence?: number;
  manage_url?: string | null;
  manage_url_sms?: string | null;
}

interface ConfirmationRequestPayload extends AppointmentPayload {
  confirm_url: string;
  confirm_url_sms: string;
  reminder?: boolean;
  rescheduled?: boolean;
}

interface ReminderPayload extends AppointmentPayload {
  reminder_id: string;
  offset_minutes: number;
  confirm_url?: string | null;
  confirm_url_sms?: string | null;
}

type Contact = ContactEntity;

/** Follow-up steps never produce customer-facing appointment messages. */
function isFollowUpStep(data: AppointmentPayload): boolean {
  return data.origin === 'automation' || !!data.action;
}

const CONSUMER = 'appointment-email';

/**
 * Everything the contact hears about a booking: the request to confirm, the
 * confirmation (with the calendar invite), changes, cancellations and
 * reminders. Each event is handled once even if delivered twice.
 */
@Controller()
export class AppointmentEmailConsumer {
  private readonly logger = new Logger(AppointmentEmailConsumer.name);

  constructor(
    private readonly mailService: MailService,
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly smsService: SmsService,
    @Optional() private readonly processed?: ProcessedEventsService,
  ) {}

  /** Asks the contact to confirm: email with a button, the link by SMS, or SMS only when there is no email. */
  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CONFIRMATION_REQUESTED)
  async handleConfirmationRequested(@Payload() data: ConfirmationRequestPayload): Promise<void> {
    if (isFollowUpStep(data) || !(await this.once('confirmation-request', data))) return;
    await this.safely(`confirmation request for ${data.appointment_id}`, () =>
      this.sendConfirmationRequest(data, {
        confirmUrl: data.confirm_url,
        confirmUrlSms: data.confirm_url_sms,
        reminder: !!data.reminder,
        rescheduled: !!data.rescheduled,
      }),
    );
  }

  /** The booking is confirmed: confirmation with the calendar invite. */
  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED)
  async handleAppointmentConfirmed(@Payload() data: AppointmentPayload): Promise<void> {
    if (isFollowUpStep(data)) {
      this.logger.debug(`Skipping confirmation email for automation appointment ${data.appointment_id}`);
      return;
    }
    if (!(await this.once('confirmed', data))) return;
    await this.safely(`confirmation for ${data.appointment_id}`, async () => {
      const ctx = await this.context(data);
      if (!ctx) return;
      const { contact, vars } = ctx;

      if (contact.email) {
        const ics = await this.invite(data, ctx, 'REQUEST');
        await this.email(contact.email, 'appointment_confirmed', vars, [ics]);
      }
      if (contact.phone) await this.sms(contact.phone, 'appointment_confirmed', data, vars);
      this.logger.log(`Appointment confirmation sent for appointment ${data.appointment_id}`);
    });
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED)
  async handleAppointmentRescheduled(@Payload() data: AppointmentPayload): Promise<void> {
    if (isFollowUpStep(data) || !(await this.once('rescheduled', data))) return;
    await this.safely(`reschedule notice for ${data.appointment_id}`, async () => {
      const ctx = await this.context(data);
      if (!ctx) return;
      const { contact, vars } = ctx;

      // A booking awaiting confirmation also gets the confirmation request (with the
      // new time and the button/link), so no second message here.
      if (data.status === 'scheduled') return;
      if (contact.email) {
        const ics = await this.invite(data, ctx, 'REQUEST');
        await this.email(contact.email, 'appointment_rescheduled', vars, [ics]);
      }
      if (contact.phone) await this.sms(contact.phone, 'appointment_rescheduled', data, vars);
      this.logger.log(`Appointment rescheduled notification sent for appointment ${data.appointment_id}`);
    });
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CANCELLED)
  async handleAppointmentCancelled(@Payload() data: AppointmentPayload): Promise<void> {
    if (isFollowUpStep(data) || !(await this.once('cancelled', data))) return;
    await this.safely(`cancellation notice for ${data.appointment_id}`, async () => {
      const ctx = await this.context(data);
      if (!ctx) return;
      const { contact, vars } = ctx;

      if (contact.email) {
        const ics = await this.invite(data, ctx, 'CANCEL');
        await this.email(contact.email, 'appointment_cancelled', vars, [ics]);
      }
      if (contact.phone) await this.sms(contact.phone, 'appointment_cancelled', data, vars, { manageLink: false });
      this.logger.log(`Appointment cancelled notification sent for appointment ${data.appointment_id}`);
    });
  }

  /** A reminder before the appointment; unconfirmed bookings are asked to confirm instead. */
  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_REMINDER_DUE)
  async handleReminderDue(@Payload() data: ReminderPayload): Promise<void> {
    if (isFollowUpStep(data) || !(await this.once('reminder', data))) return;
    await this.safely(`reminder ${data.reminder_id}`, async () => {
      if (data.confirm_url && data.confirm_url_sms) {
        await this.sendConfirmationRequest(data, {
          confirmUrl: data.confirm_url,
          confirmUrlSms: data.confirm_url_sms,
          reminder: true,
          rescheduled: false,
        });
        return;
      }
      const ctx = await this.context(data);
      if (!ctx) return;
      const { contact, vars } = ctx;
      if (contact.email) await this.email(contact.email, 'appointment_reminder', vars);
      // Reminders go by SMS only to contacts without an email.
      if (contact.phone && !contact.email) {
        await this.sms(contact.phone, 'appointment_reminder', data, vars, { manageLink: false });
      }
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async sendConfirmationRequest(
    data: AppointmentPayload,
    opts: { confirmUrl: string; confirmUrlSms: string; reminder: boolean; rescheduled: boolean },
  ): Promise<void> {
    const ctx = await this.context(data);
    if (!ctx) return;
    const { contact, vars } = ctx;

    if (contact.email) {
      const key = opts.rescheduled
        ? 'appointment_confirmation_rescheduled'
        : opts.reminder
          ? 'appointment_confirmation_reminder'
          : 'appointment_confirmation_request';
      await this.email(contact.email, key, { ...vars, confirm_url: opts.confirmUrl });
    }

    // Without an email the link by SMS is the only way to confirm.
    if (contact.phone && !contact.email) {
      await this.sms(contact.phone, 'appointment_confirmation_request', data, { ...vars, confirm_url: opts.confirmUrlSms }, {
        manageLink: false,
      });
    }
  }

  /**
   * Everything the templates can say about this booking ({{user_name}} is the
   * contact). Null when the contact cannot be reached.
   */
  private async context(data: AppointmentPayload) {
    const contact = await this.contactRepo.findOne({
      where: { id: data.contact_id, organization_id: data.organization_id },
    });
    if (!contact?.email && !contact?.phone) {
      this.logger.debug(`Contact ${data.contact_id} has no email or phone; skipping ${data.appointment_id}`);
      return null;
    }
    const org = await this.orgRepo.findOne({ where: { id: data.organization_id } });
    const orgName = org?.name || DEFAULT_ORGANIZATION_NAME;
    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    const vars: TemplateVars = {
      user_name: contactName,
      organization_name: orgName,
      appointment_title: data.title,
      appointment_date: this.formatDate(data.starts_at, data.timezone),
      appointment_time: this.formatTime(data.starts_at, data.timezone),
      appointment_end_time: this.formatTime(data.ends_at, data.timezone),
      timezone: data.timezone,
      location: data.location ?? '',
      meeting_url: data.meeting_url ?? '',
      manage_url: data.manage_url ?? '',
    };
    return { contact: contact as Contact, orgName, contactName, vars };
  }

  private async email(
    to: string,
    key: EmailTemplateKey,
    vars: TemplateVars,
    attachments?: MailAttachment[],
  ): Promise<void> {
    await this.mailService.send({ to, ...emailFromTemplate(key, vars), ...(attachments ? { attachments } : {}) });
  }

  /** SMS from the catalog; adds the short manage link (" Reschedule or cancel: …") when the booking has one. */
  private async sms(
    to: string,
    key: SmsTemplateKey,
    data: AppointmentPayload,
    vars: TemplateVars,
    opts: { manageLink?: boolean } = {},
  ): Promise<void> {
    let text = smsFromTemplate(key, vars);
    if (opts.manageLink !== false && data.manage_url_sms) {
      text += smsFromTemplate('manage_suffix', { manage_url: data.manage_url_sms });
    }
    await this.smsService.send({ to, text });
  }

  /** True the first time this consumer sees the event (dedupes redeliveries). */
  private async once(handler: string, data: AppointmentPayload): Promise<boolean> {
    if (!this.processed) return true;
    return this.processed.claim(`${CONSUMER}:${handler}`, data.event_id);
  }

  private async safely(what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Failed to send ${what}: ${(err as Error).message}`);
    }
  }

  private async invite(
    data: AppointmentPayload,
    ctx: { contact: Contact; orgName: string; contactName: string },
    method: 'REQUEST' | 'CANCEL',
  ): Promise<MailAttachment> {
    let organizer = { name: ctx.orgName, email: 'noreply@prosalesia.com' };
    if (data.created_by) {
      const creator = await this.userRepo.findOne({
        where: { id: data.created_by, organization_id: data.organization_id },
      });
      if (creator) organizer = { name: creator.full_name || ctx.orgName, email: creator.email };
    }
    const ics = buildIcs({
      method,
      uid: `${data.appointment_id}@crm`,
      sequence: Number(data.sequence ?? 1),
      start: new Date(data.starts_at),
      end: new Date(data.ends_at),
      title: data.title,
      description: data.description,
      location: data.location,
      url: data.meeting_url,
      organizer,
      attendee: { name: ctx.contactName || (ctx.contact.email as string), email: ctx.contact.email as string },
      productName: ctx.orgName,
    });
    return {
      filename: method === 'CANCEL' ? 'cancel.ics' : 'invite.ics',
      content: Buffer.from(ics).toString('base64'),
      contentType: `text/calendar; method=${method}`,
    };
  }

  private formatDate(iso: string, timezone: string): string {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    try {
      return new Date(iso).toLocaleDateString('en-US', { ...options, timeZone: timezone });
    } catch {
      return new Date(iso).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
    }
  }

  private formatTime(iso: string, timezone: string): string {
    const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    try {
      return new Date(iso).toLocaleTimeString('en-US', { ...options, timeZone: timezone });
    } catch {
      return new Date(iso).toLocaleTimeString('en-US', { ...options, timeZone: 'UTC' });
    }
  }
}
