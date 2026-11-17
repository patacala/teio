import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import {
  AppointmentCancelReason,
  AppointmentConfirmedVia,
  AppointmentStatus,
  PaymentAttentionReason,
} from '@crm/shared';
import { AppointmentEntity } from './appointment.entity';
import { AppointmentReminderEntity } from './appointment-reminder.entity';
import { WorkScheduleEntity } from './work-schedule.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { CalendarService } from './calendar.service';
import { AvailabilityResult, AvailabilityService } from './availability.service';
import { BookingLinksService } from './booking-links.service';
import { AppointmentEventsPublisher } from './appointment-events.publisher';
import { ACTIVE_BOOKING_STATUSES, canTransition, isReschedulable } from './domain/lifecycle';
import { addDays, localDate } from './domain/timezone';
import {
  BookingTx,
  SchedulingActor,
  SlotUnavailableException,
  isAdminActor,
  originForActor,
  userIdOf,
} from './scheduling.types';
import type {
  CreateAppointmentDto,
  ListAppointmentsQueryDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

export interface AppointmentPage {
  items: AppointmentEntity[];
  meta: { total: number; limit: number; offset: number };
}

export interface AppointmentMetrics {
  today_count: number;
  week_count: number;
  pending_count: number;
  completed_count: number;
  needs_outcome_count: number;
}

export interface HoldInput {
  calendarId: string;
  contactId: string;
  conversationId?: string | null;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  timezone?: string;
  origin: 'ai' | 'human' | 'webhook';
  createdBy?: string | null;
}

export interface PaidBookingInput {
  calendarId: string;
  contactId: string;
  conversationId?: string | null;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  timezone?: string;
  paymentId: string;
}

export type PaymentBookingOutcome =
  | { outcome: 'confirmed'; appointment: AppointmentEntity }
  | { outcome: 'already_confirmed'; appointment: AppointmentEntity }
  | { outcome: 'slot_unavailable'; appointment?: AppointmentEntity }
  | { outcome: 'appointment_cancelled'; appointment: AppointmentEntity }
  | { outcome: 'not_found' };

export type ContactConfirmationResult =
  | 'confirmed'
  | 'already_confirmed'
  | 'cancelled'
  | 'closed'
  | 'awaiting_payment'
  | 'outdated'
  | 'expired'
  | 'invalid';

/** What the contact's link can do with the booking right now. */
export interface ContactLinkView {
  state: ContactConfirmationResult;
  appointment?: AppointmentEntity;
  canConfirm: boolean;
  canChange: boolean;
}

export type ContactActionResult =
  | { state: 'rescheduled' | 'cancelled'; appointment: AppointmentEntity }
  | { state: Exclude<ContactConfirmationResult, 'confirmed' | 'already_confirmed'>; appointment?: AppointmentEntity }
  | { state: 'slot_unavailable'; appointment: AppointmentEntity };

/** Raw `UPDATE … RETURNING` through EntityManager.query resolves to [rows, affectedCount] on Postgres. */
function returnedRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly repo: Repository<AppointmentEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    private readonly calendars: CalendarService,
    private readonly availability: AvailabilityService,
    private readonly links: BookingLinksService,
    private readonly events: AppointmentEventsPublisher,
  ) {}

  // ── Transactions ────────────────────────────────────────────────────────

  /** Runs `fn` in a transaction; effects registered with afterCommit run only if it commits. */
  async inTransaction<T>(fn: (tx: BookingTx) => Promise<T>): Promise<T> {
    const effects: Array<() => void> = [];
    const result = await this.repo.manager.transaction((manager) =>
      fn({ manager, afterCommit: (effect) => effects.push(effect) }),
    );
    for (const effect of effects) {
      try {
        effect();
      } catch (err) {
        this.logger.warn(`Post-commit effect failed: ${(err as Error).message}`);
      }
    }
    return result;
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  async findAll(organizationId: string, filters: ListAppointmentsQueryDto = {}): Promise<AppointmentPage> {
    const { from, to, status, cursor, calendar_id, contact_id, needs_outcome, sort = 'desc' } = filters;
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const direction = sort === 'asc' ? 'ASC' : 'DESC';

    const qb = this.repo
      .createQueryBuilder('appt')
      .leftJoinAndSelect('appt.contact', 'contact')
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .orderBy('appt.starts_at', direction)
      // starts_at collides for back-to-back bookings; without a tiebreaker
      // rows shuffle between pages.
      .addOrderBy('appt.id', direction);

    if (cursor) {
      qb.andWhere(direction === 'ASC' ? 'appt.starts_at > :cursor' : 'appt.starts_at < :cursor', {
        cursor: new Date(cursor),
      });
    }
    if (from) qb.andWhere('appt.starts_at >= :from', { from: new Date(from) });
    if (to) qb.andWhere('appt.starts_at <= :to', { to: new Date(to) });
    if (status) qb.andWhere('appt.status = :status', { status });
    if (calendar_id) qb.andWhere('appt.calendar_id = :calId', { calId: calendar_id });
    if (contact_id) qb.andWhere('appt.contact_id = :contactId', { contactId: contact_id });
    if (needs_outcome) {
      qb.andWhere('appt.status IN (:...open)', {
        open: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, 'pending'],
      }).andWhere('appt.ends_at < NOW()');
    }

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { items, meta: { total, limit, offset } };
  }

  async findById(id: string, organizationId: string): Promise<AppointmentEntity> {
    const appt = await this.repo
      .createQueryBuilder('appt')
      .leftJoinAndSelect('appt.contact', 'contact')
      .where('appt.id = :id', { id })
      .andWhere('appt.organization_id = :orgId', { orgId: organizationId })
      .getOne();
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    return appt;
  }

  /** Upcoming bookings — also the AI agent's context. */
  async findUpcomingForContact(organizationId: string, contactId: string, limit = 5): Promise<AppointmentEntity[]> {
    return this.repo
      .createQueryBuilder('appt')
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .andWhere('appt.contact_id = :contactId', { contactId })
      .andWhere('appt.ends_at >= NOW()')
      .andWhere('appt.status IN (:...active)', { active: [...ACTIVE_BOOKING_STATUSES] })
      .andWhere(`(appt.status <> 'held' OR appt.hold_expires_at > NOW())`)
      .orderBy('appt.starts_at', 'ASC')
      .take(limit)
      .getMany();
  }

  /** Counts in the calendar's time zone (the organization's when no calendar is given). */
  async getMetrics(organizationId: string, calendarId?: string): Promise<AppointmentMetrics> {
    const calendar = calendarId ? await this.calendars.getCalendarById(organizationId, calendarId) : null;
    const timezone = calendar?.timezone ?? (await this.calendars.getOrganizationTimezone(organizationId));

    const localStart = `(appt.starts_at AT TIME ZONE :tz)`;
    const weekStart = `date_trunc('week', NOW() AT TIME ZONE :tz)`;
    const qb = this.repo
      .createQueryBuilder('appt')
      .select([
        `COUNT(*) FILTER (WHERE appt.status <> 'cancelled' AND ${localStart}::date = (NOW() AT TIME ZONE :tz)::date)::int AS today_count`,
        `COUNT(*) FILTER (WHERE appt.status <> 'cancelled' AND ${localStart} >= ${weekStart} AND ${localStart} < ${weekStart} + INTERVAL '7 days')::int AS week_count`,
        `COUNT(*) FILTER (WHERE appt.status IN ('held', 'scheduled', 'pending') AND appt.ends_at >= NOW())::int AS pending_count`,
        `COUNT(*) FILTER (WHERE appt.status = 'completed')::int AS completed_count`,
        `COUNT(*) FILTER (WHERE appt.status IN ('scheduled', 'confirmed', 'pending') AND appt.ends_at < NOW())::int AS needs_outcome_count`,
      ])
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .setParameter('tz', timezone);
    if (calendarId) qb.andWhere('appt.calendar_id = :calId', { calId: calendarId });

    const row = await qb.getRawOne<Record<string, string | number>>();
    const n = (key: string) => Number(row?.[key] ?? 0);
    return {
      today_count: n('today_count'),
      week_count: n('week_count'),
      pending_count: n('pending_count'),
      completed_count: n('completed_count'),
      needs_outcome_count: n('needs_outcome_count'),
    };
  }

  // ── Booking creation ────────────────────────────────────────────────────

  /** Books an appointment (status `scheduled`, awaiting the contact's confirmation). */
  async createBooking(
    organizationId: string,
    dto: CreateAppointmentDto,
    actor: SchedulingActor,
  ): Promise<AppointmentEntity> {
    const calendar = await this.calendars.getCalendarById(organizationId, dto.calendar_id);
    await this.assertContact(organizationId, dto.contact_id);
    if (dto.conversation_id) await this.assertConversation(organizationId, dto.conversation_id);

    if (dto.override && !isAdminActor(actor)) {
      throw new ForbiddenException('Only owners and admins can override calendar rules');
    }

    let paymentWaivedBy: string | null = null;
    if (calendar.payment_service_id) {
      if (actor.kind !== 'user') {
        throw new BadRequestException('use create_payment_link; appointment is created after payment');
      }
      if (!dto.waive_payment) {
        throw new ConflictException({
          message: 'This calendar charges for bookings: send a payment link or book it without charge',
          errors: { code: 'PAYMENT_REQUIRED', payment_service_id: calendar.payment_service_id },
        });
      }
      paymentWaivedBy = actor.userId ?? null;
    }

    const startsAt = new Date(dto.starts_at);
    const endsAt = new Date(startsAt.getTime() + dto.duration_minutes * 60_000);

    return this.inTransaction(async (tx) => {
      const locked = await this.lockCalendar(tx.manager, organizationId, calendar.id);
      await this.releaseExpiredHolds(tx, locked.id);
      const violations = await this.availability.assertBookable(tx.manager, locked, startsAt, endsAt, {
        override: !!dto.override,
      });

      const saved = await this.insert(
        tx.manager,
        tx.manager.getRepository(AppointmentEntity).create({
          organization_id: organizationId,
          calendar_id: locked.id,
          contact_id: dto.contact_id,
          conversation_id: dto.conversation_id,
          assigned_to: dto.assigned_to ?? locked.owner_user_id ?? undefined,
          title: dto.title,
          description: dto.description,
          location: dto.location,
          meeting_url: dto.meeting_url,
          status: AppointmentStatus.SCHEDULED,
          starts_at: startsAt,
          ends_at: endsAt,
          timezone: dto.timezone ?? locked.timezone,
          origin: originForActor(actor),
          created_by: userIdOf(actor) ?? undefined,
          payment_waived_by: paymentWaivedBy,
          ...this.overrideFields(violations, dto.override?.reason, actor),
        }),
      );

      await this.syncReminders(tx.manager, saved, locked);
      await this.events.created(tx, saved);
      await this.requestConfirmation(tx, saved);
      return saved;
    });
  }

  /**
   * Reserves a slot while the contact pays. The hold blocks the slot until
   * `hold_expires_at` (calendar `hold_minutes`) and is released if unpaid.
   */
  async createHold(organizationId: string, input: HoldInput): Promise<AppointmentEntity> {
    const calendar = await this.calendars.getCalendarById(organizationId, input.calendarId);
    await this.assertContact(organizationId, input.contactId);
    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);

    return this.inTransaction(async (tx) => {
      const locked = await this.lockCalendar(tx.manager, organizationId, calendar.id);
      await this.releaseExpiredHolds(tx, locked.id);
      await this.availability.assertBookable(tx.manager, locked, input.startsAt, endsAt);

      return this.insert(
        tx.manager,
        tx.manager.getRepository(AppointmentEntity).create({
          organization_id: organizationId,
          calendar_id: locked.id,
          contact_id: input.contactId,
          conversation_id: input.conversationId ?? undefined,
          assigned_to: locked.owner_user_id ?? undefined,
          title: input.title,
          status: AppointmentStatus.HELD,
          hold_expires_at: new Date(Date.now() + locked.hold_minutes * 60_000),
          starts_at: input.startsAt,
          ends_at: endsAt,
          timezone: input.timezone ?? locked.timezone,
          origin: input.origin,
          created_by: input.createdBy ?? undefined,
        }),
      );
    });
  }

  /** Links a hold to its payment; the hold lasts as long as the checkout does. */
  async attachPayment(
    organizationId: string,
    appointmentId: string,
    paymentId: string,
    holdUntil?: Date | null,
  ): Promise<void> {
    await this.repo.update(
      { id: appointmentId, organization_id: organizationId },
      { payment_id: paymentId, ...(holdUntil ? { hold_expires_at: holdUntil } : {}) },
    );
  }

  /** Frees a hold right away (checkout expired, payment failed, link could not be created). */
  async releaseHold(organizationId: string, appointmentId: string): Promise<void> {
    await this.inTransaction(async (tx) => {
      const rows = returnedRows<AppointmentEntity>(
        await tx.manager.query(
          `UPDATE scheduling.appointments
              SET status = 'cancelled', cancel_reason = 'payment_not_received', cancelled_at = NOW()
            WHERE id = $1 AND organization_id = $2 AND status = 'held'
            RETURNING *`,
          [appointmentId, organizationId],
        ),
      );
      for (const row of rows) await this.events.holdReleased(tx, this.hydrate(row));
    });
  }

  /** Releases unpaid holds past their expiry (one calendar, or all when omitted). */
  async releaseExpiredHolds(tx: BookingTx, calendarId?: string): Promise<number> {
    const rows = returnedRows<AppointmentEntity>(
      await tx.manager.query(
        `UPDATE scheduling.appointments
            SET status = 'cancelled', cancel_reason = 'payment_not_received', cancelled_at = NOW()
          WHERE status = 'held' AND hold_expires_at <= NOW() ${calendarId ? 'AND calendar_id = $1' : ''}
          RETURNING *`,
        calendarId ? [calendarId] : [],
      ),
    );
    for (const row of rows) await this.events.holdReleased(tx, this.hydrate(row));
    return rows.length;
  }

  // ── Payment confirmation (runs inside the payment webhook transaction) ──

  /** Confirms the appointment a payment was for. Never throws for booking problems. */
  async confirmFromPayment(
    tx: BookingTx,
    organizationId: string,
    appointmentId: string,
    paymentId: string,
  ): Promise<PaymentBookingOutcome> {
    const appts = tx.manager.getRepository(AppointmentEntity);
    const appt = await appts
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.id = :id AND a.organization_id = :orgId', { id: appointmentId, orgId: organizationId })
      .getOne();
    if (!appt) return { outcome: 'not_found' };

    // A hold (or a hold released moments ago) only becomes a real booking now.
    const becomesBooking =
      appt.status === AppointmentStatus.HELD || appt.cancel_reason === AppointmentCancelReason.PAYMENT_NOT_RECEIVED;

    if (appt.status === AppointmentStatus.CANCELLED) {
      if (appt.cancel_reason !== AppointmentCancelReason.PAYMENT_NOT_RECEIVED || !appt.calendar_id) {
        return { outcome: 'appointment_cancelled', appointment: appt };
      }
      // The hold expired just before the payment arrived: take the slot back if it is still free.
      const calendar = await this.lockCalendar(tx.manager, organizationId, appt.calendar_id);
      await this.releaseExpiredHolds(tx, calendar.id);
      const violations = await this.availability.assertBookable(tx.manager, calendar, appt.starts_at, appt.ends_at, {
        excludeId: appt.id,
        override: true,
      });
      if (violations.includes('conflict') || violations.includes('in_past')) {
        return { outcome: 'slot_unavailable', appointment: appt };
      }
      appt.cancelled_at = null;
      appt.cancel_reason = null;
    } else if (
      appt.status === AppointmentStatus.CONFIRMED ||
      appt.status === AppointmentStatus.COMPLETED ||
      appt.status === AppointmentStatus.NO_SHOW
    ) {
      if (!appt.payment_id) {
        appt.payment_id = paymentId;
        await appts.save(appt);
      }
      return { outcome: 'already_confirmed', appointment: appt };
    }

    appt.status = AppointmentStatus.CONFIRMED;
    appt.confirmed_at = new Date();
    appt.confirmed_via = AppointmentConfirmedVia.PAYMENT;
    appt.payment_id = paymentId;
    const saved = await appts.save(appt);

    await this.syncReminders(tx.manager, saved);
    if (becomesBooking) await this.events.created(tx, saved);
    await this.events.confirmed(tx, saved, this.links.pair(saved));
    return { outcome: 'confirmed', appointment: saved };
  }

  /**
   * Books a paid slot from a link created before holds existed (the booking
   * only lives in the payment metadata).
   */
  async createConfirmedFromPayment(
    tx: BookingTx,
    organizationId: string,
    input: PaidBookingInput,
  ): Promise<PaymentBookingOutcome> {
    const calendar = await this.lockCalendar(tx.manager, organizationId, input.calendarId);
    await this.releaseExpiredHolds(tx, calendar.id);
    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    const violations = await this.availability.assertBookable(tx.manager, calendar, input.startsAt, endsAt, {
      override: true,
    });
    if (violations.includes('conflict') || violations.includes('in_past')) return { outcome: 'slot_unavailable' };

    const saved = await tx.manager.getRepository(AppointmentEntity).save(
      tx.manager.getRepository(AppointmentEntity).create({
        organization_id: organizationId,
        calendar_id: calendar.id,
        contact_id: input.contactId,
        conversation_id: input.conversationId ?? undefined,
        assigned_to: calendar.owner_user_id ?? undefined,
        title: input.title,
        status: AppointmentStatus.CONFIRMED,
        confirmed_at: new Date(),
        confirmed_via: AppointmentConfirmedVia.PAYMENT,
        origin: 'ai',
        starts_at: input.startsAt,
        ends_at: endsAt,
        timezone: input.timezone ?? calendar.timezone,
        payment_id: input.paymentId,
        metadata: { payment_id: input.paymentId, created_from: 'payment_booking' },
      }),
    );
    await this.syncReminders(tx.manager, saved, calendar);
    await this.events.created(tx, saved);
    await this.events.confirmed(tx, saved, this.links.pair(saved));
    return { outcome: 'confirmed', appointment: saved };
  }

  // ── The contact's own link (no CRM session) ─────────────────────────────

  /** What a link points to and what the contact may do, without changing anything (GET). */
  async describeConfirmation(token: string): Promise<ContactLinkView> {
    const verified = this.links.verify(token);
    if (!verified.ok) {
      return { state: verified.error === 'expired' ? 'expired' : 'invalid', canConfirm: false, canChange: false };
    }
    const appt = await this.repo.findOne({ where: { id: verified.claims.appointmentId } });
    if (!appt) return { state: 'invalid', canConfirm: false, canChange: false };
    const state = this.confirmationState(appt, verified.claims.version);
    const changeable = state === 'confirmed' || state === 'already_confirmed';
    return { state, appointment: appt, canConfirm: state === 'confirmed', canChange: changeable };
  }

  /** Confirms the booking a link was issued for (POST from the confirmation page). */
  async confirmByContact(
    token: string,
    channel: 'email' | 'sms',
  ): Promise<{ state: ContactConfirmationResult; appointment?: AppointmentEntity }> {
    const verified = this.links.verify(token);
    if (!verified.ok) return { state: verified.error === 'expired' ? 'expired' : 'invalid' };

    return this.inTransaction(async (tx) => {
      const appt = await tx.manager
        .getRepository(AppointmentEntity)
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: verified.claims.appointmentId })
        .getOne();
      if (!appt) return { state: 'invalid' as const };

      const state = this.confirmationState(appt, verified.claims.version);
      if (state !== 'confirmed') return { state, appointment: appt };

      appt.status = AppointmentStatus.CONFIRMED;
      appt.confirmed_at = new Date();
      appt.confirmed_via = channel === 'sms' ? AppointmentConfirmedVia.SMS_LINK : AppointmentConfirmedVia.EMAIL_LINK;
      appt.confirmed_by = null;
      const saved = await tx.manager.getRepository(AppointmentEntity).save(appt);
      await this.events.confirmed(tx, saved, this.links.pair(saved));
      return { state: 'confirmed' as const, appointment: saved };
    });
  }

  /**
   * Free slots the contact may move their booking to (same calendar and
   * length), for the calendar's `contact_reschedule_days`. Its booking horizon
   * (`max_advance_days`) still applies on top.
   */
  async availabilityForContact(token: string): Promise<{ view: ContactLinkView; availability?: AvailabilityResult }> {
    const view = await this.describeConfirmation(token);
    if (!view.canChange || !view.appointment) return { view };
    const appt = view.appointment;
    if (!appt.calendar_id) return { view: { ...view, canChange: false } };
    const calendar = await this.calendars.getCalendarById(appt.organization_id, appt.calendar_id);
    const from = localDate(new Date(), calendar.timezone);
    const days = Math.min(Math.max(calendar.contact_reschedule_days || 14, 1), 60);
    const availability = await this.availability.getAvailability(appt.organization_id, {
      calendar_id: calendar.id,
      from,
      to: addDays(from, days - 1),
      duration_minutes: Math.round((appt.ends_at.getTime() - appt.starts_at.getTime()) / 60_000),
      exclude_appointment_id: appt.id,
    });
    return { view, availability };
  }

  /** The contact picks a new time from their link; choosing it confirms it. */
  async rescheduleByContact(token: string, startsAtRaw: string, channel: 'email' | 'sms'): Promise<ContactActionResult> {
    const verified = this.links.verify(token);
    if (!verified.ok) return { state: verified.error === 'expired' ? 'expired' : 'invalid' };
    const startsAt = new Date(startsAtRaw);
    if (Number.isNaN(startsAt.getTime())) return { state: 'invalid' };

    return this.inTransaction(async (tx) => {
      const appt = await tx.manager.getRepository(AppointmentEntity).findOne({ where: { id: verified.claims.appointmentId } });
      if (!appt) return { state: 'invalid' as const };
      const current = await this.lockAppointment(tx.manager, appt.organization_id, appt.id);
      const state = this.confirmationState(current, verified.claims.version);
      if (state !== 'confirmed' && state !== 'already_confirmed') return { state, appointment: current };
      if (!current.calendar_id) return { state: 'closed' as const, appointment: current };

      try {
        const saved = await this.moveBooking(tx, current, startsAt, undefined, { kind: 'contact' }, undefined);
        saved.status = AppointmentStatus.CONFIRMED;
        saved.confirmed_at = new Date();
        saved.confirmed_via = channel === 'sms' ? AppointmentConfirmedVia.SMS_LINK : AppointmentConfirmedVia.EMAIL_LINK;
        saved.confirmed_by = null;
        const confirmed = await tx.manager.getRepository(AppointmentEntity).save(saved);
        await this.events.rescheduled(tx, confirmed, this.links.pair(confirmed));
        return { state: 'rescheduled' as const, appointment: confirmed };
      } catch (err) {
        if (err instanceof SlotUnavailableException) return { state: 'slot_unavailable' as const, appointment: current };
        throw err;
      }
    });
  }

  /** The contact cancels from their link. */
  async cancelByContact(token: string): Promise<ContactActionResult> {
    const verified = this.links.verify(token);
    if (!verified.ok) return { state: verified.error === 'expired' ? 'expired' : 'invalid' };
    const appt = await this.repo.findOne({ where: { id: verified.claims.appointmentId } });
    if (!appt) return { state: 'invalid' };
    const state = this.confirmationState(appt, verified.claims.version);
    if (state !== 'confirmed' && state !== 'already_confirmed') return { state, appointment: appt };
    const cancelled = await this.cancel(appt.organization_id, appt.id, { kind: 'contact' }, 'contact');
    return { state: 'cancelled', appointment: cancelled };
  }

  /** 'confirmed' means "can be confirmed now". */
  private confirmationState(appt: AppointmentEntity, version: number): ContactConfirmationResult {
    if (appt.confirmation_version !== version) return 'outdated';
    switch (appt.status) {
      case AppointmentStatus.SCHEDULED:
      case 'pending':
        return appt.starts_at.getTime() <= Date.now() ? 'expired' : 'confirmed';
      case AppointmentStatus.CONFIRMED:
        return appt.starts_at.getTime() <= Date.now() ? 'closed' : 'already_confirmed';
      case AppointmentStatus.CANCELLED:
        return 'cancelled';
      case AppointmentStatus.HELD:
        return 'awaiting_payment';
      default:
        return 'closed';
    }
  }

  // ── Transitions ─────────────────────────────────────────────────────────

  async confirmByStaff(organizationId: string, id: string, actor: SchedulingActor): Promise<AppointmentEntity> {
    return this.transition(organizationId, id, AppointmentStatus.CONFIRMED, (appt) => {
      if (appt.status === AppointmentStatus.HELD) {
        throw new ConflictException({
          message: 'This booking is waiting for payment; it is confirmed when the payment arrives',
          errors: { code: 'AWAITING_PAYMENT' },
        });
      }
      appt.confirmed_at = new Date();
      appt.confirmed_via = AppointmentConfirmedVia.STAFF;
      appt.confirmed_by = userIdOf(actor);
    }, (tx, saved) => this.events.confirmed(tx, saved, this.links.pair(saved)));
  }

  async cancel(
    organizationId: string,
    id: string,
    actor: SchedulingActor,
    reason?: 'staff' | 'contact',
  ): Promise<AppointmentEntity> {
    let wasHeld = false;
    return this.transition(
      organizationId,
      id,
      AppointmentStatus.CANCELLED,
      async (appt, tx) => {
        wasHeld = appt.status === AppointmentStatus.HELD;
        appt.cancelled_at = new Date();
        appt.cancelled_by = userIdOf(actor);
        appt.cancel_reason =
          reason ??
          (actor.kind === 'ai'
            ? AppointmentCancelReason.AI
            : actor.kind === 'contact'
              ? AppointmentCancelReason.CONTACT
              : AppointmentCancelReason.STAFF);
        if (appt.payment_id) await this.flagPaymentForAttention(tx, appt, PaymentAttentionReason.APPOINTMENT_CANCELLED);
      },
      (tx, saved) => (wasHeld ? this.events.holdReleased(tx, saved) : this.events.cancelled(tx, saved)),
    );
  }

  async complete(organizationId: string, id: string, _actor: SchedulingActor): Promise<AppointmentEntity> {
    return this.transition(organizationId, id, AppointmentStatus.COMPLETED, (appt) => {
      this.assertStarted(appt, 'completed');
      appt.completed_at = new Date();
    }, (tx, saved) => this.events.completed(tx, saved));
  }

  async markNoShow(organizationId: string, id: string, _actor: SchedulingActor): Promise<AppointmentEntity> {
    return this.transition(organizationId, id, AppointmentStatus.NO_SHOW, (appt) => {
      this.assertStarted(appt, 'marked as no-show');
    }, (tx, saved) => this.events.noShow(tx, saved));
  }

  /**
   * Moves a booking (same rules as booking). Staff and integrations moving a
   * confirmed, unpaid booking need the contact to confirm the new time; the
   * AI does it at the contact's request, so the booking stays confirmed.
   */
  async reschedule(
    organizationId: string,
    id: string,
    dto: RescheduleAppointmentDto,
    actor: SchedulingActor,
  ): Promise<AppointmentEntity> {
    const startsRaw = dto.starts_at ?? dto.new_start_time;
    if (!startsRaw) throw new BadRequestException('starts_at is required');
    if (dto.override && !isAdminActor(actor)) {
      throw new ForbiddenException('Only owners and admins can override calendar rules');
    }
    const startsAt = new Date(startsRaw);

    return this.inTransaction(async (tx) => {
      const current = await this.lockAppointment(tx.manager, organizationId, id);
      const saved = await this.moveBooking(tx, current, startsAt, dto.duration_minutes, actor, dto.override?.reason);
      await this.events.rescheduled(tx, saved, this.links.pair(saved));
      if (saved.status === AppointmentStatus.SCHEDULED) await this.requestConfirmation(tx, saved, { rescheduled: true });
      return saved;
    });
  }

  async updateDetails(organizationId: string, id: string, dto: UpdateAppointmentDto): Promise<AppointmentEntity> {
    const appt = await this.findById(id, organizationId);
    const fields: Array<keyof UpdateAppointmentDto> = ['title', 'description', 'location', 'meeting_url', 'notes'];
    for (const field of fields) {
      if (dto[field] !== undefined) (appt as unknown as Record<string, unknown>)[field] = dto[field];
    }
    const saved = await this.repo.save(appt);
    await this.events.updated(null, saved);
    return saved;
  }

  async resendConfirmation(organizationId: string, id: string): Promise<AppointmentEntity> {
    const appt = await this.findById(id, organizationId);
    if (appt.status !== AppointmentStatus.SCHEDULED) {
      throw new ConflictException('Only bookings awaiting confirmation can be sent a new link');
    }
    if (appt.starts_at.getTime() <= Date.now()) throw new ConflictException('The appointment has already started');
    await this.requestConfirmation(null, appt);
    return appt;
  }

  /** Owners/admins only, never paid bookings and never upcoming ones (cancel first so the contact is told). */
  async delete(organizationId: string, id: string, actor: SchedulingActor): Promise<void> {
    const appt = await this.findById(id, organizationId);

    if (!isAdminActor(actor)) throw new ForbiddenException('Only owners and admins can delete appointments');
    if (appt.payment_id) {
      throw new ConflictException({
        message: 'Paid appointments cannot be deleted; cancel it instead',
        errors: { code: 'APPOINTMENT_PAID' },
      });
    }
    if (ACTIVE_BOOKING_STATUSES.includes(appt.status) && appt.ends_at.getTime() > Date.now()) {
      throw new ConflictException({
        message: 'Cancel this upcoming appointment first so the contact is notified',
        errors: { code: 'APPOINTMENT_UPCOMING' },
      });
    }
    await this.repo.delete({ id, organization_id: organizationId });
  }

  // ── Scheduled jobs ──────────────────────────────────────────────────────

  async releaseAllExpiredHolds(): Promise<number> {
    return this.inTransaction((tx) => this.releaseExpiredHolds(tx));
  }

  /**
   * Sends the reminders that are due. Claiming the reminder and storing its
   * event happen in one transaction, so each reminder is sent exactly once
   * even with several instances running.
   */
  async sendDueReminders(batchSize = 200): Promise<number> {
    return this.inTransaction(async (tx) => {
      // Bookings that stopped being active never send their pending reminders.
      await tx.manager.query(
        `UPDATE scheduling.appointment_reminders r SET status = 'cancelled'
          WHERE r.status = 'pending' AND r.due_at <= NOW()
            AND NOT EXISTS (
              SELECT 1 FROM scheduling.appointments a
               WHERE a.id = r.appointment_id AND a.status IN ('scheduled', 'confirmed') AND a.starts_at > NOW())`,
      );
      const claimed = returnedRows<{ id: string; appointment_id: string; offset_minutes: number }>(
        await tx.manager.query(
          `UPDATE scheduling.appointment_reminders r SET status = 'sent', sent_at = NOW()
            WHERE r.id IN (
              SELECT r2.id FROM scheduling.appointment_reminders r2
               WHERE r2.status = 'pending' AND r2.due_at <= NOW()
               ORDER BY r2.due_at
               LIMIT $1
               FOR UPDATE SKIP LOCKED)
            RETURNING r.id, r.appointment_id, r.offset_minutes`,
          [batchSize],
        ),
      );
      if (!claimed.length) return 0;
      const appts = await tx.manager
        .getRepository(AppointmentEntity)
        .findBy({ id: In([...new Set(claimed.map((r) => r.appointment_id))]) });
      const byId = new Map(appts.map((a) => [a.id, a]));
      for (const reminder of claimed) {
        const appt = byId.get(reminder.appointment_id);
        if (!appt) continue;
        const links = this.links.pair(appt);
        await this.events.reminderDue(tx, appt, {
          reminderId: reminder.id,
          offsetMinutes: reminder.offset_minutes,
          manageUrlEmail: links.email,
          manageUrlSms: links.sms,
          ...(appt.status === AppointmentStatus.SCHEDULED
            ? { confirmUrlEmail: links.email, confirmUrlSms: links.sms }
            : {}),
        });
      }
      return claimed.length;
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Changes time (and duration) under the calendar rules; keeps reminders and links in sync. */
  private async moveBooking(
    tx: BookingTx,
    current: AppointmentEntity,
    startsAt: Date,
    durationMinutes: number | undefined,
    actor: SchedulingActor,
    overrideReason: string | undefined,
  ): Promise<AppointmentEntity> {
    if (!isReschedulable(current.status)) {
      throw new ConflictException({
        message: `A ${current.status} appointment cannot be rescheduled`,
        errors: { code: 'INVALID_TRANSITION', from: current.status, to: 'rescheduled' },
      });
    }
    if (!current.calendar_id) throw new ConflictException('Appointment has no calendar');

    const duration =
      durationMinutes ?? Math.round((current.ends_at.getTime() - current.starts_at.getTime()) / 60_000);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const calendar = await this.lockCalendar(tx.manager, current.organization_id, current.calendar_id);
    await this.releaseExpiredHolds(tx, calendar.id);
    const violations = await this.availability.assertBookable(tx.manager, calendar, startsAt, endsAt, {
      excludeId: current.id,
      override: !!overrideReason,
    });

    current.starts_at = startsAt;
    current.ends_at = endsAt;
    current.confirmation_version = (current.confirmation_version ?? 1) + 1;
    const needsReconfirmation = actor.kind === 'user' || actor.kind === 'api_key' || actor.kind === 'system';
    if (needsReconfirmation && current.status === AppointmentStatus.CONFIRMED && !current.payment_id) {
      current.status = AppointmentStatus.SCHEDULED;
      current.confirmed_at = null;
      current.confirmed_via = null;
      current.confirmed_by = null;
    }
    Object.assign(current, this.overrideFields(violations, overrideReason, actor));

    const saved = await this.save(tx.manager.getRepository(AppointmentEntity), current);
    await this.syncReminders(tx.manager, saved, calendar);
    return saved;
  }

  /**
   * Keeps the booking's reminders in line with its time and status: one per
   * calendar offset still in the future while it is scheduled or confirmed,
   * none otherwise. A reminder already sent is re-armed after a reschedule.
   */
  private async syncReminders(
    manager: EntityManager,
    appt: AppointmentEntity,
    calendar?: WorkScheduleEntity,
  ): Promise<void> {
    const reminders = manager.getRepository(AppointmentReminderEntity);
    const active = appt.status === AppointmentStatus.SCHEDULED || appt.status === AppointmentStatus.CONFIRMED;
    const cal =
      active && appt.calendar_id
        ? calendar ?? (await manager.getRepository(WorkScheduleEntity).findOne({ where: { id: appt.calendar_id } }))
        : null;
    const now = Date.now();
    const wanted = (cal?.reminder_offsets_minutes ?? [])
      .map((offset) => ({ offset, due: new Date(appt.starts_at.getTime() - offset * 60_000) }))
      .filter((r) => r.due.getTime() > now);

    await reminders
      .createQueryBuilder()
      .update(AppointmentReminderEntity)
      .set({ status: 'cancelled' })
      .where(`appointment_id = :id AND status = 'pending'`, { id: appt.id })
      .andWhere(wanted.length ? 'offset_minutes NOT IN (:...offsets)' : 'TRUE', {
        offsets: wanted.map((r) => r.offset),
      })
      .execute();

    for (const reminder of wanted) {
      await manager.query(
        `INSERT INTO scheduling.appointment_reminders (organization_id, appointment_id, offset_minutes, due_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (appointment_id, offset_minutes)
         DO UPDATE SET due_at = EXCLUDED.due_at, status = 'pending', sent_at = NULL`,
        [appt.organization_id, appt.id, reminder.offset, reminder.due],
      );
    }
  }

  private async requestConfirmation(
    tx: BookingTx | null,
    appt: AppointmentEntity,
    opts: { reminder?: boolean; rescheduled?: boolean } = {},
  ): Promise<void> {
    if (appt.starts_at.getTime() <= Date.now()) return;
    const links = this.links.pair(appt);
    await this.events.confirmationRequested(tx, appt, {
      confirmUrlEmail: links.email,
      confirmUrlSms: links.sms,
      manageUrlEmail: links.email,
      manageUrlSms: links.sms,
      ...opts,
    });
  }

  private async transition(
    organizationId: string,
    id: string,
    to: AppointmentStatus,
    mutate: (appt: AppointmentEntity, tx: BookingTx) => void | Promise<void>,
    publish: (tx: BookingTx, saved: AppointmentEntity) => Promise<void>,
  ): Promise<AppointmentEntity> {
    return this.inTransaction(async (tx) => {
      const appt = await this.lockAppointment(tx.manager, organizationId, id);
      if (!canTransition(appt.status, to)) {
        throw new ConflictException({
          message: `Cannot move a ${appt.status} appointment to ${to}`,
          errors: { code: 'INVALID_TRANSITION', from: appt.status, to },
        });
      }
      await mutate(appt, tx);
      appt.status = to;
      const saved = await this.save(tx.manager.getRepository(AppointmentEntity), appt);
      await this.syncReminders(tx.manager, saved);
      await publish(tx, saved);
      return saved;
    });
  }

  private assertStarted(appt: AppointmentEntity, verb: string): void {
    if (appt.starts_at.getTime() > Date.now()) {
      throw new ConflictException({
        message: `An appointment that has not started cannot be ${verb}`,
        errors: { code: 'NOT_STARTED' },
      });
    }
  }

  private overrideFields(violations: string[], reason: string | undefined, actor: SchedulingActor) {
    if (!violations.length || !reason) return {};
    return {
      override_at: new Date(),
      override_by: userIdOf(actor),
      override_reason: `${reason} [${violations.join(', ')}]`,
    };
  }

  private async flagPaymentForAttention(tx: BookingTx, appt: AppointmentEntity, reason: PaymentAttentionReason): Promise<void> {
    const result: unknown = await tx.manager.query(
      `UPDATE payments.payments
          SET attention_reason = $1, attention_at = NOW(), resolution = NULL, resolved_at = NULL, resolved_by = NULL
        WHERE id = $2 AND organization_id = $3 AND status = 'paid'
        RETURNING id`,
      [reason, appt.payment_id, appt.organization_id],
    );
    if (returnedRows(result).length) tx.afterCommit(() => this.events.paymentNeedsAttention(appt, reason));
  }

  /**
   * Locks the calendar row and, for a staff calendar, its owner, so two
   * bookings for the same person (on any of their calendars) never interleave.
   */
  private async lockCalendar(manager: EntityManager, organizationId: string, calendarId: string): Promise<WorkScheduleEntity> {
    const cal = await manager
      .getRepository(WorkScheduleEntity)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id AND c.organization_id = :orgId', { id: calendarId, orgId: organizationId })
      .getOne();
    if (!cal) throw new NotFoundException(`Calendar ${calendarId} not found`);
    if (cal.owner_user_id) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`owner:${cal.owner_user_id}`]);
    }
    return cal;
  }

  private async lockAppointment(manager: EntityManager, organizationId: string, id: string): Promise<AppointmentEntity> {
    const appt = await manager
      .getRepository(AppointmentEntity)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.id = :id AND a.organization_id = :orgId', { id, orgId: organizationId })
      .getOne();
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    return appt;
  }

  /** Raw rows (RETURNING *) into entities; timestamps already come back as Dates. */
  private hydrate(row: AppointmentEntity): AppointmentEntity {
    return this.repo.create(row);
  }

  private async insert(manager: EntityManager, appt: AppointmentEntity): Promise<AppointmentEntity> {
    return this.save(manager.getRepository(AppointmentEntity), appt);
  }

  /** Maps the overlap constraint to the same 409 the service check raises. */
  private async save(repo: Repository<AppointmentEntity>, appt: AppointmentEntity): Promise<AppointmentEntity> {
    try {
      return await repo.save(appt);
    } catch (err) {
      const code = (err as QueryFailedError & { driverError?: { code?: string; constraint?: string } }).driverError;
      if (err instanceof QueryFailedError && code?.code === '23P01') throw new SlotUnavailableException(['conflict']);
      if (err instanceof QueryFailedError && code?.code === '23503' && code.constraint === 'appointments_contact_same_org_fkey') {
        throw new NotFoundException('Contact not found');
      }
      throw err;
    }
  }

  private async assertContact(organizationId: string, contactId: string): Promise<void> {
    const exists = await this.contactRepo.exists({ where: { id: contactId, organization_id: organizationId } });
    if (!exists) throw new NotFoundException(`Contact ${contactId} not found`);
  }

  private async assertConversation(organizationId: string, conversationId: string): Promise<void> {
    const [row] = await this.repo.manager.query(
      'SELECT 1 FROM conversations.conversations WHERE id = $1 AND organization_id = $2',
      [conversationId, organizationId],
    );
    if (!row) throw new NotFoundException(`Conversation ${conversationId} not found`);
  }
}
