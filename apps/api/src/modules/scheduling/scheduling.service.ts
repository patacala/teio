import { Injectable, NotFoundException, BadRequestException, Optional, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { WorkScheduleEntity } from './work-schedule.entity';
import { WebhookDispatcherService } from '../integrations/webhook-dispatcher.service';
import { AutomationSequenceService } from '../automation-engine/automation-sequence.service';
import { RealtimeBroadcastService } from '../../infrastructure/realtime/realtime-broadcast.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';

export interface CreateAppointmentDto {
  calendar_id?: string;
  contact_id: string;
  title: string;
  duration_minutes: number;
  starts_at: string;
  description?: string;
  timezone?: string;
  location?: string;
  meeting_url?: string;
  assigned_to?: string;
  conversation_id?: string;
  origin?: string;
  created_by?: string;
  action?: string;
  executor?: string;
  channel_strategy?: string;
  message_content?: string;
}

export interface CreateConfirmedFromPaymentInput {
  calendar_id: string;
  contact_id: string;
  conversation_id?: string | null;
  title: string;
  starts_at: string;
  duration_minutes: number;
  timezone?: string;
  payment_id: string;
}

export interface UpdateAppointmentDto {
  title?: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
  status?: string;
  location?: string;
  meeting_url?: string;
  notes?: string;
  duration_minutes?: number;
}

export interface AppointmentFilters {
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
  offset?: number;
  /** Newest-first by default; calendar grids ask for 'asc' to read top-to-bottom. */
  sort?: 'asc' | 'desc';
  cursor?: string;
  calendar_id?: string;
  contact_id?: string;
}

export interface AppointmentPage {
  items: AppointmentEntity[];
  meta: { total: number; limit: number; offset: number };
}

export interface AppointmentMetrics {
  today_count: number;
  week_count: number;
  pending_count: number;
  completed_count: number;
}

export interface UpdateWorkScheduleDto {
  work_days?: number[];
  start_time?: string;
  end_time?: string;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  timezone?: string;
  blocked_dates?: string[];
}

export interface CreateCalendarDto {
  name: string;
  color?: string;
}

export interface UpdateCalendarDto {
  name?: string;
  color?: string;
  is_active?: boolean;
  /** Service to charge when booking here. `null` clears it (no charge). */
  payment_service_id?: string | null;
}

export interface AvailabilitySlot {
  starts_at: string;
  ends_at: string;
}

export interface AvailabilityQuery {
  from: string;
  to: string;
  duration_minutes?: number;
  calendar_id?: string;
}

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly repo: Repository<AppointmentEntity>,
    @InjectRepository(WorkScheduleEntity)
    private readonly scheduleRepo: Repository<WorkScheduleEntity>,
    @Optional() private readonly webhookDispatcher?: WebhookDispatcherService,
    @Optional() @Inject(RABBITMQ_SERVICE) private readonly rmqClient?: ClientProxy,
    @Optional() private readonly sequenceService?: AutomationSequenceService,
    @Optional() private readonly realtimeBroadcast?: RealtimeBroadcastService,
  ) {}

  async findAll(organizationId: string, filters: AppointmentFilters = {}): Promise<AppointmentPage> {
    const {
      from,
      to,
      status,
      cursor,
      calendar_id,
      contact_id,
      sort = 'desc',
    } = filters;

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const direction = sort === 'asc' ? 'ASC' : 'DESC';

    // Sequence steps live on the follow-up calendar and must stay visible there,
    // including after they are cancelled. Other calendars only show real bookings.
    const calendar = calendar_id
      ? await this.scheduleRepo.findOne({
          where: { id: calendar_id, organization_id: organizationId },
          select: ['id', 'type'],
        })
      : null;
    const showSequenceSteps = calendar?.type === 'follow_up';

    const qb = this.repo
      .createQueryBuilder('appt')
      .leftJoinAndSelect('appt.contact', 'contact')
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .orderBy('appt.starts_at', direction)
      // starts_at collides constantly for batch-created follow-ups; without a
      // tiebreaker rows shuffle between pages and some are never shown.
      .addOrderBy('appt.id', direction);

    if (!showSequenceSteps) {
      qb.andWhere('appt.action IS NULL');
    }

    if (cursor) {
      qb.andWhere(
        direction === 'ASC' ? 'appt.starts_at > :cursor' : 'appt.starts_at < :cursor',
        { cursor: new Date(cursor) },
      );
    }
    if (from) {
      qb.andWhere('appt.starts_at >= :from', { from: new Date(from) });
    }
    if (to) {
      qb.andWhere('appt.starts_at <= :to', { to: new Date(to) });
    }
    if (status) {
      qb.andWhere('appt.status = :status', { status });
    }
    if (calendar_id) {
      qb.andWhere('appt.calendar_id = :calId', { calId: calendar_id });
    }
    if (contact_id) {
      qb.andWhere('appt.contact_id = :contactId', { contactId: contact_id });
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

  async create(organizationId: string, dto: CreateAppointmentDto): Promise<AppointmentEntity> {
    const startsAt = new Date(dto.starts_at);
    const endsAt = new Date(startsAt.getTime() + dto.duration_minutes * 60_000);

    // Auto-resolve timezone from calendar configuration
    let timezone = dto.timezone;
    if (!timezone || timezone === 'UTC') {
      if (dto.calendar_id) {
        const calendar = await this.scheduleRepo.findOne({
          where: { id: dto.calendar_id, organization_id: organizationId },
          select: ['timezone'],
        });
        if (calendar?.timezone && calendar.timezone !== 'UTC') {
          timezone = calendar.timezone;
        }
      }
      // If still no timezone, try org's first calendar
      if (!timezone || timezone === 'UTC') {
        const firstCal = await this.scheduleRepo.findOne({
          where: { organization_id: organizationId },
          order: { created_at: 'ASC' },
          select: ['timezone'],
        });
        if (firstCal?.timezone && firstCal.timezone !== 'UTC') {
          timezone = firstCal.timezone;
        }
      }
    }
    timezone = timezone || 'UTC';

    const origin = dto.origin ?? 'human';

    // A human admin booking directly is authorizing (comping) the appointment,
    // so they bypass payment. Any non-human origin (the AI agent / self-service)
    // must go through create_payment_link: on a charging calendar the appointment
    // is only created once Stripe confirms the charge (createConfirmedFromPayment),
    // so no unpaid agenda row is ever persisted.
    if (origin !== 'human' && dto.calendar_id) {
      const paymentServiceId = await this.findCalendarPaymentServiceId(
        organizationId,
        dto.calendar_id,
      );
      if (paymentServiceId) {
        throw new BadRequestException(
          'use create_payment_link; appointment is created after payment',
        );
      }
    }

    const appt = this.repo.create({
      organization_id: organizationId,
      timezone,
      origin,
      calendar_id: dto.calendar_id ?? undefined,
      contact_id: dto.contact_id,
      title: dto.title,
      description: dto.description,
      location: dto.location,
      meeting_url: dto.meeting_url,
      assigned_to: dto.assigned_to,
      conversation_id: dto.conversation_id,
      created_by: dto.created_by,
      starts_at: startsAt,
      ends_at: endsAt,
      ...(dto.action ? {
        action: dto.action,
        executor: dto.executor ?? 'system',
        channel_strategy: dto.channel_strategy ?? 'auto',
        message_content: dto.message_content,
      } : {}),
    });
    const saved = await this.repo.save(appt);
    this.emitAppointmentCreated(organizationId, saved);
    this.emitAppointmentConfirmed(organizationId, saved);
    return saved;
  }

  /**
   * Materializes a paid booking as a confirmed appointment.
   * Does not park as pending — Stripe already confirmed the charge.
   */
  async createConfirmedFromPayment(
    organizationId: string,
    input: CreateConfirmedFromPaymentInput,
  ): Promise<AppointmentEntity> {
    const startsAt = new Date(input.starts_at);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException(`Invalid starts_at: ${input.starts_at}`);
    }
    const endsAt = new Date(startsAt.getTime() + input.duration_minutes * 60_000);
    const timezone = await this.resolveTimezone(organizationId, input.calendar_id, input.timezone);

    const saved = await this.repo.save(
      this.repo.create({
        organization_id: organizationId,
        calendar_id: input.calendar_id,
        contact_id: input.contact_id,
        conversation_id: input.conversation_id ?? undefined,
        title: input.title,
        status: 'confirmed',
        origin: 'ai',
        starts_at: startsAt,
        ends_at: endsAt,
        timezone,
        metadata: {
          payment_id: input.payment_id,
          created_from: 'payment_booking',
        },
      }),
    );

    this.emitAppointmentCreated(organizationId, saved);
    this.emitAppointmentConfirmed(organizationId, saved);
    this.logger.log(
      `Appointment ${saved.id} created as confirmed from payment ${input.payment_id}`,
    );
    return saved;
  }

  /** Flips a legacy payment-gated appointment to confirmed and sends the confirmation email. */
  async confirmAfterPayment(organizationId: string, appointmentId: string): Promise<boolean> {
    const appointment = await this.repo.findOne({
      where: { id: appointmentId, organization_id: organizationId },
    });
    if (!appointment) {
      this.logger.warn(`Paid appointment ${appointmentId} not found (org ${organizationId})`);
      return false;
    }

    if (appointment.status === 'confirmed') return true;

    appointment.status = 'confirmed';
    const saved = await this.repo.save(appointment);
    this.emitAppointmentConfirmed(organizationId, saved);
    this.logger.log(`Appointment ${appointmentId} confirmed after payment`);
    return true;
  }

  async update(id: string, organizationId: string, dto: UpdateAppointmentDto): Promise<AppointmentEntity> {
    const appt = await this.findById(id, organizationId);

    if (dto.starts_at !== undefined || dto.duration_minutes !== undefined) {
      const startsAt = dto.starts_at ? new Date(dto.starts_at) : appt.starts_at;
      const currentDuration = Math.round(
        (appt.ends_at.getTime() - appt.starts_at.getTime()) / 60_000,
      );
      const duration = dto.duration_minutes ?? currentDuration;
      appt.starts_at = startsAt;
      appt.ends_at = new Date(startsAt.getTime() + duration * 60_000);
    }

    const { starts_at: _s, ends_at: _e, duration_minutes: _d, ...rest } = dto;
    Object.assign(appt, rest);
    const updated = await this.repo.save(appt);
    void this.webhookDispatcher?.dispatch('appointment.updated', organizationId, {
      appointment_id: updated.id,
    });
    // A direct PATCH to no_show (e.g. from the agenda UI) is the funnel signal —
    // complete()/cancel() have their own dedicated events and never hit this.
    if (rest.status === 'no_show') {
      this.emitAppointmentLifecycle(RABBITMQ_QUEUES.APPOINTMENT_NO_SHOW, organizationId, updated);
    }
    return updated;
  }

  async cancel(id: string, organizationId: string): Promise<AppointmentEntity> {
    const appt = await this.update(id, organizationId, { status: 'cancelled' });
    this.rmqClient?.emit(RABBITMQ_QUEUES.APPOINTMENT_CANCELLED, {
      organization_id: organizationId,
      appointment_id: appt.id,
      contact_id: appt.contact_id,
      title: appt.title,
      starts_at: appt.starts_at,
      ends_at: appt.ends_at,
      timezone: appt.timezone ?? 'UTC',
    });
    return appt;
  }

  async complete(id: string, organizationId: string): Promise<AppointmentEntity> {
    const appt = await this.update(id, organizationId, { status: 'completed' });
    this.emitAppointmentLifecycle(RABBITMQ_QUEUES.APPOINTMENT_COMPLETED, organizationId, appt);
    if (appt.sequence_id && this.sequenceService) {
      void this.sequenceService.cancel(organizationId, appt.sequence_id, 'manual').catch((err) => {
        this.logger.warn(`Failed to cancel sequence ${appt.sequence_id} on appointment complete: ${err}`);
      });
    }
    return appt;
  }

  async reschedule(id: string, organizationId: string, newStartTime: string): Promise<AppointmentEntity> {
    const appt = await this.findById(id, organizationId);
    const currentDuration = Math.round(
      (appt.ends_at.getTime() - appt.starts_at.getTime()) / 60_000,
    );
    const startsAt = new Date(newStartTime);
    appt.starts_at = startsAt;
    appt.ends_at = new Date(startsAt.getTime() + currentDuration * 60_000);
    const saved = await this.repo.save(appt);
    this.rmqClient?.emit(RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED, {
      organization_id: organizationId,
      appointment_id: saved.id,
      contact_id: saved.contact_id,
      title: saved.title,
      starts_at: saved.starts_at,
      ends_at: saved.ends_at,
      timezone: saved.timezone ?? 'UTC',
    });
    return saved;
  }

  async delete(id: string, organizationId: string): Promise<void> {
    const appt = await this.findById(id, organizationId);
    if (appt.sequence_id && this.sequenceService) {
      void this.sequenceService.cancel(organizationId, appt.sequence_id, 'manual').catch((err) => {
        this.logger.warn(`Failed to cancel sequence ${appt.sequence_id} on appointment delete: ${err}`);
      });
    }
    await this.repo.delete({ id, organization_id: organizationId });
  }

  async findUpcomingForContact(
    organizationId: string,
    contactId: string,
    limit = 5,
  ): Promise<AppointmentEntity[]> {
    return this.repo
      .createQueryBuilder('appt')
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .andWhere('appt.contact_id = :contactId', { contactId })
      .andWhere('appt.starts_at >= NOW()')
      .andWhere('appt.status NOT IN (:...excluded)', { excluded: ['cancelled', 'no_show', 'completed'] })
      .orderBy('appt.starts_at', 'ASC')
      .take(limit)
      .getMany();
  }

  // ── Calendar CRUD ────────────────────────────────────────────────────────

  async listCalendars(organizationId: string): Promise<WorkScheduleEntity[]> {
    const calendars = await this.scheduleRepo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'ASC' },
    });
    const result = calendars.length === 0
      ? await this.seedDefaultCalendars(organizationId)
      : calendars;

    // Assign any legacy appointments (calendar_id IS NULL) to the first calendar.
    // Wrapped in try-catch so a pending DB migration doesn't break the list endpoint.
    try {
      await this.repo
        .createQueryBuilder()
        .update(AppointmentEntity)
        .set({ calendar_id: result[0].id })
        .where('organization_id = :orgId', { orgId: organizationId })
        .andWhere('calendar_id IS NULL')
        .execute();
    } catch {
      // FK constraint not yet updated (021_fix_calendar_fk.sql not run).
      // Calendars still load correctly; appointments will be assigned after migration.
    }

    return result;
  }

  async seedDefaultCalendars(organizationId: string): Promise<WorkScheduleEntity[]> {
    const defaults = [
      { name: 'Appointments', color: '#2563EB', type: 'appointments' },
      { name: 'Follow-up', color: '#16a34a', type: 'follow_up' },
    ] as const;
    const created: WorkScheduleEntity[] = [];
    for (const def of defaults) {
      const cal = this.scheduleRepo.create({
        organization_id: organizationId,
        name: def.name,
        color: def.color,
        type: def.type,
        is_active: true,
        work_days: [1, 2, 3, 4, 5],
        start_time: '09:00',
        end_time: '18:00',
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        timezone: 'UTC',
        blocked_dates: [],
      });
      created.push(await this.scheduleRepo.save(cal));
    }
    return created;
  }

  async createCalendar(organizationId: string, dto: CreateCalendarDto): Promise<WorkScheduleEntity> {
    const cal = this.scheduleRepo.create({
      organization_id: organizationId,
      name: dto.name,
      color: dto.color ?? '#2563EB',
      is_active: true,
      work_days: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '18:00',
      slot_duration_minutes: 30,
      buffer_minutes: 0,
      timezone: 'UTC',
      blocked_dates: [],
    });
    return this.scheduleRepo.save(cal);
  }

  async getCalendarById(organizationId: string, id: string): Promise<WorkScheduleEntity> {
    const cal = await this.scheduleRepo.findOne({ where: { id, organization_id: organizationId } });
    if (!cal) throw new NotFoundException(`Calendar ${id} not found`);
    return cal;
  }

  /** `null` when the calendar is unknown or charges nothing. Never throws. */
  async findCalendarPaymentServiceId(
    organizationId: string,
    calendarId: string,
  ): Promise<string | null> {
    const cal = await this.scheduleRepo.findOne({
      where: { id: calendarId, organization_id: organizationId },
      select: ['payment_service_id'],
    });
    return cal?.payment_service_id ?? null;
  }

  /**
   * The appointments calendar that charges this service, or `null` when the
   * service is not used for booking. A partial UNIQUE index
   * (035_unique_calendar_payment_service.sql) guarantees at most one, so this
   * never has to disambiguate.
   */
  async findAppointmentsCalendarForPaymentService(
    organizationId: string,
    paymentServiceId: string,
  ): Promise<WorkScheduleEntity | null> {
    const calendars = await this.scheduleRepo.find({
      where: {
        organization_id: organizationId,
        payment_service_id: paymentServiceId,
        type: 'appointments',
      },
    });
    const active = calendars.filter((c) => c.is_active !== false);
    const list = active.length ? active : calendars;
    return list[0] ?? null;
  }

  /** The org's only active appointments calendar, or null if none/ambiguous. */
  async findDefaultAppointmentsCalendar(
    organizationId: string,
  ): Promise<WorkScheduleEntity | null> {
    const calendars = await this.scheduleRepo.find({
      where: { organization_id: organizationId, type: 'appointments', is_active: true },
    });
    return calendars.length === 1 ? calendars[0] : null;
  }

  async updateCalendar(organizationId: string, id: string, dto: UpdateCalendarDto): Promise<WorkScheduleEntity> {
    const cal = await this.getCalendarById(organizationId, id);
    if (dto.name !== undefined) cal.name = dto.name;
    if (dto.color !== undefined) cal.color = dto.color;
    if (dto.is_active !== undefined) cal.is_active = dto.is_active;
    if (dto.payment_service_id !== undefined) {
      // Follow-up cadences must never ask a contact for money — only the
      // calendar the agent books real appointments into can charge.
      if (dto.payment_service_id && cal.type !== 'appointments') {
        throw new BadRequestException(
          'Solo los calendarios de citas pueden cobrar un servicio',
        );
      }
      // A service maps to exactly one appointments calendar (uq_work_schedules_
      // payment_service). Surface a friendly error before hitting the DB constraint.
      if (dto.payment_service_id) {
        const other = await this.scheduleRepo.findOne({
          where: {
            organization_id: organizationId,
            payment_service_id: dto.payment_service_id,
            type: 'appointments',
          },
          select: ['id'],
        });
        if (other && other.id !== cal.id) {
          throw new BadRequestException(
            'Ese servicio ya está ligado a otro calendario de citas',
          );
        }
      }
      cal.payment_service_id = dto.payment_service_id;
    }
    return this.scheduleRepo.save(cal);
  }

  async updateCalendarConfig(organizationId: string, id: string, dto: UpdateWorkScheduleDto): Promise<WorkScheduleEntity> {
    const cal = await this.getCalendarById(organizationId, id);
    if (dto.work_days !== undefined) cal.work_days = dto.work_days;
    if (dto.start_time !== undefined) cal.start_time = dto.start_time;
    if (dto.end_time !== undefined) cal.end_time = dto.end_time;
    if (dto.slot_duration_minutes !== undefined) cal.slot_duration_minutes = dto.slot_duration_minutes;
    if (dto.buffer_minutes !== undefined) cal.buffer_minutes = dto.buffer_minutes;
    if (dto.timezone !== undefined) cal.timezone = dto.timezone;
    if (dto.blocked_dates !== undefined) cal.blocked_dates = dto.blocked_dates;
    return this.scheduleRepo.save(cal);
  }

  async deleteCalendar(organizationId: string, id: string): Promise<void> {
    await this.getCalendarById(organizationId, id);
    const total = await this.scheduleRepo.count({ where: { organization_id: organizationId } });
    if (total <= 1) throw new BadRequestException('No se puede eliminar el último calendario');
    await this.scheduleRepo.delete({ id, organization_id: organizationId });
  }

  // ── Legacy single-schedule methods (backward compat) ─────────────────────

  async getWorkSchedule(organizationId: string): Promise<WorkScheduleEntity> {
    const calendars = await this.listCalendars(organizationId);
    return calendars[0];
  }

  async upsertWorkSchedule(organizationId: string, dto: UpdateWorkScheduleDto): Promise<WorkScheduleEntity> {
    const schedule = await this.getWorkSchedule(organizationId);
    return this.updateCalendarConfig(organizationId, schedule.id, dto);
  }

  async getAvailableSlots(organizationId: string, query: AvailabilityQuery): Promise<AvailabilitySlot[]> {
    // ── Input validation ────────────────────────────────────────────────────
    if (!query.from || !query.to) {
      throw new BadRequestException('from and to query params are required');
    }
    const fromDate = new Date(query.from);
    const toDate = new Date(query.to);
    if (isNaN(fromDate.getTime())) throw new BadRequestException(`Invalid from date: ${query.from}`);
    if (isNaN(toDate.getTime())) throw new BadRequestException(`Invalid to date: ${query.to}`);

    // Anchor to UTC day boundaries
    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    // ── Load work schedule ──────────────────────────────────────────────────
    const schedule = query.calendar_id
      ? await this.getCalendarById(organizationId, query.calendar_id)
      : await this.getWorkSchedule(organizationId);

    // duration_minutes arrives as string from @Query() — coerce to number
    const duration = Math.max(1, Number(query.duration_minutes ?? schedule.slot_duration_minutes) || 1);
    const buffer = Number(schedule.buffer_minutes) || 0;

    const workDays = (schedule.work_days ?? []).map(Number).filter((n) => !isNaN(n));

    // blocked_dates: Postgres DATE[] may return Date objects or 'YYYY-MM-DD' strings
    const blockedDates = new Set<string>(
      (schedule.blocked_dates ?? []).map((d) => {
        const val = d as unknown;
        return val instanceof Date ? val.toISOString().slice(0, 10) : String(d).slice(0, 10);
      }),
    );

    // Postgres TIME column may return 'HH:MM' or 'HH:MM:SS' — handle both
    const parseTimeToMinutes = (t: unknown): number => {
      const parts = String(t ?? '00:00').split(':').map(Number);
      const h = isNaN(parts[0]) ? 0 : parts[0];
      const m = isNaN(parts[1]) ? 0 : parts[1];
      return h * 60 + m;
    };
    const startMinutes = parseTimeToMinutes(schedule.start_time);
    const endMinutes = parseTimeToMinutes(schedule.end_time);

    // Guard: nothing to generate if schedule is misconfigured
    if (startMinutes >= endMinutes || duration > endMinutes - startMinutes) return [];

    // ── Generate slot candidates ────────────────────────────────────────────
    const slots: AvailabilitySlot[] = [];
    const current = new Date(fromDate);

    while (current <= toDate) {
      const dayOfWeek = current.getUTCDay(); // 0=Sun...6=Sat (UTC)
      const dateStr = current.toISOString().slice(0, 10); // YYYY-MM-DD

      if (workDays.includes(dayOfWeek) && !blockedDates.has(dateStr)) {
        const year = current.getUTCFullYear();
        const month = current.getUTCMonth();
        const day = current.getUTCDate();

        let slotStart = startMinutes;
        while (slotStart + duration <= endMinutes) {
          const slotStartMs = Date.UTC(year, month, day, Math.floor(slotStart / 60), slotStart % 60, 0, 0);
          const slotEndMs = slotStartMs + duration * 60_000;
          slots.push({
            starts_at: new Date(slotStartMs).toISOString(),
            ends_at: new Date(slotEndMs).toISOString(),
          });
          slotStart += duration;
        }
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    // ── Load existing appointments in range (exclude cancelled/no_show) ─────
    const appointments = await this.repo
      .createQueryBuilder('appt')
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .andWhere('appt.starts_at < :to', { to: toDate.toISOString() })
      .andWhere('appt.ends_at > :from', { from: fromDate.toISOString() })
      .andWhere('appt.status NOT IN (:...excluded)', { excluded: ['cancelled', 'no_show'] })
      .select(['appt.starts_at', 'appt.ends_at'])
      .getMany();

    // ── Filter slots that overlap with existing appointments (+ buffer) ─────
    const bufferMs = buffer * 60_000;
    return slots.filter((slot) => {
      const slotStart = new Date(slot.starts_at).getTime();
      const slotEnd = new Date(slot.ends_at).getTime();
      return !appointments.some((appt) => {
        const apptStart = appt.starts_at.getTime() - bufferMs;
        const apptEnd = appt.ends_at.getTime() + bufferMs;
        return slotStart < apptEnd && slotEnd > apptStart;
      });
    });
  }

  async getMetrics(organizationId: string, calendarId?: string): Promise<AppointmentMetrics> {
    const qb = this.repo
      .createQueryBuilder('appt')
      .select([
        `COUNT(CASE WHEN appt.starts_at::date = CURRENT_DATE THEN 1 END)::int AS today_count`,
        `COUNT(CASE WHEN appt.starts_at >= date_trunc('week', NOW()) AND appt.starts_at < date_trunc('week', NOW()) + INTERVAL '7 days' THEN 1 END)::int AS week_count`,
        `COUNT(CASE WHEN appt.status IN ('pending', 'scheduled') THEN 1 END)::int AS pending_count`,
        `COUNT(CASE WHEN appt.status = 'completed' THEN 1 END)::int AS completed_count`,
      ])
      .where('appt.organization_id = :orgId', { orgId: organizationId });

    if (calendarId) {
      qb.andWhere('appt.calendar_id = :calId', { calId: calendarId });
    }

    const result = await qb.getRawOne<{
        today_count: string;
        week_count: string;
        pending_count: string;
        completed_count: string;
      }>();

    return {
      today_count: parseInt(result?.today_count ?? '0', 10),
      week_count: parseInt(result?.week_count ?? '0', 10),
      pending_count: parseInt(result?.pending_count ?? '0', 10),
      completed_count: parseInt(result?.completed_count ?? '0', 10),
    };
  }

  private async resolveTimezone(
    organizationId: string,
    calendarId?: string,
    requested?: string,
  ): Promise<string> {
    let timezone = requested;
    if (!timezone || timezone === 'UTC') {
      if (calendarId) {
        const calendar = await this.scheduleRepo.findOne({
          where: { id: calendarId, organization_id: organizationId },
          select: ['timezone'],
        });
        if (calendar?.timezone && calendar.timezone !== 'UTC') {
          timezone = calendar.timezone;
        }
      }
      if (!timezone || timezone === 'UTC') {
        const firstCal = await this.scheduleRepo.findOne({
          where: { organization_id: organizationId },
          order: { created_at: 'ASC' },
          select: ['timezone'],
        });
        if (firstCal?.timezone && firstCal.timezone !== 'UTC') {
          timezone = firstCal.timezone;
        }
      }
    }
    return timezone || 'UTC';
  }

  private appointmentEventPayload(organizationId: string, appt: AppointmentEntity) {
    return {
      organization_id: organizationId,
      appointment_id: appt.id,
      contact_id: appt.contact_id,
      conversation_id: appt.conversation_id ?? null,
      title: appt.title,
      starts_at: appt.starts_at,
      ends_at: appt.ends_at,
      location: appt.location,
      meeting_url: appt.meeting_url,
      timezone: appt.timezone ?? 'UTC',
      created_by: appt.created_by,
      description: appt.description,
      origin: appt.origin,
    };
  }

  private emitAppointmentCreated(organizationId: string, appt: AppointmentEntity): void {
    void this.webhookDispatcher?.dispatch('appointment.created', organizationId, {
      appointment_id: appt.id,
      title: appt.title,
      starts_at: appt.starts_at,
    });
    this.rmqClient?.emit(
      RABBITMQ_QUEUES.APPOINTMENT_CREATED,
      this.appointmentEventPayload(organizationId, appt),
    );
    void this.realtimeBroadcast?.notifyOrg(organizationId, {
      type: 'appointment',
      title: `Nueva cita: ${appt.title}`,
      href: '/schedule',
      appointmentId: appt.id,
      contactId: appt.contact_id,
      conversationId: appt.conversation_id ?? undefined,
      actorUserId: appt.created_by ?? undefined,
    });
  }

  private emitAppointmentConfirmed(organizationId: string, appt: AppointmentEntity): void {
    this.rmqClient?.emit(
      RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED,
      this.appointmentEventPayload(organizationId, appt),
    );
  }

  /** Generic emitter for lifecycle events (completed, no_show, …). */
  private emitAppointmentLifecycle(
    queue: string,
    organizationId: string,
    appt: AppointmentEntity,
  ): void {
    this.rmqClient?.emit(queue, this.appointmentEventPayload(organizationId, appt));
  }
}
