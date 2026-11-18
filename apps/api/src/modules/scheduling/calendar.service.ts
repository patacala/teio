import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CalendarSystemKey } from '@crm/shared';
import { WorkScheduleEntity } from './work-schedule.entity';
import { AppointmentEntity } from './appointment.entity';
import { parseTimeToMinutes } from './domain/availability';
import { ACTIVE_BOOKING_STATUSES } from './domain/lifecycle';
import {
  DEFAULT_CALENDAR_RULES,
  ensureSystemCalendar,
  findOrganizationTimezone,
} from './system-calendars';
import type {
  CreateCalendarDto,
  UpdateCalendarConfigDto,
  UpdateCalendarDto,
} from './dto/calendar.dto';

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(WorkScheduleEntity)
    private readonly calendarRepo: Repository<WorkScheduleEntity>,
  ) {}

  /** Creates the two system calendars the first time an organization has none. */
  async listCalendars(organizationId: string): Promise<WorkScheduleEntity[]> {
    const calendars = await this.calendarRepo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'ASC' },
    });
    if (calendars.length > 0) return calendars;
    await this.seedDefaultCalendars(organizationId);
    return this.calendarRepo.find({ where: { organization_id: organizationId }, order: { created_at: 'ASC' } });
  }

  async seedDefaultCalendars(organizationId: string): Promise<void> {
    await ensureSystemCalendar(this.calendarRepo, organizationId, CalendarSystemKey.APPOINTMENTS);
    await ensureSystemCalendar(this.calendarRepo, organizationId, CalendarSystemKey.FOLLOW_UP);
  }

  async getCalendarById(organizationId: string, id: string): Promise<WorkScheduleEntity> {
    const cal = await this.calendarRepo.findOne({ where: { id, organization_id: organizationId } });
    if (!cal) throw new NotFoundException(`Calendar ${id} not found`);
    return cal;
  }

  /** The calendar used when a caller does not name one. */
  async getDefaultCalendar(organizationId: string): Promise<WorkScheduleEntity> {
    await this.listCalendars(organizationId);
    const system = await this.calendarRepo.findOne({
      where: { organization_id: organizationId, system_key: CalendarSystemKey.APPOINTMENTS },
    });
    if (system) return system;
    const firstAppointments = await this.calendarRepo.findOne({
      where: { organization_id: organizationId, type: 'appointments' },
      order: { created_at: 'ASC' },
    });
    if (firstAppointments) return firstAppointments;
    return this.calendarRepo.findOneOrFail({
      where: { organization_id: organizationId },
      order: { created_at: 'ASC' },
    });
  }

  getOrganizationTimezone(organizationId: string): Promise<string> {
    return findOrganizationTimezone(this.calendarRepo, organizationId);
  }

  async createCalendar(organizationId: string, dto: CreateCalendarDto): Promise<WorkScheduleEntity> {
    const timezone = await this.getOrganizationTimezone(organizationId);
    return this.calendarRepo.save(
      this.calendarRepo.create({
        organization_id: organizationId,
        name: dto.name,
        color: dto.color ?? '#2563EB',
        type: dto.type ?? 'appointments',
        is_active: true,
        timezone,
        ...DEFAULT_CALENDAR_RULES,
      }),
    );
  }

  /** `null` when the calendar is unknown or charges nothing. Never throws. */
  async findCalendarPaymentServiceId(organizationId: string, calendarId: string): Promise<string | null> {
    const cal = await this.calendarRepo.findOne({
      where: { id: calendarId, organization_id: organizationId },
      select: ['id', 'payment_service_id'],
    });
    return cal?.payment_service_id ?? null;
  }

  /** The appointments calendar that charges this service (at most one, unique index 035). */
  async findAppointmentsCalendarForPaymentService(
    organizationId: string,
    paymentServiceId: string,
  ): Promise<WorkScheduleEntity | null> {
    const calendars = await this.calendarRepo.find({
      where: { organization_id: organizationId, payment_service_id: paymentServiceId, type: 'appointments' },
    });
    const active = calendars.filter((c) => c.is_active !== false);
    return (active.length ? active : calendars)[0] ?? null;
  }

  /** The org's only active appointments calendar, or null if none/ambiguous. */
  async findDefaultAppointmentsCalendar(organizationId: string): Promise<WorkScheduleEntity | null> {
    const calendars = await this.calendarRepo.find({
      where: { organization_id: organizationId, type: 'appointments', is_active: true },
    });
    return calendars.length === 1 ? calendars[0] : null;
  }

  async updateCalendar(organizationId: string, id: string, dto: UpdateCalendarDto): Promise<WorkScheduleEntity> {
    return this.calendarRepo.manager.transaction(async (manager) => {
      const cal = await this.lockForUpdate(manager, organizationId, id);
      await this.applyIdentity(manager, organizationId, cal, dto);
      return manager.getRepository(WorkScheduleEntity).save(cal);
    });
  }

  /** Rules and identity in one transaction: the settings screen saves everything at once. */
  async updateCalendarConfig(
    organizationId: string,
    id: string,
    dto: UpdateCalendarConfigDto,
  ): Promise<WorkScheduleEntity> {
    return this.calendarRepo.manager.transaction(async (manager) => {
      const cal = await this.lockForUpdate(manager, organizationId, id);
      const startTime = dto.start_time ?? cal.start_time;
      const endTime = dto.end_time ?? cal.end_time;
      if (parseTimeToMinutes(startTime) >= parseTimeToMinutes(endTime)) {
        throw new BadRequestException('start_time must be before end_time');
      }
      await this.applyIdentity(manager, organizationId, cal, dto);
      if (dto.work_days !== undefined) cal.work_days = [...dto.work_days].sort((a, b) => a - b);
      cal.start_time = startTime;
      cal.end_time = endTime;
      if (dto.slot_duration_minutes !== undefined) cal.slot_duration_minutes = dto.slot_duration_minutes;
      if (dto.buffer_minutes !== undefined) cal.buffer_minutes = dto.buffer_minutes;
      if (dto.timezone !== undefined) cal.timezone = dto.timezone;
      if (dto.blocked_dates !== undefined) cal.blocked_dates = [...new Set(dto.blocked_dates)].sort();
      if (dto.hold_minutes !== undefined) cal.hold_minutes = dto.hold_minutes;
      if (dto.min_notice_minutes !== undefined) cal.min_notice_minutes = dto.min_notice_minutes;
      if (dto.max_advance_days !== undefined) cal.max_advance_days = dto.max_advance_days;
      if (dto.contact_reschedule_days !== undefined) cal.contact_reschedule_days = dto.contact_reschedule_days;
      if (dto.reminder_offsets_minutes !== undefined) {
        cal.reminder_offsets_minutes = [...dto.reminder_offsets_minutes].sort((a, b) => b - a);
      }
      return manager.getRepository(WorkScheduleEntity).save(cal);
    });
  }

  private async lockForUpdate(manager: EntityManager, organizationId: string, id: string): Promise<WorkScheduleEntity> {
    const cal = await manager
      .getRepository(WorkScheduleEntity)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id AND c.organization_id = :orgId', { id, orgId: organizationId })
      .getOne();
    if (!cal) throw new NotFoundException(`Calendar ${id} not found`);
    return cal;
  }

  private async applyIdentity(
    manager: EntityManager,
    organizationId: string,
    cal: WorkScheduleEntity,
    dto: Pick<UpdateCalendarDto, 'name' | 'color' | 'is_active' | 'payment_service_id' | 'owner_user_id'>,
  ): Promise<void> {
    if (dto.name !== undefined) cal.name = dto.name;
    if (dto.color !== undefined) cal.color = dto.color;
    if (dto.is_active !== undefined) cal.is_active = dto.is_active;
    if (dto.owner_user_id !== undefined) {
      if (dto.owner_user_id) {
        const [user] = await manager.query(
          'SELECT id FROM core.users WHERE id = $1 AND organization_id = $2 AND is_active = true',
          [dto.owner_user_id, organizationId],
        );
        if (!user) throw new NotFoundException(`Team member ${dto.owner_user_id} not found`);
      }
      cal.owner_user_id = dto.owner_user_id;
    }
    if (dto.payment_service_id !== undefined) {
      if (dto.payment_service_id) {
        // Follow-up cadences must never ask a contact for money.
        if (cal.type !== 'appointments') {
          throw new BadRequestException('Only appointment calendars can charge for a service');
        }
        const [service] = await manager.query(
          'SELECT id FROM payments.services WHERE id = $1 AND organization_id = $2',
          [dto.payment_service_id, organizationId],
        );
        if (!service) throw new NotFoundException(`Service ${dto.payment_service_id} not found`);
        const other = await manager.getRepository(WorkScheduleEntity).findOne({
          where: { organization_id: organizationId, payment_service_id: dto.payment_service_id, type: 'appointments' },
          select: ['id'],
        });
        if (other && other.id !== cal.id) {
          throw new BadRequestException('That service is already linked to another appointments calendar');
        }
      }
      cal.payment_service_id = dto.payment_service_id;
    }
  }

  /**
   * Deletion rules: never the last calendar or the follow-up calendar the
   * automation engine writes to; never while upcoming bookings exist; anything
   * else still on the calendar (past bookings, cancellations, follow-up steps)
   * must be moved to `moveTo`.
   */
  async deleteCalendar(organizationId: string, id: string, moveTo?: string): Promise<void> {
    await this.calendarRepo.manager.transaction(async (manager) => {
      const calendars = manager.getRepository(WorkScheduleEntity);
      const appointments = manager.getRepository(AppointmentEntity);

      const cal = await calendars
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.organization_id = :orgId', { id, orgId: organizationId })
        .getOne();
      if (!cal) throw new NotFoundException(`Calendar ${id} not found`);

      if (cal.system_key === CalendarSystemKey.FOLLOW_UP) {
        throw new ConflictException({
          message: 'The follow-up calendar is used by automation; deactivate it instead of deleting it',
          errors: { code: 'CALENDAR_IS_SYSTEM' },
        });
      }

      const total = await calendars.count({ where: { organization_id: organizationId } });
      if (total <= 1) throw new BadRequestException('The last calendar cannot be deleted');

      const upcoming = await appointments
        .createQueryBuilder('a')
        .where('a.calendar_id = :id', { id })
        .andWhere('a.status IN (:...active)', { active: [...ACTIVE_BOOKING_STATUSES, 'pending'] })
        .andWhere('a.ends_at > NOW()')
        .getCount();
      if (upcoming > 0) {
        throw new ConflictException({
          message: `This calendar has ${upcoming} upcoming appointment(s); cancel or move them before deleting it`,
          errors: { code: 'CALENDAR_HAS_UPCOMING_BOOKINGS', count: upcoming },
        });
      }

      const remaining = await appointments.count({ where: { calendar_id: id } });
      if (remaining > 0) {
        if (!moveTo) {
          throw new ConflictException({
            message: `Choose which calendar to move the ${remaining} past appointment(s) to`,
            errors: { code: 'CALENDAR_MOVE_TARGET_REQUIRED', count: remaining },
          });
        }
        if (moveTo === id) throw new BadRequestException('move_to must be a different calendar');
        const target = await calendars.findOne({ where: { id: moveTo, organization_id: organizationId } });
        if (!target) throw new NotFoundException(`Calendar ${moveTo} not found`);

        // Past bookings still awaiting an outcome count as active; they may
        // overlap bookings on the target, so they move as recorded overrides.
        await appointments
          .createQueryBuilder()
          .update(AppointmentEntity)
          .set({
            override_at: () => 'NOW()',
            override_reason: `Moved from deleted calendar "${cal.name}"`,
          })
          .where('calendar_id = :id AND override_at IS NULL', { id })
          .andWhere('status IN (:...active)', { active: [...ACTIVE_BOOKING_STATUSES] })
          .execute();
        await appointments
          .createQueryBuilder()
          .update(AppointmentEntity)
          .set({ calendar_id: moveTo })
          .where('calendar_id = :id', { id })
          .execute();
      }

      await calendars.delete({ id, organization_id: organizationId });
    });
  }
}
