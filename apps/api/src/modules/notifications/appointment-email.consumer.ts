import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../../infrastructure/mail/mail.service';
import type { MailAttachment } from '../../infrastructure/mail/mail.service';
import { CommunicationDispatchService } from '../communications/communication-dispatch.service';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { CommunicationEventType } from '@crm/shared';

interface AppointmentCreatedPayload {
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
}

/**
 * Convert a UTC ISO string to a local ICS datetime string (YYYYMMDDTHHMMSS)
 * in the given IANA timezone, using native Intl.DateTimeFormat.
 */
function convertUtcToTimezone(isoUtc: string, timezone: string): string {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
}

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
  ) {}

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED)
  async handleAppointmentConfirmed(@Payload() data: AppointmentCreatedPayload): Promise<void> {
    // Skip confirmation emails for automation/follow-up appointments
    if (data.origin === 'automation') {
      this.logger.debug(`Skipping confirmation email for automation appointment ${data.appointment_id}`);
      return;
    }

    try {
      const contact = await this.contactRepo.findOne({
        where: { id: data.contact_id, organization_id: data.organization_id },
      });
      if (!contact?.email) {
        this.logger.debug(`No email for contact ${data.contact_id}, skipping confirmation`);
        return;
      }

      const org = await this.orgRepo.findOne({ where: { id: data.organization_id } });
      const orgName = org?.name ?? 'Nuestra empresa';
      const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Cliente';

      // Resolve creator info for ORGANIZER field
      let organizerEmail = 'noreply@prosalesia.com';
      let organizerName = orgName;
      if (data.created_by) {
        const creator = await this.userRepo.findOne({
          where: { id: data.created_by, organization_id: data.organization_id },
        });
        if (creator) {
          organizerEmail = creator.email;
          organizerName = creator.full_name || orgName;
        }
      }

      // Generate ICS attachment
      const icsAttachment = this.generateIcsAttachment({
        appointmentId: data.appointment_id,
        title: data.title,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        location: data.location,
        meetingUrl: data.meeting_url,
        description: data.description,
        timezone: data.timezone,
        orgName,
        organizerEmail,
        organizerName,
        attendeeEmail: contact.email,
        attendeeName: contactName,
      });

      const formattedDate = this.formatDate(data.starts_at, data.timezone);
      const formattedTime = this.formatTime(data.starts_at, data.timezone);
      const formattedEndTime = this.formatTime(data.ends_at, data.timezone);

      const variables = {
        // Original variable names (used by default HTML fallback + other orgs)
        contact_name: contactName,
        title: data.title,
        date: formattedDate,
        time: formattedTime,
        end_time: formattedEndTime,
        timezone: data.timezone,
        location: data.location ?? '',
        meeting_url: data.meeting_url ?? '',
        organization_name: orgName,
        // Aliases for Resend templates
        client_name: contactName,
        booking_date: formattedDate,
        booking_time: formattedTime,
      };

      // Try dispatch via communications module (email + SMS)
      const result = await this.dispatchService.dispatch({
        organizationId: data.organization_id,
        eventType: CommunicationEventType.APPOINTMENT_CREATED,
        channelType: 'email',
        recipient: contact.email,
        variables,
        attachments: [icsAttachment],
      });

      if (contact.phone) {
        await this.dispatchService.dispatch({
          organizationId: data.organization_id,
          eventType: CommunicationEventType.APPOINTMENT_CREATED,
          channelType: 'sms',
          recipient: contact.phone,
          variables,
        });
      }

      if (!result.dispatched) {
        // Fallback to inline HTML
        await this.mailService.send({
          to: contact.email,
          subject: `Confirmación de cita: ${data.title}`,
          html: this.buildHtml({
            contactName,
            title: data.title,
            date: variables.date,
            time: variables.time,
            endTime: variables.end_time,
            timezone: data.timezone,
            location: data.location,
            meetingUrl: data.meeting_url,
            orgName,
          }),
          attachments: [icsAttachment],
        });
      }

      this.logger.log(`Appointment confirmation email sent to ${contact.email} for appointment ${data.appointment_id}`);
    } catch (err) {
      this.logger.warn(`Failed to send appointment confirmation email: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED)
  async handleAppointmentRescheduled(@Payload() data: AppointmentCreatedPayload): Promise<void> {
    try {
      const contact = await this.contactRepo.findOne({
        where: { id: data.contact_id, organization_id: data.organization_id },
      });
      if (!contact?.email) return;

      const org = await this.orgRepo.findOne({ where: { id: data.organization_id } });
      const orgName = org?.name ?? 'Nuestra empresa';
      const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Cliente';

      const variables = {
        contact_name: contactName,
        client_name: contactName,
        title: data.title,
        date: this.formatDate(data.starts_at, data.timezone),
        time: this.formatTime(data.starts_at, data.timezone),
        end_time: this.formatTime(data.ends_at, data.timezone),
        booking_date: this.formatDate(data.starts_at, data.timezone),
        booking_time: this.formatTime(data.starts_at, data.timezone),
        timezone: data.timezone,
        location: data.location ?? '',
        meeting_url: data.meeting_url ?? '',
        organization_name: orgName,
      };

      await this.dispatchService.dispatch({
        organizationId: data.organization_id,
        eventType: CommunicationEventType.APPOINTMENT_RESCHEDULED,
        channelType: 'email',
        recipient: contact.email,
        variables,
      });

      if (contact.phone) {
        await this.dispatchService.dispatch({
          organizationId: data.organization_id,
          eventType: CommunicationEventType.APPOINTMENT_RESCHEDULED,
          channelType: 'sms',
          recipient: contact.phone,
          variables,
        });
      }

      this.logger.log(`Appointment rescheduled notification sent to ${contact.email} for appointment ${data.appointment_id}`);
    } catch (err) {
      this.logger.warn(`Failed to send appointment rescheduled email: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.APPOINTMENT_CANCELLED)
  async handleAppointmentCancelled(@Payload() data: AppointmentCreatedPayload): Promise<void> {
    try {
      const contact = await this.contactRepo.findOne({
        where: { id: data.contact_id, organization_id: data.organization_id },
      });
      if (!contact?.email) return;

      const org = await this.orgRepo.findOne({ where: { id: data.organization_id } });
      const orgName = org?.name ?? 'Nuestra empresa';
      const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Cliente';

      const variables = {
        contact_name: contactName,
        client_name: contactName,
        title: data.title,
        date: this.formatDate(data.starts_at, data.timezone),
        time: this.formatTime(data.starts_at, data.timezone),
        end_time: this.formatTime(data.ends_at, data.timezone),
        booking_date: this.formatDate(data.starts_at, data.timezone),
        booking_time: this.formatTime(data.starts_at, data.timezone),
        timezone: data.timezone,
        organization_name: orgName,
      };

      await this.dispatchService.dispatch({
        organizationId: data.organization_id,
        eventType: CommunicationEventType.APPOINTMENT_CANCELLED,
        channelType: 'email',
        recipient: contact.email,
        variables,
      });

      if (contact.phone) {
        await this.dispatchService.dispatch({
          organizationId: data.organization_id,
          eventType: CommunicationEventType.APPOINTMENT_CANCELLED,
          channelType: 'sms',
          recipient: contact.phone,
          variables,
        });
      }

      this.logger.log(`Appointment cancelled notification sent to ${contact.email} for appointment ${data.appointment_id}`);
    } catch (err) {
      this.logger.warn(`Failed to send appointment cancelled email: ${(err as Error).message}`);
    }
  }

  private generateIcsAttachment(params: {
    appointmentId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location?: string;
    meetingUrl?: string;
    description?: string;
    timezone: string;
    orgName: string;
    organizerEmail: string;
    organizerName: string;
    attendeeEmail: string;
    attendeeName: string;
  }): MailAttachment {
    const tz = params.timezone;

    const formatIcsDateUtc = (iso: string) =>
      new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const now = formatIcsDateUtc(new Date().toISOString());
    const dtStart = convertUtcToTimezone(params.startsAt, tz);
    const dtEnd = convertUtcToTimezone(params.endsAt, tz);

    // Escape ICS text values (fold newlines, escape commas/semicolons/backslashes)
    const icsEscape = (s: string) =>
      s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//${icsEscape(params.orgName)}//CRM//ES`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE',
      `TZID:${tz}`,
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      `UID:${params.appointmentId}`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=${tz}:${dtStart}`,
      `DTEND;TZID=${tz}:${dtEnd}`,
      `SUMMARY:${icsEscape(params.title)}`,
    ];

    if (params.description) {
      lines.push(`DESCRIPTION:${icsEscape(params.description)}`);
    }
    if (params.location) {
      lines.push(`LOCATION:${icsEscape(params.location)}`);
    }
    if (params.meetingUrl) {
      lines.push(`URL:${params.meetingUrl}`);
    }

    lines.push(
      `ORGANIZER;CN=${icsEscape(params.organizerName)}:mailto:${params.organizerEmail}`,
      `ATTENDEE;CN=${icsEscape(params.attendeeName)};ROLE=REQ-PARTICIPANT:mailto:${params.attendeeEmail}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Recordatorio: ${icsEscape(params.title)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    );

    const icsContent = lines.join('\r\n');
    return {
      filename: 'appointment.ics',
      content: Buffer.from(icsContent).toString('base64'),
      contentType: 'text/calendar',
    };
  }

  private formatDate(iso: string, timezone: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      });
    } catch {
      return new Date(iso).toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  }

  private formatTime(iso: string, timezone: string): string {
    try {
      return new Date(iso).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });
    } catch {
      return new Date(iso).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  private buildHtml(params: {
    contactName: string;
    title: string;
    date: string;
    time: string;
    endTime: string;
    timezone: string;
    location?: string;
    meetingUrl?: string;
    orgName: string;
  }): string {
    const locationRow = params.location
      ? `<tr><td style="padding:8px 0;color:#6B7280;width:120px">Ubicación</td><td style="padding:8px 0;color:#111827">${this.escapeHtml(params.location)}</td></tr>`
      : '';

    const meetingRow = params.meetingUrl
      ? `<tr><td style="padding:8px 0;color:#6B7280;width:120px">Enlace</td><td style="padding:8px 0"><a href="${this.escapeHtml(params.meetingUrl)}" style="color:#2563EB;text-decoration:none">${this.escapeHtml(params.meetingUrl)}</a></td></tr>`
      : '';

    const meetingButton = params.meetingUrl
      ? `<div style="text-align:center;margin:24px 0"><a href="${this.escapeHtml(params.meetingUrl)}" style="display:inline-block;background:#2563EB;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Unirse a la reunión</a></div>`
      : '';

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:8px;border:1px solid #E6E8EB;overflow:hidden">
  <div style="background:#2563EB;padding:24px 32px">
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">${this.escapeHtml(params.orgName)}</h1>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 16px;color:#111827;font-size:16px">Hola ${this.escapeHtml(params.contactName)},</p>
    <p style="margin:0 0 24px;color:#6B7280;font-size:14px;line-height:1.6">Tu cita ha sido confirmada. Aquí tienes los detalles:</p>
    <div style="background:#F7F8FA;border-radius:6px;padding:16px 20px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#6B7280;width:120px">Cita</td><td style="padding:8px 0;color:#111827;font-weight:600">${this.escapeHtml(params.title)}</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;width:120px">Fecha</td><td style="padding:8px 0;color:#111827">${this.escapeHtml(params.date)}</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;width:120px">Hora</td><td style="padding:8px 0;color:#111827">${this.escapeHtml(params.time)} – ${this.escapeHtml(params.endTime)} (${this.escapeHtml(params.timezone)})</td></tr>
        ${locationRow}
        ${meetingRow}
      </table>
    </div>
    ${meetingButton}
    <p style="margin:24px 0 0;color:#6B7280;font-size:13px;line-height:1.5">Si necesitas cancelar o reprogramar, por favor contáctanos.</p>
  </div>
  <div style="padding:16px 32px;background:#F7F8FA;border-top:1px solid #E6E8EB;text-align:center">
    <p style="margin:0;color:#9CA3AF;font-size:12px">${this.escapeHtml(params.orgName)}</p>
  </div>
</div>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
