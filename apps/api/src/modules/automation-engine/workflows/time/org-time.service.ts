import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalendarSystemKey } from '@crm/shared';
import { WorkScheduleEntity } from '../../../scheduling/work-schedule.entity';
import { DEFAULT_CALENDAR_RULES, findOrganizationTimezone } from '../../../scheduling/system-calendars';
import type { BusinessHours } from './automation-time';

/**
 * The organization's clock for automations: its time zone, and its business
 * hours = the follow-up calendar's working days and hours (the calendar the
 * team already uses for follow-ups), or the default calendar hours.
 */
@Injectable()
export class OrgTimeService {
  constructor(
    @InjectRepository(WorkScheduleEntity)
    private readonly calendars: Repository<WorkScheduleEntity>,
  ) {}

  timezone(organizationId: string): Promise<string> {
    return findOrganizationTimezone(this.calendars, organizationId);
  }

  async businessHours(organizationId: string): Promise<BusinessHours> {
    const followUp = await this.calendars.findOne({
      where: { organization_id: organizationId, system_key: CalendarSystemKey.FOLLOW_UP },
      select: ['id', 'work_days', 'start_time', 'end_time', 'timezone'],
    });
    if (followUp) {
      return {
        work_days: followUp.work_days,
        start_time: followUp.start_time,
        end_time: followUp.end_time,
        timezone: followUp.timezone || (await this.timezone(organizationId)),
      };
    }
    return {
      work_days: DEFAULT_CALENDAR_RULES.work_days,
      start_time: DEFAULT_CALENDAR_RULES.start_time,
      end_time: DEFAULT_CALENDAR_RULES.end_time,
      timezone: await this.timezone(organizationId),
    };
  }
}
