/**
 * Runs against a real PostgreSQL built from packages/database/schemas:
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @crm/api test scheduling.integration
 * Skipped when TEST_DATABASE_URL is not set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { WorkScheduleEntity } from './work-schedule.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { UserEntity } from '../users/user.entity';
import { PaymentEntity } from '../payments/entities/payment.entity';
import { PaymentServiceEntity } from '../payments/entities/payment-service.entity';
import { CalendarService } from './calendar.service';
import { AvailabilityService } from './availability.service';
import { BookingLinksService } from './booking-links.service';
import { AppointmentEventsPublisher } from './appointment-events.publisher';
import { SchedulingService } from './scheduling.service';
import { SchedulingActor } from './scheduling.types';
import { PaymentsService } from '../payments/payments.service';
import { PaymentServiceService } from '../payments/payment-service.service';
import { PaymentSettingsService } from '../payments/payment-settings.service';
import { ScheduledActionService } from '../automation-engine/scheduled-action.service';
import { ScheduledActionEntity } from '../automation-engine/scheduled-action.entity';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { OutboxEventEntity } from '../../infrastructure/outbox/outbox-event.entity';
import { AppointmentReminderEntity } from './appointment-reminder.entity';
import { of, throwError } from 'rxjs';
import { ensureSystemCalendar } from './system-calendars';
import { CalendarSystemKey } from '@crm/shared';
import { addDays, localDate, zonedTimeToUtc } from './domain/timezone';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const TZ = 'America/Mexico_City';

jest.setTimeout(60_000);

describeDb('scheduling against PostgreSQL', () => {
  let ds: DataSource;
  let suiteLock: QueryRunner;
  let calendars: CalendarService;
  let availability: AvailabilityService;
  let scheduling: SchedulingService;
  let payments: PaymentsService;
  let links: BookingLinksService;
  const emitted: Array<{ queue: string; data: Record<string, unknown> }> = [];
  let brokerDown = false;
  const rmq = {
    emit: (queue: string, data: Record<string, unknown>) => {
      if (brokerDown) return throwError(() => new Error('broker unreachable'));
      emitted.push({ queue, data });
      return of(undefined);
    },
  };
  let outbox: OutboxService;
  let actions: ScheduledActionService;
  const sequences = { advanceOrComplete: jest.fn(async () => undefined) };
  const stripeSessions: Array<Record<string, unknown>> = [];
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          const session = { id: `cs_test_${randomUUID()}`, url: 'https://stripe.test/pay', ...params };
          stripeSessions.push(session);
          return session;
        },
      },
    },
  };

  let org: string;
  let contact: string;
  let otherContact: string;
  let calendar: string;
  const owner: SchedulingActor = { kind: 'user', userId: null, role: 'owner' };
  const agent: SchedulingActor = { kind: 'user', userId: null, role: 'agent' };
  const ai: SchedulingActor = { kind: 'ai' };

  /** A future local wall-clock time on the test calendar. */
  const at = (daysAhead: number, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const date = addDays(localDate(new Date(), TZ), daysAhead);
    return zonedTimeToUtc(date, h * 60 + m, TZ) as Date;
  };
  const iso = (d: Date) => d.toISOString();
  /** Publishes what the outbox holds, then lists this organization's events. */
  const flush = async () => {
    await outbox.relay();
  };
  const mine = () => emitted.filter((e) => e.data.organization_id === org);
  const queues = () => mine().map((e) => e.queue);

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      url,
      entities: [`${__dirname}/../../**/*.entity.ts`],
    });
    await ds.initialize();
    // Suites sharing TEST_DATABASE_URL also share the outbox: one at a time, or each relay would publish the other's events.
    suiteLock = ds.createQueryRunner();
    await suiteLock.connect();
    await suiteLock.query('SELECT pg_advisory_lock(727274)');

    const config = {
      get: (key: string, def?: unknown) =>
        ({ 'scheduling.linkSecret': 'integration-test-secret-0123456789', 'webhooks.baseUrl': 'https://api.test' })[key] ??
        def,
    } as unknown as ConfigService;

    calendars = new CalendarService(ds.getRepository(WorkScheduleEntity));
    availability = new AvailabilityService(ds.getRepository(AppointmentEntity), calendars);
    links = new BookingLinksService(config);
    outbox = new OutboxService(ds.getRepository(OutboxEventEntity), rmq as never);
    const events = new AppointmentEventsPublisher(outbox, undefined);
    scheduling = new SchedulingService(
      ds.getRepository(AppointmentEntity),
      ds.getRepository(ContactEntity),
      calendars,
      availability,
      links,
      events,
    );
    const settings = {
      getStripeClient: async () => stripe,
      getRaw: async () => ({ currency: 'usd' }),
    } as unknown as PaymentSettingsService;
    payments = new PaymentsService(
      ds.getRepository(PaymentEntity),
      ds.getRepository(ContactEntity),
      ds.getRepository(AppointmentEntity),
      ds.getRepository(UserEntity),
      settings,
      new PaymentServiceService(ds.getRepository(PaymentServiceEntity)),
      scheduling,
      calendars,
      config,
      outbox,
    );
    actions = new ScheduledActionService(
      ds.getRepository(ScheduledActionEntity),
      ds.getRepository(WorkScheduleEntity),
      ds.getRepository(ContactEntity),
      sequences as never,
    );
  });

  afterAll(async () => {
    outbox?.onModuleDestroy();
    await suiteLock?.query('SELECT pg_advisory_unlock(727274)');
    await suiteLock?.release();
    await ds?.destroy();
  });

  beforeEach(async () => {
    await outbox.relay();
    emitted.length = 0;
    brokerDown = false;
    stripeSessions.length = 0;
    org = randomUUID();
    contact = randomUUID();
    otherContact = randomUUID();
    await ds.query(`INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Clinic', $2)`, [org, `clinic-${org}`]);
    await ds.query(
      `INSERT INTO clients.contacts (id, organization_id, first_name, last_name, email, phone)
       VALUES ($1, $3, 'Ana', 'Pérez', 'ana@example.com', '+5215550000000'), ($2, $3, 'Luis', NULL, 'luis@example.com', NULL)`,
      [contact, otherContact, org],
    );
    await calendars.seedDefaultCalendars(org);
    const cal = await calendars.getDefaultCalendar(org);
    calendar = cal.id;
    await calendars.updateCalendarConfig(org, calendar, {
      timezone: TZ,
      work_days: [0, 1, 2, 3, 4, 5, 6],
      start_time: '09:00',
      end_time: '18:00',
      slot_duration_minutes: 30,
    });
  });

  const book = (startsAt: Date, actor: SchedulingActor = agent, extra: Record<string, unknown> = {}) =>
    scheduling.createBooking(
      org,
      { contact_id: contact, calendar_id: calendar, title: 'Consulta', starts_at: iso(startsAt), duration_minutes: 30, ...extra },
      actor,
    );

  describe('booking', () => {
    it('books inside local hours as awaiting confirmation and asks the contact to confirm', async () => {
      const appt = await book(at(7, '10:00'));
      expect(appt.status).toBe('scheduled');
      expect(appt.timezone).toBe(TZ);
      expect(appt.origin).toBe('human');
      await flush();
      expect(queues()).toEqual([RABBITMQ_QUEUES.APPOINTMENT_CREATED, RABBITMQ_QUEUES.APPOINTMENT_CONFIRMATION_REQUESTED]);
      const request = mine()[1].data;
      expect(String(request.confirm_url)).toMatch(/^https:\/\/api\.test\/api\/v1\/public\/appointments\/confirm\?token=/);
      expect(request.event_id).toEqual(expect.any(String));
    });

    it('rejects times outside local working hours and overlaps with a structured 409', async () => {
      await expect(book(at(7, '08:30'))).rejects.toMatchObject({
        status: 409,
        response: { errors: { code: 'SLOT_NOT_AVAILABLE', violations: ['outside_working_hours'] } },
      });
      await book(at(7, '10:00'));
      await expect(book(at(7, '10:15'))).rejects.toMatchObject({
        response: { errors: { violations: ['conflict'] } },
      });
      await expect(book(at(7, '10:30'))).resolves.toMatchObject({ status: 'scheduled' });
    });

    it('keeps the calendar buffer between bookings', async () => {
      await calendars.updateCalendarConfig(org, calendar, { buffer_minutes: 15 });
      await book(at(7, '10:00'));
      await expect(book(at(7, '10:30'))).rejects.toMatchObject({ status: 409 });
      await expect(book(at(7, '10:45'))).resolves.toBeDefined();
    });

    it('lets only owners/admins override, and records who, when and why', async () => {
      const outside = at(7, '20:00');
      await expect(book(outside, agent, { override: { reason: 'VIP' } })).rejects.toMatchObject({ status: 403 });
      const appt = await book(outside, owner, { override: { reason: 'VIP patient' } });
      expect(appt.override_at).toBeInstanceOf(Date);
      expect(appt.override_reason).toBe('VIP patient [outside_working_hours]');

      // An overridden double booking is allowed and does not break the database constraint.
      const doubled = await book(outside, owner, { override: { reason: 'Second chair' } });
      expect(doubled.override_reason).toContain('conflict');
    });

    it('lets exactly one of many concurrent requests take a slot', async () => {
      const slot = at(8, '11:00');
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => book(slot)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')) {
        expect(r.reason).toMatchObject({ status: 409 });
      }
    });

    it('refuses to book another organization’s contact', async () => {
      const stranger = randomUUID();
      const otherOrg = randomUUID();
      await ds.query(`INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Other', $2)`, [otherOrg, `o-${otherOrg}`]);
      await ds.query(`INSERT INTO clients.contacts (id, organization_id, first_name) VALUES ($1, $2, 'X')`, [stranger, otherOrg]);
      await expect(book(at(7, '12:00'), agent, { contact_id: stranger })).rejects.toMatchObject({ status: 404 });
    });

    it('asks staff to charge or waive on a charging calendar, and sends the AI to a payment link', async () => {
      const service = await ds.getRepository(PaymentServiceEntity).save({ organization_id: org, name: 'Consulta', amount: 5000 });
      await calendars.updateCalendar(org, calendar, { payment_service_id: service.id });

      await expect(book(at(7, '10:00'))).rejects.toMatchObject({ response: { errors: { code: 'PAYMENT_REQUIRED' } } });
      await expect(book(at(7, '10:00'), ai)).rejects.toMatchObject({
        status: 400,
        response: { message: 'use create_payment_link; appointment is created after payment' },
      });
      const waived = await book(at(7, '10:00'), { ...agent, userId: null }, { waive_payment: true });
      expect(waived.status).toBe('scheduled');
    });
  });

  describe('availability', () => {
    it('offers local slots, hides taken ones and never offers the past', async () => {
      const day = addDays(localDate(new Date(), TZ), 7);
      const before = await availability.getAvailability(org, { from: day, to: day, calendar_id: calendar });
      expect(before.timezone).toBe(TZ);
      expect(before.slots).toHaveLength(18);
      expect(before.slots[0].starts_at).toBe(iso(at(7, '09:00')));

      await book(at(7, '09:30'));
      const after = await availability.getAvailability(org, { from: day, to: day, calendar_id: calendar });
      expect(after.slots.map((s) => s.starts_at)).not.toContain(iso(at(7, '09:30')));
      expect(after.slots).toHaveLength(17);

      const yesterday = addDays(localDate(new Date(), TZ), -1);
      const past = await availability.getAvailability(org, { from: yesterday, to: yesterday, calendar_id: calendar });
      expect(past.slots).toEqual([]);
    });

    it('does not count follow-up steps as busy', async () => {
      await actions.create(org, { contact_id: contact, action: 'send_message', due_at: at(7, '10:00') });
      await expect(book(at(7, '10:00'))).resolves.toMatchObject({ status: 'scheduled' });
    });
  });

  describe('confirmation link and lifecycle', () => {
    const tokenOf = (confirmUrl: unknown) => decodeURIComponent(String(confirmUrl).split('token=')[1].split('&')[0]);

    it('confirms once from the link; a reschedule invalidates the old link and asks again', async () => {
      const appt = await book(at(7, '10:00'));
      await flush();
      const token = tokenOf(mine()[1].data.confirm_url);

      expect((await scheduling.describeConfirmation(token)).state).toBe('confirmed');
      expect((await scheduling.findById(appt.id, org)).status).toBe('scheduled');

      const first = await scheduling.confirmByContact(token, 'email');
      expect(first.state).toBe('confirmed');
      expect(first.appointment?.confirmed_via).toBe('email_link');
      expect((await scheduling.confirmByContact(token, 'email')).state).toBe('already_confirmed');
      await flush();
      expect(queues().filter((q) => q === RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED)).toHaveLength(1);

      emitted.length = 0;
      const moved = await scheduling.reschedule(org, appt.id, { starts_at: iso(at(7, '11:00')) }, agent);
      expect(moved.status).toBe('scheduled');
      expect(moved.confirmation_version).toBe(2);
      await flush();
      expect(queues()).toEqual([RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED, RABBITMQ_QUEUES.APPOINTMENT_CONFIRMATION_REQUESTED]);
      expect((await scheduling.confirmByContact(token, 'email')).state).toBe('outdated');
      expect((await scheduling.confirmByContact(tokenOf(mine()[1].data.confirm_url), 'sms')).state).toBe('confirmed');
    });

    it('rejects forged tokens', async () => {
      expect((await scheduling.describeConfirmation('abc.def')).state).toBe('invalid');
    });

    it('enforces the status rules', async () => {
      const appt = await book(at(7, '10:00'));
      await expect(scheduling.complete(org, appt.id, agent)).rejects.toMatchObject({
        response: { errors: { code: 'NOT_STARTED' } },
      });
      const cancelled = await scheduling.cancel(org, appt.id, agent, 'contact');
      expect(cancelled).toMatchObject({ status: 'cancelled', cancel_reason: 'contact' });
      await expect(scheduling.cancel(org, appt.id, agent)).rejects.toMatchObject({
        response: { errors: { code: 'INVALID_TRANSITION' } },
      });
      await expect(scheduling.reschedule(org, appt.id, { starts_at: iso(at(7, '12:00')) }, agent)).rejects.toMatchObject({
        status: 409,
      });
      // The cancelled slot is free again.
      await expect(book(at(7, '10:00'))).resolves.toBeDefined();
    });

    it('lists and counts ended bookings nobody closed as needing an outcome', async () => {
      const past = randomUUID();
      await ds.query(
        `INSERT INTO scheduling.appointments (id, organization_id, calendar_id, contact_id, title, status, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, 'Ayer', 'confirmed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours')`,
        [past, org, calendar, contact],
      );
      const page = await scheduling.findAll(org, { calendar_id: calendar, needs_outcome: true });
      expect(page.items.map((a) => a.id)).toEqual([past]);
      expect((await scheduling.getMetrics(org, calendar)).needs_outcome_count).toBe(1);
      await scheduling.markNoShow(org, past, agent);
      expect((await scheduling.getMetrics(org, calendar)).needs_outcome_count).toBe(0);
    });

    it('only lets admins delete bookings, never upcoming or paid ones', async () => {
      const appt = await book(at(7, '10:00'));
      await expect(scheduling.delete(org, appt.id, agent)).rejects.toMatchObject({ status: 403 });
      await expect(scheduling.delete(org, appt.id, owner)).rejects.toMatchObject({
        response: { errors: { code: 'APPOINTMENT_UPCOMING' } },
      });
      await scheduling.cancel(org, appt.id, owner);
      await expect(scheduling.delete(org, appt.id, owner)).resolves.toBeUndefined();
    });
  });

  describe('calendars', () => {
    it('creates each system calendar once under concurrency', async () => {
      const fresh = randomUUID();
      await ds.query(`INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Fresh', $2)`, [fresh, `f-${fresh}`]);
      const repo = ds.getRepository(WorkScheduleEntity);
      await Promise.all(Array.from({ length: 8 }, () => ensureSystemCalendar(repo, fresh, CalendarSystemKey.FOLLOW_UP)));
      expect(await repo.count({ where: { organization_id: fresh, type: 'follow_up' } })).toBe(1);
    });

    it('blocks deleting a calendar with upcoming bookings and moves past ones to a target', async () => {
      const extra = await calendars.createCalendar(org, { name: 'Room 2' });
      expect(extra.timezone).toBe(TZ);
      await calendars.updateCalendarConfig(org, extra.id, { work_days: [0, 1, 2, 3, 4, 5, 6] });
      const upcoming = await scheduling.createBooking(
        org,
        { contact_id: contact, calendar_id: extra.id, title: 'x', starts_at: iso(at(7, '10:00')), duration_minutes: 30 },
        agent,
      );
      await expect(calendars.deleteCalendar(org, extra.id)).rejects.toMatchObject({
        response: { errors: { code: 'CALENDAR_HAS_UPCOMING_BOOKINGS', count: 1 } },
      });

      await scheduling.cancel(org, upcoming.id, agent);
      await ds.query(
        `INSERT INTO scheduling.appointments (organization_id, calendar_id, contact_id, title, status, starts_at, ends_at)
         VALUES ($1, $2, $3, 'Pasada', 'confirmed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes')`,
        [org, extra.id, contact],
      );
      await expect(calendars.deleteCalendar(org, extra.id)).rejects.toMatchObject({
        response: { errors: { code: 'CALENDAR_MOVE_TARGET_REQUIRED', count: 2 } },
      });
      await calendars.deleteCalendar(org, extra.id, calendar);
      const moved = await ds.getRepository(AppointmentEntity).find({ where: { organization_id: org, calendar_id: calendar } });
      expect(moved).toHaveLength(2);
      expect(moved.find((a) => a.title === 'Pasada')?.override_reason).toContain('Room 2');

      const followUp = await ensureSystemCalendar(ds.getRepository(WorkScheduleEntity), org, CalendarSystemKey.FOLLOW_UP);
      await expect(calendars.deleteCalendar(org, followUp.id)).rejects.toMatchObject({
        response: { errors: { code: 'CALENDAR_IS_SYSTEM' } },
      });
    });

    it('rejects start_time after end_time', async () => {
      await expect(calendars.updateCalendarConfig(org, calendar, { start_time: '19:00' })).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('paid bookings', () => {
    let serviceId: string;

    beforeEach(async () => {
      const service = await ds.getRepository(PaymentServiceEntity).save({ organization_id: org, name: 'Consulta', amount: 5000 });
      serviceId = service.id;
      await calendars.updateCalendar(org, calendar, { payment_service_id: serviceId });
    });

    const link = (startsAt: Date, who = contact) =>
      payments.createCheckoutLink(org, {
        contact_id: who,
        service_id: serviceId,
        booking: { starts_at: iso(startsAt), duration_minutes: 30 },
      });
    const paidEvent = (sessionId: string, payment_status = 'paid', type = 'checkout.session.completed') =>
      ({ type, data: { object: { id: sessionId, payment_status, payment_intent: 'pi_1' } } }) as never;

    it('holds the slot while the contact pays and confirms it when paid (once)', async () => {
      const result = await link(at(7, '10:00'));
      const hold = await scheduling.findById(result.appointment_id as string, org);
      expect(hold).toMatchObject({ status: 'held', payment_id: result.payment_id });
      expect(stripeSessions[0]).toMatchObject({ payment_method_types: ['card'] });
      expect(stripeSessions[0].expires_at).toBe(Math.floor(new Date(result.hold_expires_at as string).getTime() / 1000));

      // Nobody else can take it meanwhile.
      await expect(link(at(7, '10:00'), otherContact)).rejects.toMatchObject({ status: 409 });

      const sessionId = String(stripeSessions[0].id);
      await Promise.all(Array.from({ length: 5 }, () => payments.handleWebhookEvent(org, paidEvent(sessionId))));

      const confirmed = await scheduling.findById(hold.id, org);
      expect(confirmed).toMatchObject({ status: 'confirmed', confirmed_via: 'payment' });
      await flush();
      expect(queues().filter((q) => q === RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED)).toHaveLength(1);
      expect(queues().filter((q) => q === RABBITMQ_QUEUES.PAYMENT_COMPLETED)).toHaveLength(1);
      expect(await ds.getRepository(AppointmentEntity).count({ where: { payment_id: result.payment_id } })).toBe(1);
    });

    it('waits for delayed payment methods instead of confirming an unpaid checkout', async () => {
      const result = await link(at(7, '10:00'));
      const sessionId = String(stripeSessions[0].id);
      await payments.handleWebhookEvent(org, paidEvent(sessionId, 'unpaid'));
      expect((await scheduling.findById(result.appointment_id as string, org)).status).toBe('held');
      expect((await ds.getRepository(PaymentEntity).findOneByOrFail({ id: result.payment_id })).status).toBe('pending');

      await payments.handleWebhookEvent(org, paidEvent(sessionId, 'paid', 'checkout.session.async_payment_succeeded'));
      expect((await scheduling.findById(result.appointment_id as string, org)).status).toBe('confirmed');
    });

    it('releases the slot when the checkout expires', async () => {
      const result = await link(at(7, '10:00'));
      await payments.handleWebhookEvent(org, paidEvent(String(stripeSessions[0].id), 'unpaid', 'checkout.session.expired'));
      expect(await scheduling.findById(result.appointment_id as string, org)).toMatchObject({
        status: 'cancelled',
        cancel_reason: 'payment_not_received',
      });
      await expect(link(at(7, '10:00'), otherContact)).resolves.toBeDefined();
    });

    it('frees expired holds for other bookings and flags a late payment for manual follow-up', async () => {
      const result = await link(at(7, '10:00'));
      await ds.query(`UPDATE scheduling.appointments SET hold_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [
        result.appointment_id,
      ]);
      // Another contact books the slot (staff, waived) — the expired hold is released on the way.
      await book(at(7, '10:00'), agent, { contact_id: otherContact, waive_payment: true });

      await payments.handleWebhookEvent(org, paidEvent(String(stripeSessions[0].id)));
      const payment = await ds.getRepository(PaymentEntity).findOneByOrFail({ id: result.payment_id });
      expect(payment).toMatchObject({ status: 'paid', attention_reason: 'slot_unavailable' });
      expect(await payments.findNeedingAttention(org)).toHaveLength(1);

      const rebooked = await book(at(8, '10:00'), agent, { waive_payment: true });
      await payments.resolveAttention(org, payment.id, { resolution: 'rebooked' as never, appointment_id: rebooked.id }, null);
      expect(await scheduling.findById(rebooked.id, org)).toMatchObject({ status: 'confirmed', payment_id: payment.id });
      expect(await payments.findNeedingAttention(org)).toHaveLength(0);
    });

    it('takes the slot back when the payment lands just after the hold expired', async () => {
      const result = await link(at(7, '10:00'));
      await ds.query(`UPDATE scheduling.appointments SET hold_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [
        result.appointment_id,
      ]);
      await scheduling.releaseAllExpiredHolds();
      await payments.handleWebhookEvent(org, paidEvent(String(stripeSessions[0].id)));
      expect(await scheduling.findById(result.appointment_id as string, org)).toMatchObject({
        status: 'confirmed',
        cancel_reason: null,
      });
    });

    it('flags the payment when a paid appointment is cancelled (no automatic refund)', async () => {
      const result = await link(at(7, '10:00'));
      await payments.handleWebhookEvent(org, paidEvent(String(stripeSessions[0].id)));
      await scheduling.cancel(org, result.appointment_id as string, agent, 'contact');
      const payment = await ds.getRepository(PaymentEntity).findOneByOrFail({ id: result.payment_id });
      expect(payment).toMatchObject({ status: 'paid', attention_reason: 'appointment_cancelled' });
      await payments.resolveAttention(org, payment.id, { resolution: 'refunded_manually' as never, note: 'Stripe dashboard' }, null);
      expect(await ds.getRepository(PaymentEntity).findOneByOrFail({ id: payment.id })).toMatchObject({
        status: 'refunded',
        resolution: 'refunded_manually',
      });
    });

    it('refuses to book a calendar that charges a different service', async () => {
      const other = await ds.getRepository(PaymentServiceEntity).save({ organization_id: org, name: 'Cheap', amount: 100 });
      await expect(
        payments.createCheckoutLink(org, {
          contact_id: contact,
          service_id: other.id,
          booking: { calendar_id: calendar, starts_at: iso(at(7, '10:00')), duration_minutes: 30 },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('keeps payments when the contact is deleted', async () => {
      const result = await link(at(7, '10:00'));
      await payments.handleWebhookEvent(org, paidEvent(String(stripeSessions[0].id)));
      await scheduling.cancel(org, result.appointment_id as string, agent);
      await ds.query(`DELETE FROM clients.contacts WHERE id = $1`, [contact]);
      expect(await ds.getRepository(PaymentEntity).findOneByOrFail({ id: result.payment_id })).toMatchObject({
        contact_id: null,
        contact_name: 'Ana Pérez',
      });
    });
  });

  describe('appointment reminders', () => {
    const reminderRows = (appointmentId: string) =>
      ds.getRepository(AppointmentReminderEntity).find({ where: { appointment_id: appointmentId }, order: { offset_minutes: 'DESC' } });

    it('creates reminders from the calendar offsets, moves them on reschedule and drops them on cancel', async () => {
      const appt = await book(at(7, '10:00'));
      let rows = await reminderRows(appt.id);
      expect(rows.map((r) => [r.offset_minutes, r.status])).toEqual([
        [1440, 'pending'],
        [120, 'pending'],
      ]);
      expect(rows[0].due_at.getTime()).toBe(at(7, '10:00').getTime() - 1440 * 60_000);

      await scheduling.reschedule(org, appt.id, { starts_at: iso(at(8, '12:00')) }, agent);
      rows = await reminderRows(appt.id);
      expect(rows[1].due_at.getTime()).toBe(at(8, '12:00').getTime() - 120 * 60_000);

      await scheduling.cancel(org, appt.id, agent);
      rows = await reminderRows(appt.id);
      expect(rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    });

    it('skips offsets that are already in the past', async () => {
      const soon = await book(new Date(Date.now() + 3 * 3_600_000), owner, { override: { reason: 'test' } });
      expect((await reminderRows(soon.id)).map((r) => r.offset_minutes)).toEqual([120]);
    });

    it('sends each due reminder once; unconfirmed bookings are asked to confirm', async () => {
      const unconfirmed = await book(at(7, '10:00'));
      const confirmed = await book(at(7, '11:00'));
      await scheduling.confirmByStaff(org, confirmed.id, agent);
      await ds.query(
        `UPDATE scheduling.appointment_reminders SET due_at = NOW() - INTERVAL '1 minute'
          WHERE appointment_id = ANY($1) AND offset_minutes = 1440`,
        [[unconfirmed.id, confirmed.id]],
      );
      await flush();
      emitted.length = 0;

      await Promise.all([scheduling.sendDueReminders(), scheduling.sendDueReminders()]);
      await flush();
      const due = mine().filter((e) => e.queue === RABBITMQ_QUEUES.APPOINTMENT_REMINDER_DUE);
      expect(due).toHaveLength(2);
      const byAppt = new Map(due.map((e) => [e.data.appointment_id, e.data]));
      expect(byAppt.get(unconfirmed.id)?.confirm_url).toEqual(expect.stringContaining('/public/appointments/confirm?token='));
      expect(byAppt.get(confirmed.id)?.confirm_url).toBeNull();
      expect(byAppt.get(confirmed.id)?.manage_url).toEqual(expect.stringContaining('token='));

      emitted.length = 0;
      await scheduling.sendDueReminders();
      await flush();
      expect(mine()).toHaveLength(0);
    });
  });

  describe('outbox', () => {
    it('stores events with the change and publishes them once the broker is back', async () => {
      brokerDown = true;
      const appt = await book(at(7, '10:00'));
      await outbox.relay();
      expect(queues()).toEqual([]);
      const [{ count }] = await ds.query(
        `SELECT count(*)::int AS count FROM core.outbox_events WHERE organization_id = $1 AND published_at IS NULL AND attempts > 0`,
        [org],
      );
      expect(count).toBe(2);

      brokerDown = false;
      await ds.query(`UPDATE core.outbox_events SET available_at = NOW() WHERE organization_id = $1`, [org]);
      await flush();
      expect(queues()).toEqual([RABBITMQ_QUEUES.APPOINTMENT_CREATED, RABBITMQ_QUEUES.APPOINTMENT_CONFIRMATION_REQUESTED]);
      expect(mine()[0].data.appointment_id).toBe(appt.id);
    });

    it('emits nothing when the change is rolled back', async () => {
      await book(at(7, '10:00'));
      await flush();
      emitted.length = 0;
      await expect(book(at(7, '10:00'))).rejects.toMatchObject({ status: 409 });
      await flush();
      expect(mine()).toHaveLength(0);
    });
  });

  describe('follow-up steps (scheduled actions)', () => {
    it('lives on the follow-up calendar, never in appointments', async () => {
      const step = await actions.create(org, { contact_id: contact, action: 'send_message', due_at: new Date() });
      const followUp = await ensureSystemCalendar(ds.getRepository(WorkScheduleEntity), org, CalendarSystemKey.FOLLOW_UP);
      expect(step).toMatchObject({ calendar_id: followUp.id, status: 'pending', timezone: TZ });
      expect(await ds.getRepository(AppointmentEntity).count({ where: { organization_id: org } })).toBe(0);
      await expect(
        actions.create(org, { contact_id: contact, action: 'send_message', due_at: new Date(), calendar_id: calendar }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('never undoes a completion and advances the sequence only once', async () => {
      const seq = randomUUID();
      await ds.query(
        `INSERT INTO scheduling.automation_sequences (id, organization_id, contact_id) VALUES ($1, $2, $3)`,
        [seq, org, contact],
      );
      const step = await actions.create(org, { contact_id: contact, action: 'send_message', due_at: new Date(), sequence_id: seq });
      sequences.advanceOrComplete.mockClear();

      expect(await actions.markProcessing(org, step.id)).toBe(true);
      expect(await actions.markProcessing(org, step.id)).toBe(false);
      await actions.complete(org, step.id, { resolvedChannel: 'whatsapp' });
      await actions.complete(org, step.id, { resolvedChannel: 'whatsapp' });
      expect(sequences.advanceOrComplete).toHaveBeenCalledTimes(1);
      // The stuck-step reaper arriving late must not put it back to pending (which would send it again).
      expect(await actions.markFailed(org, step.id, 'timeout')).toBe('missing');
      expect((await actions.findById(step.id, org)).status).toBe('completed');
    });

    it('hands person-executed steps over and lets a person complete them', async () => {
      const step = await actions.create(org, { contact_id: contact, action: 'call', executor: 'user', due_at: new Date() });
      await actions.markProcessing(org, step.id);
      expect(await actions.markAwaitingUser(org, step.id)).toBe(true);
      expect((await actions.getMetrics(org)).awaiting_user_count).toBe(1);
      const done = await actions.complete(org, step.id, { completedBy: null });
      expect(done.status).toBe('completed');
    });

    it('skips a step, moves a pending one and lists by date', async () => {
      const later = await actions.create(org, { contact_id: contact, action: 'send_email', due_at: at(3, '10:00') });
      const sooner = await actions.create(org, { contact_id: contact, action: 'send_message', due_at: at(2, '10:00') });
      const moved = await actions.reschedule(org, later.id, at(1, '10:00'));
      expect(moved.due_at.getTime()).toBe(at(1, '10:00').getTime());
      const page = await actions.findAll(org, { from: iso(at(0, '00:00')), sort: 'asc' });
      expect(page.items.map((i) => i.id)).toEqual([later.id, sooner.id]);
      await actions.skip(org, sooner.id);
      await expect(actions.skip(org, sooner.id)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('staff calendars and booking windows', () => {
    it('never overlaps the same person across their calendars, even concurrently', async () => {
      const staff = randomUUID();
      await ds.query(
        `INSERT INTO core.users (id, organization_id, email, full_name, role) VALUES ($1, $2, $3, 'Dra. Ruiz', 'agent')`,
        [staff, org, `ruiz-${staff}@x.test`],
      );
      const room2 = await calendars.createCalendar(org, { name: 'Room 2' });
      for (const id of [calendar, room2.id]) {
        await calendars.updateCalendarConfig(org, id, { owner_user_id: staff, work_days: [0, 1, 2, 3, 4, 5, 6] });
      }
      const other = await calendars.createCalendar(org, { name: 'Room 3' });
      await calendars.updateCalendarConfig(org, other.id, { work_days: [0, 1, 2, 3, 4, 5, 6] });

      const onRoom = (cal: string, when: Date) => book(when, agent, { calendar_id: cal });
      const first = await onRoom(calendar, at(7, '10:00'));
      expect(first.assigned_to).toBe(staff);
      await expect(onRoom(room2.id, at(7, '10:00'))).rejects.toMatchObject({
        response: { errors: { violations: ['conflict'] } },
      });
      await expect(onRoom(other.id, at(7, '10:00'))).resolves.toBeDefined();

      const results = await Promise.allSettled([
        onRoom(calendar, at(8, '12:00')),
        onRoom(room2.id, at(8, '12:00')),
        onRoom(calendar, at(8, '12:00')),
        onRoom(room2.id, at(8, '12:00')),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('applies the minimum notice and the booking horizon', async () => {
      await calendars.updateCalendarConfig(org, calendar, {
        min_notice_minutes: 24 * 60,
        max_advance_days: 5,
        start_time: '00:00',
        end_time: '23:45',
      });
      await expect(book(new Date(Date.now() + 3_600_000))).rejects.toMatchObject({
        response: { errors: { violations: ['too_soon'] } },
      });
      await expect(book(at(7, '10:00'))).rejects.toMatchObject({
        response: { errors: { violations: ['too_far'] } },
      });
      await expect(book(at(3, '10:00'))).resolves.toBeDefined();
      const day = addDays(localDate(new Date(), TZ), 9);
      expect((await availability.getAvailability(org, { from: day, to: day, calendar_id: calendar })).slots).toEqual([]);
    });
  });

  describe('metrics', () => {
    it('counts "today" on the calendar wall clock and ignores cancellations', async () => {
      const todayLocal = localDate(new Date(), TZ);
      const startOfToday = zonedTimeToUtc(todayLocal, 0, TZ) as Date;
      await ds.query(
        `INSERT INTO scheduling.appointments (organization_id, calendar_id, contact_id, title, status, starts_at, ends_at, override_at)
         VALUES ($1, $2, $3, 'today', 'completed', $4, $4::timestamptz + INTERVAL '30 minutes', NOW()),
                ($1, $2, $3, 'today cancelled', 'cancelled', $4, $4::timestamptz + INTERVAL '30 minutes', NOW()),
                ($1, $2, $3, 'yesterday', 'completed', $5, $5::timestamptz + INTERVAL '30 minutes', NOW())`,
        [org, calendar, contact, new Date(startOfToday.getTime() + 60_000), new Date(startOfToday.getTime() - 60_000)],
      );
      const metrics = await scheduling.getMetrics(org, calendar);
      expect(metrics.today_count).toBe(1);
      expect(metrics.completed_count).toBe(2);
    });
  });
});
