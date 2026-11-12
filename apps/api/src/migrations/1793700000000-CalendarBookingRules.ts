import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/054_calendar_booking_rules.sql. */
export class CalendarBookingRules1793700000000 implements MigrationInterface {
  name = 'CalendarBookingRules1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`

ALTER TABLE scheduling.work_schedules
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS min_notice_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_advance_days INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_min_notice_check') THEN
    ALTER TABLE scheduling.work_schedules ADD CONSTRAINT work_schedules_min_notice_check
      CHECK (min_notice_minutes BETWEEN 0 AND 43200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_max_advance_check') THEN
    ALTER TABLE scheduling.work_schedules ADD CONSTRAINT work_schedules_max_advance_check
      CHECK (max_advance_days IS NULL OR max_advance_days BETWEEN 1 AND 730);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_schedules_owner
  ON scheduling.work_schedules (organization_id, owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_assigned_active
  ON scheduling.appointments (assigned_to, starts_at)
  WHERE assigned_to IS NOT NULL AND status IN ('held', 'scheduled', 'confirmed');

DROP TABLE IF EXISTS scheduling.calendars;
    `);
  }

  public async down(): Promise<void> {
    // Forward-only: reverting would lose follow-up steps, reminders or pending events.
  }
}
