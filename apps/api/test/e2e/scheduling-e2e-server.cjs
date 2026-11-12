/**
 * Real scheduling API for the web end-to-end tests: the compiled controllers,
 * services, validation, guards and PostgreSQL; only login (any bearer token is
 * an admin of the seeded organization) and RabbitMQ (events stay in the outbox)
 * are stubbed.
 *
 *   pnpm --filter @crm/api build
 *   DATABASE_URL=postgres://... E2E_STATE_FILE=/tmp/e2e-state.json node test/e2e/scheduling-e2e-server.cjs
 *   E2E_API_URL=<printed url> E2E_STATE_FILE=/tmp/e2e-state.json pnpm --filter @crm/web test schedule.e2e
 */
require('reflect-metadata');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, VersioningType } = require('@nestjs/common');
const { APP_GUARD } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { TypeOrmModule } = require('@nestjs/typeorm');
const { DataSource } = require('typeorm');
const { of } = require('rxjs');

const dist = (file) => require(path.join(__dirname, '../../dist', file));
const TZ = 'America/Mexico_City';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const scheduling = 'modules/scheduling';
  const { SchedulingService } = dist(`${scheduling}/scheduling.service`);
  const { CalendarService } = dist(`${scheduling}/calendar.service`);
  const { AvailabilityService } = dist(`${scheduling}/availability.service`);
  const { BookingLinksService } = dist(`${scheduling}/booking-links.service`);
  const { AppointmentEventsPublisher } = dist(`${scheduling}/appointment-events.publisher`);
  const { SchedulingController } = dist(`${scheduling}/scheduling.controller`);
  const { CalendarsController } = dist(`${scheduling}/calendars.controller`);
  const { PublicBookingController } = dist(`${scheduling}/public-booking.controller`);
  const { AppointmentEntity } = dist(`${scheduling}/appointment.entity`);
  const { AppointmentReminderEntity } = dist(`${scheduling}/appointment-reminder.entity`);
  const { WorkScheduleEntity } = dist(`${scheduling}/work-schedule.entity`);
  const { ContactEntity } = dist('modules/client-management/contact.entity');
  const { OrganizationEntity } = dist('modules/organizations/organization.entity');
  const { OutboxService } = dist('infrastructure/outbox/outbox.service');
  const { OutboxEventEntity } = dist('infrastructure/outbox/outbox-event.entity');
  const { RABBITMQ_SERVICE } = dist('infrastructure/rabbitmq/rabbitmq.constants');
  const { JwtAuthGuard } = dist('common/guards/jwt-auth.guard');
  const { RolesGuard } = dist('common/guards/roles.guard');
  const { GlobalExceptionFilter } = dist('common/filters/global-exception.filter');
  const { TransformInterceptor } = dist('common/interceptors/transform.interceptor');
  const { localDate, addDays, zonedTimeToUtc } = dist(`${scheduling}/domain/timezone`);

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ scheduling: { linkSecret: 'e2e-booking-link-secret-0123456789' }, webhooks: { baseUrl: 'http://e2e.local' } })],
      }),
      TypeOrmModule.forRoot({ type: 'postgres', url, entities: [path.join(__dirname, '../../dist/**/*.entity.js')] }),
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
      { provide: RABBITMQ_SERVICE, useValue: { emit: () => of(undefined) } },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  // ── Seed one organization with a calendar and two bookings ───────────────
  const ds = moduleRef.get(DataSource);
  const calendars = moduleRef.get(CalendarService);
  const bookings = moduleRef.get(SchedulingService);
  const org = randomUUID();
  const contact = randomUUID();
  await ds.query(`INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Clínica E2E', $2)`, [org, `e2e-${org}`]);
  await ds.query(
    `INSERT INTO clients.contacts (id, organization_id, first_name, last_name, email) VALUES ($1, $2, 'Ana', 'Pérez', 'ana@e2e.test')`,
    [contact, org],
  );
  await calendars.seedDefaultCalendars(org);
  const calendar = await calendars.getDefaultCalendar(org);
  await calendars.updateCalendarConfig(org, calendar.id, {
    timezone: TZ,
    work_days: [0, 1, 2, 3, 4, 5, 6],
    start_time: '09:00',
    end_time: '18:00',
    slot_duration_minutes: 30,
  });
  const day = addDays(localDate(new Date(), TZ), 2);
  const at = (hh, mm) => zonedTimeToUtc(day, hh * 60 + mm, TZ).toISOString();
  const admin = { kind: 'user', userId: null, role: 'admin' };
  const book = (title, starts_at) =>
    bookings.createBooking(org, { contact_id: contact, calendar_id: calendar.id, title, starts_at, duration_minutes: 30 }, admin);
  const ana = await book('Consulta Ana (e2e)', at(10, 0));
  await bookings.confirmByStaff(org, ana.id, admin);
  const luis = await book('Consulta Luis (e2e)', at(12, 0));

  // ── HTTP app ─────────────────────────────────────────────────────────────
  const app = moduleRef.createNestApplication();
  app.use((req, _res, next) => {
    // Test-only: the contact's latest link, as the notification would carry it.
    if (req.path === '/__e2e/contact-link') {
      ds.query(
        `SELECT payload->>'manage_url' AS url FROM core.outbox_events
          WHERE organization_id = $1 AND payload->>'appointment_id' = $2 AND payload->>'manage_url' IS NOT NULL
          ORDER BY seq DESC LIMIT 1`,
        [org, String(req.query.appointment_id)],
      ).then(([row]) => _res.json({ url: row?.url ?? null }), next);
      return;
    }
    if (req.headers.authorization) {
      const role = req.headers['x-e2e-role'] || 'admin';
      req.user = { id: 'e2e-user', auth_user_id: 'e2e', email: null, organization_id: org, role, is_platform_admin: false };
      req.tenant = { organization_id: org, user_id: null, role };
    }
    next();
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(Number(process.env.E2E_PORT || 0), '127.0.0.1');

  const state = {
    apiUrl: `http://127.0.0.1:${app.getHttpServer().address().port}`,
    organizationId: org,
    calendarId: calendar.id,
    timezone: TZ,
    day,
    appointments: { ana: ana.id, luis: luis.id },
  };
  if (process.env.E2E_STATE_FILE) fs.writeFileSync(process.env.E2E_STATE_FILE, JSON.stringify(state));
  console.log(JSON.stringify(state));

  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
