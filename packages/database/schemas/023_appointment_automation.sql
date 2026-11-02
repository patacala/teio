-- 023: Extend appointments for automation engine
-- Adds automation fields to scheduling.appointments so Follow-up calendar
-- entries become programmable actions (send_message, send_email, etc.)

ALTER TABLE scheduling.appointments
  ADD COLUMN IF NOT EXISTS action VARCHAR(20),
  ADD COLUMN IF NOT EXISTS executor VARCHAR(10) DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS channel_strategy VARCHAR(20) DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS message_content TEXT,
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS resolved_channel VARCHAR(50),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Index for the Scheduler: find due automatable appointments
CREATE INDEX IF NOT EXISTS idx_appointments_automation_due
  ON scheduling.appointments (status, starts_at)
  WHERE action IS NOT NULL AND status IN ('pending', 'scheduled');

-- Add 'automation' to origin check constraint
ALTER TABLE scheduling.appointments DROP CONSTRAINT IF EXISTS appointments_origin_check;
ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_origin_check
  CHECK (origin IN ('ai', 'human', 'webhook', 'automation'));

-- Add 'processing' and 'failed' to status check constraint
ALTER TABLE scheduling.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'processing', 'failed'));

-- Fix: existing Follow-up calendars with wrong type
UPDATE scheduling.work_schedules
  SET type = 'follow_up'
  WHERE name = 'Follow-up' AND type = 'appointments';
