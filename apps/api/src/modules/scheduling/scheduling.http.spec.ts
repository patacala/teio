/**
 * HTTP contract of the scheduling routes, with the production ValidationPipe,
 * guards, exception filter and response envelope, on a real PostgreSQL:
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @crm/api test scheduling.http
 * Skipped when TEST_DATABASE_URL is not set.
 */
/// <reference types="jest" />
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { DataSource, QueryRunner } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { RABBITMQ_SERVICE } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AppointmentEntity } from './appointment.entity';
import { WorkScheduleEntity } from './work-schedule.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { SchedulingService } from './scheduling.service';
import { CalendarService } from './calendar.service';
import { AvailabilityService } from './availability.service';
import { BookingLinksService } from './booking-links.service';
import { AppointmentEventsPublisher } from './appointment-events.publisher';
import { SchedulingController } from './scheduling.controller';
import { CalendarsController } from './calendars.controller';
import { PublicBookingController } from './public-booking.controller';
import { addDays, localDate, zonedTimeToUtc } from './domain/timezone';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { OutboxEventEntity } from '../../infrastructure/outbox/outbox-event.entity';
import { AppointmentReminderEntity } from './appointment-reminder.entity';
import { of } from 'rxjs';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const TZ = 'America/Mexico_City';

jest.setTimeout(60_000);

describeDb('scheduling HTTP routes', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ds: DataSource;
  let outbox: OutboxService;
  let suiteLock: QueryRunner;
  const emitted: Array<{ queue: string; data: Record<string, unknown> }> = [];
  const org = randomUUID();
  const contact = randomUUID();
  let calendarId: string;

  const at = (daysAhead: number, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (zonedTimeToUtc(addDays(localDate(new Date(), TZ), daysAhead), h * 60 + m, TZ) as Date).toISOString();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ scheduling: { linkSecret: 'http-test-secret-0123456789abcdef' }, webhooks: { baseUrl: 'https://api.test' } })],
        }),
        TypeOrmModule.forRoot({ type: 'postgres', url, entities: [`${__dirname}/../../**/*.entity.ts`] }),
        TypeOrmModule.forFeature([
          AppointmentEntity,
          AppointmentReminderEntity,
          WorkScheduleEntity,
          ContactEntity,
          OrganizationEntity,
          OutboxEventEntity,
        ]),
      ],
      controllers: [SchedulingController, CalendarsController, PublicBookingController],
      providers: [
        SchedulingService,
        CalendarService,
        AvailabilityService,
        BookingLinksService,
        AppointmentEventsPublisher,
        OutboxService,
        {
          provide: RABBITMQ_SERVICE,
          useValue: {
            emit: (queue: string, data: Record<string, unknown>) => {
              emitted.push({ queue, data });
              return of(undefined);
            },
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = req.headers['x-test-role'] as string | undefined;
      if (role) {
        req.user = { id: 'u1', auth_user_id: 'a1', email: null, organization_id: org, role, is_platform_admin: false } as never;
        (req as unknown as Record<string, unknown>).tenant = { organization_id: org, user_id: null, role };
      }
      next();
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api/v1`;

    ds = moduleRef.get(DataSource);
    outbox = moduleRef.get(OutboxService);
    // Suites sharing TEST_DATABASE_URL also share the outbox: one at a time, or each relay would publish the other's events.
    suiteLock = ds.createQueryRunner();
    await suiteLock.connect();
    await suiteLock.query('SELECT pg_advisory_lock(727274)');
    await ds.query(`INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Clínica Sol', $2)`, [org, `sol-${org}`]);
    await ds.query(
      `INSERT INTO clients.contacts (id, organization_id, first_name, email) VALUES ($1, $2, 'Ana', 'ana@example.com')`,
      [contact, org],
    );
  });

  afterAll(async () => {
    await suiteLock?.query('SELECT pg_advisory_unlock(727274)');
    await suiteLock?.release();
    await app?.close();
  });

  /** The confirmation request of the last booking, once the outbox is published. */
  async function lastLink(): Promise<URL> {
    await outbox.relay();
    const request = [...emitted].reverse().find(
      (e) => e.queue === 'appointment.confirmation.requested' && e.data.organization_id === org,
    )!;
    return new URL(String(request.data.confirm_url).replace('https://api.test', baseUrl.replace('/api/v1', '')));
  }

  const form = (values: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });

  async function call(role: string | null, method: string, path: string, body?: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  const booking = (startsAt: string, extra: Record<string, unknown> = {}) => ({
    contact_id: contact,
    calendar_id: calendarId,
    title: 'Consulta',
    starts_at: startsAt,
    duration_minutes: 30,
    ...extra,
  });

  it('lists calendars (seeding the defaults) and only lets admins change them', async () => {
    const list = await call('agent', 'GET', '/calendars');
    expect(list.status).toBe(200);
    expect(list.body.data.map((c: { system_key: string }) => c.system_key).sort()).toEqual(['appointments', 'follow_up']);
    calendarId = list.body.data.find((c: { system_key: string }) => c.system_key === 'appointments').id;

    expect((await call('agent', 'PUT', `/calendars/${calendarId}/config`, { timezone: TZ })).status).toBe(403);
    expect((await call('agent', 'POST', '/calendars', { name: 'Room 2' })).status).toBe(403);

    const bad = await call('admin', 'PUT', `/calendars/${calendarId}/config`, { timezone: 'Mexico City', slot_duration_minutes: 45 });
    expect(bad.status).toBe(400);
    expect(String(bad.body.message)).toMatch(/timezone/);
    expect(String(bad.body.message)).toMatch(/slot_duration_minutes/);

    const ok = await call('admin', 'PUT', `/calendars/${calendarId}/config`, {
      timezone: TZ,
      work_days: [0, 1, 2, 3, 4, 5, 6],
      start_time: '09:00',
      end_time: '18:00',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.timezone).toBe(TZ);
  });

  it('validates bookings and refuses fields the client must not set', async () => {
    // Legacy n8n workflows still send origin: accepted, but the server decides it.
    expect((await call('agent', 'POST', '/appointments', booking(at(7, '10:00'), { origin: 'banana' }))).status).toBe(400);
    expect((await call('agent', 'POST', '/appointments', booking(at(7, '10:00'), { created_by: randomUUID() }))).status).toBe(400);
    expect((await call('agent', 'POST', '/appointments', booking('tomorrow at 10'))).status).toBe(400);
    expect((await call('agent', 'POST', '/appointments', { ...booking(at(7, '10:00')), calendar_id: undefined })).status).toBe(400);
    expect((await call('agent', 'POST', '/appointments', booking(at(7, '10:00'), { duration_minutes: 0 }))).status).toBe(400);
    expect((await call(null, 'POST', '/appointments', booking(at(7, '10:00')))).status).toBe(401);
  });

  it('books, rejects conflicts with a structured 409, and walks the lifecycle over HTTP', async () => {
    const created = await call('agent', 'POST', '/appointments', booking(at(7, '10:00'), { origin: 'ai' }));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'scheduled', origin: 'human', timezone: TZ });
    const id = created.body.data.id;

    const clash = await call('agent', 'POST', '/appointments', booking(at(7, '10:15')));
    expect(clash.status).toBe(409);
    expect(clash.body.errors).toEqual({ code: 'SLOT_NOT_AVAILABLE', violations: ['conflict'] });

    // PATCH edits descriptive fields only: no status, no time, no tenant.
    expect((await call('agent', 'PATCH', `/appointments/${id}`, { status: 'confirmed' })).status).toBe(400);
    expect((await call('agent', 'PATCH', `/appointments/${id}`, { starts_at: at(8, '10:00') })).status).toBe(400);
    expect((await call('agent', 'PATCH', `/appointments/${id}`, { organization_id: randomUUID() })).status).toBe(400);
    const renamed = await call('agent', 'PATCH', `/appointments/${id}`, { title: 'Consulta inicial' });
    expect(renamed.body.data).toMatchObject({ title: 'Consulta inicial', organization_id: org });

    const moved = await call('agent', 'POST', `/appointments/${id}/reschedule`, { starts_at: at(7, '11:00') });
    expect(moved.status).toBe(201);
    expect(moved.body.data.confirmation_version).toBe(2);

    expect((await call('agent', 'POST', `/appointments/${id}/no-show`)).body.errors).toEqual({ code: 'NOT_STARTED' });
    expect((await call('agent', 'POST', `/appointments/${id}/confirm`)).body.data).toMatchObject({
      status: 'confirmed',
      confirmed_via: 'staff',
    });
    expect((await call('agent', 'POST', `/appointments/${id}/cancel`, { reason: 'contact' })).body.data).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'contact',
    });
    expect((await call('agent', 'DELETE', `/appointments/${id}`)).status).toBe(403);
    expect((await call('admin', 'DELETE', `/appointments/${id}`)).status).toBe(204);
    expect((await call('agent', 'GET', '/appointments/not-a-uuid')).status).toBe(400);
  });

  it('serves availability as local slots and metrics with the needs-outcome count', async () => {
    const day = addDays(localDate(new Date(), TZ), 9);
    const slots = await call('agent', 'GET', `/appointments/availability?from=${day}&to=${day}&calendar_id=${calendarId}&duration_minutes=60`);
    expect(slots.status).toBe(200);
    expect(slots.body.data[0]).toEqual({ starts_at: at(9, '09:00'), ends_at: at(9, '10:00') });
    expect((await call('agent', 'GET', `/appointments/availability?from=${day}&to=nope`)).status).toBe(400);

    const metrics = await call('agent', 'GET', `/appointments/metrics?calendar_id=${calendarId}`);
    expect(Object.keys(metrics.body.data).sort()).toEqual([
      'completed_count',
      'needs_outcome_count',
      'pending_count',
      'today_count',
      'week_count',
    ]);
  });

  it('lets the contact confirm from the public link without a session; opening it changes nothing', async () => {
    const created = await call('agent', 'POST', '/appointments', booking(at(10, '12:00')));
    const link = await lastLink();

    const page = await fetch(link);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('Confirmar cita');
    expect(html).toContain('Clínica Sol');
    expect((await call('agent', 'GET', `/appointments/${created.body.data.id}`)).body.data.status).toBe('scheduled');

    const confirmed = await fetch(`${baseUrl}/public/appointments/confirm`, form({ token: link.searchParams.get('token')!, c: '' }));
    expect(await confirmed.text()).toContain('¡Cita confirmada!');
    expect((await call('agent', 'GET', `/appointments/${created.body.data.id}`)).body.data).toMatchObject({
      status: 'confirmed',
      confirmed_via: 'email_link',
    });

    const forged = await fetch(`${baseUrl}/public/appointments/confirm?token=%3Cscript%3E`);
    const forgedHtml = await forged.text();
    expect(forgedHtml).toContain('Enlace no válido');
    expect(forgedHtml).not.toContain('<script>');
  });

  it('lets the contact pick a new time or cancel from the same link', async () => {
    const created = await call('agent', 'POST', '/appointments', booking(at(11, '10:00')));
    const id = created.body.data.id;
    const link = await lastLink();
    const token = link.searchParams.get('token')!;

    const landing = await (await fetch(link)).text();
    expect(landing).toContain('Cambiar horario');
    expect(landing).toContain('Cancelar cita');

    const choose = await (await fetch(`${baseUrl}/public/appointments/reschedule?token=${encodeURIComponent(token)}`)).text();
    expect(choose).toContain('Elige un nuevo horario');
    expect(choose).toContain(`value="${at(11, '09:00')}"`);
    expect(choose).not.toContain(`value="${at(11, '10:00')}"`);

    const moved = await (await fetch(`${baseUrl}/public/appointments/reschedule`, form({ token, c: 's', starts_at: at(11, '15:00') }))).text();
    expect(moved).toContain('Cita reprogramada');
    expect((await call('agent', 'GET', `/appointments/${id}`)).body.data).toMatchObject({
      status: 'confirmed',
      confirmed_via: 'sms_link',
      starts_at: at(11, '15:00'),
      confirmation_version: 2,
    });
    // The old link stopped working with the change of time.
    expect(await (await fetch(link)).text()).toContain('Este enlace ya no es válido');

    await outbox.relay();
    const rescheduled = [...emitted].reverse().find((e) => e.queue === 'appointment.rescheduled' && e.data.appointment_id === id)!;
    const fresh = new URL(String(rescheduled.data.manage_url).replace('https://api.test', baseUrl.replace('/api/v1', '')));
    const freshToken = fresh.searchParams.get('token')!;
    expect(await (await fetch(`${baseUrl}/public/appointments/cancel?token=${encodeURIComponent(freshToken)}`)).text()).toContain(
      '¿Cancelar tu cita?',
    );
    const cancelled = await (await fetch(`${baseUrl}/public/appointments/cancel`, form({ token: freshToken, c: '' }))).text();
    expect(cancelled).toContain('Cita cancelada');
    expect((await call('agent', 'GET', `/appointments/${id}`)).body.data).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'contact',
    });
  });

  it('refuses a taken slot when the contact reschedules', async () => {
    await call('agent', 'POST', '/appointments', booking(at(12, '11:00')));
    await call('agent', 'POST', '/appointments', booking(at(12, '10:00')));
    const token = (await lastLink()).searchParams.get('token')!;
    const html = await (await fetch(`${baseUrl}/public/appointments/reschedule`, form({ token, c: '', starts_at: at(12, '11:00') }))).text();
    expect(html).toContain('Ese horario ya no está disponible');
  });

  it('saves identity and rules in one call and rejects a bad one without partial changes', async () => {
    const before = (await call('agent', 'GET', `/calendars/${calendarId}`)).body.data;
    const bad = await call('admin', 'PUT', `/calendars/${calendarId}/config`, {
      name: 'Consultas Centro',
      min_notice_minutes: 60,
      owner_user_id: randomUUID(),
    });
    expect(bad.status).toBe(404);
    expect((await call('agent', 'GET', `/calendars/${calendarId}`)).body.data.name).toBe(before.name);

    const ok = await call('admin', 'PUT', `/calendars/${calendarId}/config`, {
      name: 'Consultas Centro',
      min_notice_minutes: 60,
      max_advance_days: 30,
      reminder_offsets_minutes: [120, 1440],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      name: 'Consultas Centro',
      min_notice_minutes: 60,
      max_advance_days: 30,
      reminder_offsets_minutes: [1440, 120],
    });
    expect((await call('admin', 'PUT', `/calendars/${calendarId}/config`, { reminder_offsets_minutes: [1] })).status).toBe(400);
  });

  it('shows the contact only the days the calendar allows for changes', async () => {
    expect((await call('admin', 'PUT', `/calendars/${calendarId}/config`, { contact_reschedule_days: 61 })).status).toBe(400);
    await call('admin', 'PUT', `/calendars/${calendarId}/config`, { contact_reschedule_days: 2, min_notice_minutes: 0 });
    await call('agent', 'POST', '/appointments', booking(at(5, '10:00')));
    const token = (await lastLink()).searchParams.get('token')!;

    const html = await (await fetch(`${baseUrl}/public/appointments/reschedule?token=${encodeURIComponent(token)}`)).text();
    expect(html).toContain(`value="${at(1, '09:00')}"`);
    expect(html).not.toContain(`value="${at(2, '09:00')}"`);
    expect(html).not.toContain(`value="${at(4, '09:00')}"`);
  });
});
