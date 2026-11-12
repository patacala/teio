-- =============================================================================
-- 049_calendar_booking_rules.sql  –  Staff calendars and booking windows
--
--   * owner_user_id: the staff member a calendar belongs to. Their bookings
--     across all of their calendars never overlap, and new bookings are
--     assigned to them.
--   * min_notice_minutes: how soon a slot can be booked (0 = any future time).
--   * max_advance_days: how far ahead a slot can be booked (NULL = no limit).
--   * Drops scheduling.calendars, unused since 021 moved calendars to
--     work_schedules.
-- Idempotent.
-- =============================================================================

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
