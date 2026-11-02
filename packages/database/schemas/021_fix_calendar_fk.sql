-- =============================================================================
-- 021: Fix appointments.calendar_id foreign key
-- =============================================================================
-- The original schema (006) created scheduling.calendars as a simple calendar
-- resource table with owner_id. The application instead uses
-- scheduling.work_schedules for full calendar management (schedule config,
-- multi-calendar per org, etc.).
--
-- This migration:
--   1. Drops the FK that points to the unused scheduling.calendars table
--   2. Adds a FK pointing to scheduling.work_schedules (the real calendar table)
--   3. Assigns any NULL calendar_id appointments to their org's first calendar
-- =============================================================================

-- Step 1: Drop the stale FK to scheduling.calendars
ALTER TABLE scheduling.appointments
  DROP CONSTRAINT IF EXISTS appointments_calendar_id_fkey;

-- Step 2: Add the correct FK to scheduling.work_schedules
--         ON DELETE SET NULL: if a calendar is deleted, appointments become
--         unassigned (listCalendars will re-assign them to the next calendar)
ALTER TABLE scheduling.appointments
  ADD CONSTRAINT appointments_calendar_id_fkey
    FOREIGN KEY (calendar_id)
    REFERENCES scheduling.work_schedules(id)
    ON DELETE SET NULL;

-- Step 3: Assign existing NULL-calendar appointments to each org's first calendar
--         This is idempotent — safe to run multiple times
UPDATE scheduling.appointments a
SET calendar_id = (
  SELECT ws.id
  FROM   scheduling.work_schedules ws
  WHERE  ws.organization_id = a.organization_id
  ORDER  BY ws.created_at ASC
  LIMIT  1
)
WHERE a.calendar_id IS NULL
  AND EXISTS (
    SELECT 1 FROM scheduling.work_schedules ws
    WHERE ws.organization_id = a.organization_id
  );
