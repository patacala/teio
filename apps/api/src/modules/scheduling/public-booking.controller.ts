import { Body, Controller, Get, HttpStatus, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OrganizationEntity } from '../organizations/organization.entity';
import { AppointmentEntity } from './appointment.entity';
import { ContactLinkView, SchedulingService } from './scheduling.service';
import { localDate } from './domain/timezone';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatWhen(instant: Date, timeZone: string, withDate = true): string {
  const options: Intl.DateTimeFormatOptions = withDate
    ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' };
  try {
    return instant.toLocaleString('es-ES', { ...options, timeZone });
  } catch {
    return instant.toLocaleString('es-ES', { ...options, timeZone: 'UTC' });
  }
}

const MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: { title: '¡Cita confirmada!', body: 'Gracias, te esperamos.' },
  already_confirmed: { title: 'Tu cita está confirmada', body: 'Si lo necesitas, puedes cambiar el horario o cancelar.' },
  rescheduled: { title: 'Cita reprogramada', body: 'Tu cita quedó confirmada en el nuevo horario. Te enviamos los detalles.' },
  cancelled: { title: 'Cita cancelada', body: 'Si quieres agendar de nuevo, contáctanos.' },
  closed: { title: 'Esta cita ya pasó', body: 'Si necesitas otra cita, contáctanos.' },
  awaiting_payment: { title: 'Cita pendiente de pago', body: 'Se confirma automáticamente cuando recibamos el pago.' },
  outdated: { title: 'Este enlace ya no es válido', body: 'La cita cambió de horario. Usa el enlace del mensaje más reciente.' },
  expired: { title: 'Este enlace expiró', body: 'La cita ya empezó o el enlace caducó.' },
  invalid: { title: 'Enlace no válido', body: 'Revisa que el enlace esté completo.' },
  slot_unavailable: { title: 'Ese horario ya no está disponible', body: 'Elige otro horario.' },
};

function page(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 32px; max-width: 480px; width: 100%; text-align: center; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    h2 { font-size: 14px; margin: 20px 0 8px; text-align: left; text-transform: capitalize; }
    p { color: #64748b; font-size: 14px; line-height: 1.5; }
    .when { color: #0f172a; font-weight: 600; }
    button, .link { margin-top: 12px; background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 12px 28px; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
    .secondary { background: #fff; color: #2563eb; border: 1px solid #cbd5e1; }
    .danger { background: #dc2626; }
    .slots { display: flex; flex-wrap: wrap; gap: 8px; }
    .slots form { margin: 0; }
    .slots button { margin: 0; padding: 8px 14px; font-size: 14px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
    .actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  </style>
</head>
<body><div class="card">${inner}</div></body>
</html>`;
}

/**
 * The contact's own link (no CRM session). GET pages only show things; every
 * change is a POST from a button, so link scanners that open URLs in emails
 * cannot confirm, move or cancel on the contact's behalf.
 */
@ApiExcludeController()
@Controller({ path: 'public/appointments', version: '1' })
export class PublicBookingController {
  constructor(
    private readonly scheduling: SchedulingService,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
  ) {}

  @Public()
  @Get('confirm')
  async show(@Query('token') token: string, @Query('c') channel: string, @Res() res: Response): Promise<void> {
    const view = await this.scheduling.describeConfirmation(token ?? '');
    if (!view.appointment || (!view.canConfirm && !view.canChange)) {
      return this.result(res, view.state, view.appointment);
    }
    const appt = view.appointment;
    const orgName = await this.orgName(appt.organization_id);
    const hidden = this.hidden(token, channel);
    const header = view.canConfirm ? 'Confirma tu cita' : MESSAGES.already_confirmed.title;
    this.html(
      res,
      page(
        header,
        `<h1>${escapeHtml(header)}</h1>
         <p>${escapeHtml(orgName)}</p>
         ${this.details(appt)}
         ${view.canConfirm ? `<form method="POST" action="confirm">${hidden}<button type="submit">Confirmar cita</button></form>` : ''}
         ${this.changeLinks(view, token, channel)}`,
      ),
    );
  }

  @Public()
  @Post('confirm')
  async confirm(@Body() body: Record<string, string>, @Res() res: Response): Promise<void> {
    const { state, appointment } = await this.scheduling.confirmByContact(String(body?.token ?? ''), this.channel(body?.c));
    return this.result(res, state, appointment);
  }

  /** Free slots on the booking's calendar, for the days the calendar lets contacts see. */
  @Public()
  @Get('reschedule')
  async chooseTime(@Query('token') token: string, @Query('c') channel: string, @Res() res: Response): Promise<void> {
    const { view, availability } = await this.scheduling.availabilityForContact(token ?? '');
    if (!view.appointment || !view.canChange || !availability) return this.result(res, view.state, view.appointment);

    const byDay = new Map<string, Array<{ starts_at: string }>>();
    const current = view.appointment.starts_at.getTime();
    for (const slot of availability.slots) {
      if (new Date(slot.starts_at).getTime() === current) continue;
      const day = localDate(new Date(slot.starts_at), availability.timezone);
      byDay.set(day, [...(byDay.get(day) ?? []), slot]);
    }
    const hidden = this.hidden(token, channel);
    const days = [...byDay.entries()]
      .map(([, slots]) => {
        const label = new Date(slots[0].starts_at).toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: availability.timezone,
        });
        const buttons = slots
          .map(
            (slot) =>
              `<form method="POST" action="reschedule">${hidden}<input type="hidden" name="starts_at" value="${escapeHtml(slot.starts_at)}" /><button type="submit">${escapeHtml(formatWhen(new Date(slot.starts_at), availability.timezone, false))}</button></form>`,
          )
          .join('');
        return `<h2>${escapeHtml(label)}</h2><div class="slots">${buttons}</div>`;
      })
      .join('');

    this.html(
      res,
      page(
        'Elige un nuevo horario',
        `<h1>Elige un nuevo horario</h1>
         ${this.details(view.appointment)}
         <p>Horarios en ${escapeHtml(availability.timezone)}</p>
         ${days || '<p>No hay horarios disponibles en los próximos días. Contáctanos para reagendar.</p>'}`,
      ),
    );
  }

  @Public()
  @Post('reschedule')
  async reschedule(@Body() body: Record<string, string>, @Res() res: Response): Promise<void> {
    const result = await this.scheduling.rescheduleByContact(
      String(body?.token ?? ''),
      String(body?.starts_at ?? ''),
      this.channel(body?.c),
    );
    if (result.state === 'slot_unavailable') {
      const again = `reschedule?token=${encodeURIComponent(String(body?.token ?? ''))}${body?.c === 's' ? '&c=s' : ''}`;
      const { title, body: text } = MESSAGES.slot_unavailable;
      return this.html(
        res,
        page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><a class="link" href="${escapeHtml(again)}">Ver horarios</a>`),
      );
    }
    return this.result(res, result.state, result.appointment);
  }

  @Public()
  @Get('cancel')
  async askCancel(@Query('token') token: string, @Query('c') channel: string, @Res() res: Response): Promise<void> {
    const view = await this.scheduling.describeConfirmation(token ?? '');
    if (!view.appointment || !view.canChange) return this.result(res, view.state, view.appointment);
    this.html(
      res,
      page(
        '¿Cancelar tu cita?',
        `<h1>¿Cancelar tu cita?</h1>
         ${this.details(view.appointment)}
         <form method="POST" action="cancel">${this.hidden(token, channel)}<button class="danger" type="submit">Sí, cancelar</button></form>`,
      ),
    );
  }

  @Public()
  @Post('cancel')
  async cancel(@Body() body: Record<string, string>, @Res() res: Response): Promise<void> {
    const result = await this.scheduling.cancelByContact(String(body?.token ?? ''));
    return this.result(res, result.state, result.appointment);
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  private channel(value: unknown): 'email' | 'sms' {
    return value === 's' ? 'sms' : 'email';
  }

  private hidden(token: string, channel: string): string {
    return `<input type="hidden" name="token" value="${escapeHtml(token ?? '')}" /><input type="hidden" name="c" value="${channel === 's' ? 's' : ''}" />`;
  }

  private details(appt: AppointmentEntity): string {
    return `<p><strong>${escapeHtml(appt.title)}</strong><br /><span class="when">${escapeHtml(formatWhen(appt.starts_at, appt.timezone))} (${escapeHtml(appt.timezone)})</span></p>`;
  }

  private changeLinks(view: ContactLinkView, token: string, channel: string): string {
    if (!view.canChange) return '';
    const q = `token=${encodeURIComponent(token)}${channel === 's' ? '&c=s' : ''}`;
    return `<div class="actions">
      <a class="link secondary" href="reschedule?${escapeHtml(q)}">Cambiar horario</a>
      <a class="link secondary" href="cancel?${escapeHtml(q)}">Cancelar cita</a>
    </div>`;
  }

  private result(res: Response, state: string, appointment?: AppointmentEntity): void {
    const { title, body } = MESSAGES[state] ?? MESSAGES.invalid;
    const details = appointment && state !== 'invalid' ? this.details(appointment) : '';
    this.html(res, page(title, `<h1>${escapeHtml(title)}</h1>${details}<p>${escapeHtml(body)}</p>`));
  }

  private html(res: Response, html: string): void {
    res
      .status(HttpStatus.OK)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .setHeader('Cache-Control', 'no-store')
      .setHeader('Referrer-Policy', 'no-referrer')
      .send(html);
  }

  private async orgName(organizationId: string): Promise<string> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId }, select: ['id', 'name'] });
    return org?.name ?? '';
  }
}
