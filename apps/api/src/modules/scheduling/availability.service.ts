import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { AppointmentStatus } from '@crm/shared';
import { AppointmentEntity } from './appointment.entity';
import { WorkScheduleEntity } from './work-schedule.entity';
import { CalendarService } from './calendar.service';
import {
  BookingViolation,
  BusyInterval,
  MAX_AVAILABILITY_DAYS,
  Slot,
  checkBookingWindow,
  generateSlots,
  hasConflict,
  toLocalDate,
  toScheduleRules,
} from './domain/availability';
import { ACTIVE_BOOKING_STATUSES } from './domain/lifecycle';
import { daysBetween } from './domain/timezone';
import { SlotUnavailableException } from './scheduling.types';
import type { AvailabilityQueryDto } from './dto/appointment.dto';

export type AvailabilityQuery = AvailabilityQueryDto;

const DAY_MS = 86_400_000;

export interface AvailabilityResult {
  calendar_id: string;
  timezone: string;
  duration_minutes: number;
  slots: Slot[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepo: Repository<AppointmentEntity>,
    private readonly calendars: CalendarService,
  ) {}

  /** Bookable slots, in the calendar's own time zone rules. */
  async getAvailability(organizationId: string, query: AvailabilityQuery): Promise<AvailabilityResult> {
    const calendar = query.calendar_id
      ? await this.calendars.getCalendarById(organizationId, query.calendar_id)
      : await this.calendars.getDefaultCalendar(organizationId);
    const rules = toScheduleRules(calendar);

    const fromDate = toLocalDate(query.from, rules.timezone);
    const toDate = toLocalDate(query.to, rules.timezone);
    if (!fromDate) throw new BadRequestException(`Invalid from date: ${query.from}`);
    if (!toDate) throw new BadRequestException(`Invalid to date: ${query.to}`);
    const span = daysBetween(fromDate, toDate);
    if (span < 0) throw new BadRequestException('to must not be before from');
    if (span >= MAX_AVAILABILITY_DAYS) {
      throw new BadRequestException(`A query can cover at most ${MAX_AVAILABILITY_DAYS} days`);
    }

    const duration = query.duration_minutes ?? rules.slotMinutes;
    // Wide enough for any UTC offset plus the buffer.
    const lower = new Date(Date.parse(`${fromDate}T00:00:00Z`) - 2 * DAY_MS);
    const upper = new Date(Date.parse(`${toDate}T00:00:00Z`) + 3 * DAY_MS);
    const busy = await this.loadBusy(this.appointmentRepo.manager, calendar, lower, upper, query.exclude_appointment_id);

    return {
      calendar_id: calendar.id,
      timezone: rules.timezone,
      duration_minutes: duration,
      slots: generateSlots(rules, { fromDate, toDate, durationMinutes: duration, busy, now: new Date() }),
    };
  }

  /**
   * Active bookings that overlap [from, to) on this calendar — and, when the
   * calendar belongs to a staff member, on any of their calendars or assigned
   * to them. Expired holds are free.
   */
  async loadBusy(
    manager: EntityManager,
    calendar: Pick<WorkScheduleEntity, 'id' | 'owner_user_id'>,
    from: Date,
    to: Date,
    excludeId?: string,
  ): Promise<BusyInterval[]> {
    const qb = manager
      .getRepository(AppointmentEntity)
      .createQueryBuilder('a')
      .select(['a.id', 'a.starts_at', 'a.ends_at'])
      .where('a.status IN (:...active)', { active: [...ACTIVE_BOOKING_STATUSES, 'pending'] })
      .andWhere(`(a.status <> :held OR a.hold_expires_at > NOW())`, { held: AppointmentStatus.HELD })
      .andWhere('a.starts_at < :to AND a.ends_at > :from', { from, to });
    if (calendar.owner_user_id) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('a.calendar_id = :calendarId', { calendarId: calendar.id })
            .orWhere('a.assigned_to = :owner', { owner: calendar.owner_user_id })
            .orWhere(
              'a.calendar_id IN (SELECT ws.id FROM scheduling.work_schedules ws WHERE ws.owner_user_id = :owner)',
            ),
        ),
      );
    } else {
      qb.andWhere('a.calendar_id = :calendarId', { calendarId: calendar.id });
    }
    if (excludeId) qb.andWhere('a.id <> :excludeId', { excludeId });
    const rows = await qb.getMany();
    return rows.map((r) => ({ id: r.id, start: r.starts_at, end: r.ends_at }));
  }

  /**
   * Rules a booking breaks on a (locked) calendar, including overlaps with
   * other active bookings. Throws SlotUnavailableException unless `override`
   * is set, in which case the broken rules are returned for the audit trail.
   */
  async assertBookable(
    manager: EntityManager,
    calendar: WorkScheduleEntity,
    start: Date,
    end: Date,
    options: { excludeId?: string; override?: boolean; now?: Date } = {},
  ): Promise<BookingViolation[]> {
    const rules = toScheduleRules(calendar);
    const violations = checkBookingWindow(rules, start, end, options.now ?? new Date());
    if (violations.includes('invalid_time_range')) throw new SlotUnavailableException(violations);

    const margin = rules.bufferMinutes * 60_000;
    const busy = await this.loadBusy(
      manager,
      calendar,
      new Date(start.getTime() - margin),
      new Date(end.getTime() + margin),
    );
    if (hasConflict(rules, start, end, busy, options.excludeId)) violations.push('conflict');

    if (violations.length && !options.override) throw new SlotUnavailableException(violations);
    return violations;
  }
}
