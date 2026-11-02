-- 020_calendars.sql
-- Transforms work_schedules from 1-per-org to multi-calendar per org.
-- Adds identity columns (name, type, color, is_active) and removes the UNIQUE constraint.

-- 1. Remove the unique constraint so an org can have multiple calendars
ALTER TABLE scheduling.work_schedules
  DROP CONSTRAINT IF EXISTS work_schedules_organization_id_key;

-- 2. Add calendar identity columns
ALTER TABLE scheduling.work_schedules
  ADD COLUMN IF NOT EXISTS name      VARCHAR(100) NOT NULL DEFAULT 'Appointments',
  ADD COLUMN IF NOT EXISTS type      VARCHAR(50)  NOT NULL DEFAULT 'appointments',
  ADD COLUMN IF NOT EXISTS color     VARCHAR(20)  NOT NULL DEFAULT '#2563EB',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN      NOT NULL DEFAULT TRUE;

-- 3. Index for filtering calendars by org
CREATE INDEX IF NOT EXISTS idx_work_schedules_org_id ON scheduling.work_schedules (organization_id);
