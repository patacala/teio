import { Controller, Logger, Optional } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../../infrastructure/mail/mail.service';
import type { MailAttachment } from '../../infrastructure/mail/mail.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { ProcessedEventsService } from '../../infrastructure/outbox/processed-events.service';
import { CommunicationDispatchService } from '../communications/communication-dispatch.service';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { CommunicationEventType } from '@crm/shared';
import { buildIcs } from './ics';

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
    private readonly dispatchService: CommunicationDispatchService,
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
      const { contact, orgName, variables } = ctx;

      if (contact.email) {
        const ics = await this.invite(data, ctx, 'REQUEST');
        const result = await this.dispatch(data, CommunicationEventType.APPOINTMENT_CREATED, 'email', contact.email, variables, [ics]);
        if (!result) {
          await this.mailService.send({
            to: contact.email,
            subject: `Confirmación de cita: ${data.title}`,
            html: this.layout(orgName, ctx.contactName, 'Tu cita ha sido confirmada. Aquí tienes los detalles:', data, variables, {
              button: data.meeting_url ? { label: 'Unirse a la reunión', url: data.meeting_url } : undefined,
              manageUrl: data.manage_url ?? undefined,
            }),
            attachments: [ics],
          });
        }
      }
      if (contact.phone) {
        await this.dispatch(data, CommunicationEventType.APPOINTMENT_CREATED, 'sms', contact.phone, {
          ...variables,
          manage_url: data.manage_url_sms ?? '',
        });
      }
      this.logger.log(`Appointment confirmation sent for appointment ${data.appointment_id}`);
    });
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED)
  async handleAppointmentRescheduled(@Payload() data: AppointmentPayload): Promise<void> {
    if (isFollowUpStep(data) || !(await this.once('rescheduled', data))) return;
    await this.safely(`reschedule notice for ${data.appointment_id}`, async () => {
      const ctx = await this.context(data);
      if (!ctx) return;
      const { contact, orgName, variables } = ctx;

      if (contact.email) {
        const ics = await this.invite(data, ctx, 'REQUEST');
        const sent = await this.dispatch(data, CommunicationEventType.APPOINTMENT_RESCHEDULED, 'email', contact.email, variables, [ics]);
        // A booking awaiting confirmation also gets the request with the button; no second email here.
        if (!sent && data.status !== 'scheduled') {
          await this.mailService.send({
            to: contact.email,
            subject: `Tu cita cambió de horario: ${data.title}`,
            html: this.layout(orgName, ctx.contactName, 'Tu cita cambió de horario. Estos son los nuevos detalles:', data, variables, {
              manageUrl: data.manage_url ?? undefined,
            }),
            attachments: [ics],
          });
        }
      }
      if (contact.phone) {
        await this.dispatch(data, CommunicationEventType.APPOINTMENT_RESCHEDULED, 'sms', contact.phone, {
          ...variables,
          manage_url: data.manage_url_sms ?? '',
        });
      }
      this.logger.log(`Appointment rescheduled notification sent for appointment ${data.appointment_id}`);
    });
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CANCELLED)
  async handleAppointmentCancelled(@Payload() data: AppointmentPayload): Promise<void> {
    if (isFollowUpStep(data) || !(await this.once('cancelled', data))) return;
    await this.safely(`cancellation notice for ${data.appointment_id}`, async () => {
      const ctx = await this.context(data);
      if (!ctx) return;
      const { contact, orgName, variables } = ctx;

      if (contact.email) {
        const ics = await this.invite(data, ctx, 'CANCEL');
        const sent = await this.dispatch(data, CommunicationEventType.APPOINTMENT_CANCELLED, 'email', contact.email, variables, [ics]);
        if (!sent) {
          await this.mailService.send({
            to: contact.email,
            subject: `Cita cancelada: ${data.title}`,
            html: this.layout(orgName, ctx.contactName, 'Tu cita fue cancelada:', data, variables, {}),
            attachments: [ics],
          });
        }
      }
      if (contact.phone) {
        await this.dispatch(data, CommunicationEventType.APPOINTMENT_CANCELLED, 'sms', contact.phone, variables);
      }
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
      const { contact, orgName, variables } = ctx;
      if (contact.email) {
        const sent = await this.dispatch(data, CommunicationEventType.APPOINTMENT_REMINDER, 'email', contact.email, variables);
        if (!sent) {
          await this.mailService.send({
            to: contact.email,
            subject: `Recordatorio: ${data.title}`,
            html: this.layout(orgName, ctx.contactName, 'Te recordamos tu cita:', data, variables, {
              button: data.meeting_url ? { label: 'Unirse a la reunión', url: data.meeting_url } : undefined,
              manageUrl: data.manage_url ?? undefined,
            }),
          });
        }
      }
      if (contact.phone) {
        const sent = await this.dispatch(data, CommunicationEventType.APPOINTMENT_REMINDER, 'sms', contact.phone, {
          ...variables,
          manage_url: data.manage_url_sms ?? '',
        });
        if (!sent && !contact.email) {
          await this.smsService.send({
            to: contact.phone,
            text: `${orgName}: recordatorio de tu cita "${data.title}" el ${variables.date} a las ${variables.time}.`,
          });
        }
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
    const { contact, orgName, variables } = ctx;
    const vars = {
      ...variables,
      confirm_url: opts.confirmUrl,
      reminder: opts.reminder ? 'true' : '',
      rescheduled: opts.rescheduled ? 'true' : '',
    };

    if (contact.email) {
      const sent = await this.dispatch(data, CommunicationEventType.APPOINTMENT_CONFIRMATION_REQUEST, 'email', contact.email, vars);
      if (!sent) {
        const intro = opts.rescheduled
          ? 'Tu cita cambió de horario. Por favor confirma el nuevo horario:'
          : opts.reminder
            ? 'Tu cita es pronto y aún no la confirmas. Por favor confírmala:'
            : 'Tienes una cita agendada. Por favor confírmala:';
        await this.mailService.send({
          to: contact.email,
          subject: opts.rescheduled
            ? `Confirma el nuevo horario: ${data.title}`
            : opts.reminder
              ? `Recordatorio: confirma tu cita ${data.title}`
              : `Confirma tu cita: ${data.title}`,
          html: this.layout(orgName, ctx.contactName, intro, data, variables, {
            button: { label: 'Confirmar cita', url: opts.confirmUrl },
            footer: 'Desde el mismo enlace puedes cambiar el horario o cancelar.',
          }),
        });
      }
    }

    if (contact.phone) {
      const sent = await this.dispatch(data, CommunicationEventType.APPOINTMENT_CONFIRMATION_REQUEST, 'sms', contact.phone, {
        ...vars,
        confirm_url: opts.confirmUrlSms,
      });
      // Without an email the link by SMS is the only way to confirm.
      if (!sent && !contact.email) {
        await this.smsService.send({
          to: contact.phone,
          text: `${orgName}: confirma tu cita "${data.title}" el ${variables.date} a las ${variables.time}: ${opts.confirmUrlSms}`,
        });
      }
    }
  }

  private async context(data: AppointmentPayload) {
    const contact = await this.contactRepo.findOne({
      where: { id: data.contact_id, organization_id: data.organization_id },
    });
    if (!contact?.email && !contact?.phone) {
      this.logger.debug(`Contact ${data.contact_id} has no email or phone; skipping ${data.appointment_id}`);
      return null;
    }
    const org = await this.orgRepo.findOne({ where: { id: data.organization_id } });
    const orgName = org?.name ?? 'Nuestra empresa';
    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Cliente';
    const date = this.formatDate(data.starts_at, data.timezone);
    const time = this.formatTime(data.starts_at, data.timezone);
    const variables: Record<string, string> = {
      contact_name: contactName,
      client_name: contactName,
      title: data.title,
      date,
      time,
      end_time: this.formatTime(data.ends_at, data.timezone),
      booking_date: date,
      booking_time: time,
      timezone: data.timezone,
      location: data.location ?? '',
      meeting_url: data.meeting_url ?? '',
      organization_name: orgName,
      manage_url: data.manage_url ?? '',
    };
    return { contact: contact as Contact, orgName, contactName, variables };
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

  /** The org's template for this event/channel; false when none is configured. */
  private async dispatch(
    data: AppointmentPayload,
    eventType: CommunicationEventType,
    channelType: 'email' | 'sms',
    recipient: string,
    variables: Record<string, string>,
    attachments?: MailAttachment[],
  ): Promise<boolean> {
    const result = await this.dispatchService.dispatch({
      organizationId: data.organization_id,
      eventType,
      channelType,
      recipient,
      variables,
      ...(attachments ? { attachments } : {}),
    });
    return !!result?.dispatched;
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
      attendee: { name: ctx.contactName, email: ctx.contact.email as string },
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
      return new Date(iso).toLocaleDateString('es-ES', { ...options, timeZone: timezone });
    } catch {
      return new Date(iso).toLocaleDateString('es-ES', { ...options, timeZone: 'UTC' });
    }
  }

  private formatTime(iso: string, timezone: string): string {
    const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    try {
      return new Date(iso).toLocaleTimeString('es-ES', { ...options, timeZone: timezone });
    } catch {
      return new Date(iso).toLocaleTimeString('es-ES', { ...options, timeZone: 'UTC' });
    }
  }

  private layout(
    orgName: string,
    contactName: string,
    intro: string,
    data: AppointmentPayload,
    variables: Record<string, string>,
    extras: { button?: { label: string; url: string }; manageUrl?: string; footer?: string },
  ): string {
    const row = (label: string, value: string) =>
      `<tr><td style="padding:8px 0;color:#6B7280;width:120px">${label}</td><td style="padding:8px 0;color:#111827">${value}</td></tr>`;
    const button = extras.button
      ? `<div style="text-align:center;margin:24px 0"><a href="${this.escapeHtml(extras.button.url)}" style="display:inline-block;background:#2563EB;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${this.escapeHtml(extras.button.label)}</a></div>`
      : '';
    const manage = extras.manageUrl
      ? `<p style="margin:16px 0 0;font-size:13px"><a href="${this.escapeHtml(extras.manageUrl)}" style="color:#2563EB">Cambiar horario o cancelar</a></p>`
      : '';
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:8px;border:1px solid #E6E8EB;overflow:hidden">
  <div style="background:#2563EB;padding:24px 32px">
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">${this.escapeHtml(orgName)}</h1>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 16px;color:#111827;font-size:16px">Hola ${this.escapeHtml(contactName)},</p>
    <p style="margin:0 0 24px;color:#6B7280;font-size:14px;line-height:1.6">${this.escapeHtml(intro)}</p>
    <div style="background:#F7F8FA;border-radius:6px;padding:16px 20px;margin-bottom:8px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row('Cita', `<strong>${this.escapeHtml(data.title)}</strong>`)}
        ${row('Fecha', this.escapeHtml(variables.date))}
        ${row('Hora', `${this.escapeHtml(variables.time)} – ${this.escapeHtml(variables.end_time)} (${this.escapeHtml(data.timezone)})`)}
        ${data.location ? row('Ubicación', this.escapeHtml(data.location)) : ''}
      </table>
    </div>
    ${button}
    ${manage}
    ${extras.footer ? `<p style="margin:24px 0 0;color:#6B7280;font-size:13px;line-height:1.5">${this.escapeHtml(extras.footer)}</p>` : ''}
  </div>
  <div style="padding:16px 32px;background:#F7F8FA;border-top:1px solid #E6E8EB;text-align:center">
    <p style="margin:0;color:#9CA3AF;font-size:12px">${this.escapeHtml(orgName)}</p>
  </div>
</div>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
