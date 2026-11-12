import type { Repository } from 'typeorm';
import { CalendarSystemKey } from '@crm/shared';
import { WorkScheduleEntity } from './work-schedule.entity';

export const DEFAULT_CALENDAR_RULES = {
  work_days: [1, 2, 3, 4, 5],
  start_time: '09:00',
  end_time: '18:00',
  slot_duration_minutes: 30,
  buffer_minutes: 0,
  blocked_dates: [] as string[],
  hold_minutes: 60,
  contact_reschedule_days: 14,
};

const SYSTEM_CALENDARS: Record<CalendarSystemKey, { name: string; type: string; color: string }> = {
  [CalendarSystemKey.APPOINTMENTS]: { name: 'Appointments', type: 'appointments', color: '#2563EB' },
  [CalendarSystemKey.FOLLOW_UP]: { name: 'Follow-up', type: 'follow_up', color: '#16a34a' },
};

/**
 * The organization's business time zone: its appointments calendar, else the
 * oldest calendar, else UTC.
 */
export async function findOrganizationTimezone(
  repo: Repository<WorkScheduleEntity>,
  organizationId: string,
): Promise<string> {
  const system = await repo.findOne({
    where: { organization_id: organizationId, system_key: CalendarSystemKey.APPOINTMENTS },
    select: ['id', 'timezone'],
  });
  if (system?.timezone) return system.timezone;
  const oldest = await repo.findOne({
    where: { organization_id: organizationId },
    order: { created_at: 'ASC' },
    select: ['id', 'timezone'],
  });
  return oldest?.timezone || 'UTC';
}

/**
 * Returns the organization's system calendar for `key`, creating it if
 * missing. Safe under concurrency: the (organization_id, system_key) unique
 * index turns a racing second insert into a no-op.
 */
export async function ensureSystemCalendar(
  repo: Repository<WorkScheduleEntity>,
  organizationId: string,
  key: CalendarSystemKey,
): Promise<WorkScheduleEntity> {
  const existing = await repo.findOne({ where: { organization_id: organizationId, system_key: key } });
  if (existing) return existing;

  const timezone = await findOrganizationTimezone(repo, organizationId);
  const def = SYSTEM_CALENDARS[key];
  await repo
    .createQueryBuilder()
    .insert()
    .into(WorkScheduleEntity)
    .values({
      organization_id: organizationId,
      system_key: key,
      name: def.name,
      type: def.type,
      color: def.color,
      is_active: true,
      timezone,
      ...DEFAULT_CALENDAR_RULES,
    })
    .orIgnore()
    .execute();

  return repo.findOneOrFail({ where: { organization_id: organizationId, system_key: key } });
}
