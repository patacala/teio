-- 015: Appointments extensions
-- Make calendar_id nullable (not required in MVP UI)
ALTER TABLE scheduling.appointments ALTER COLUMN calendar_id DROP NOT NULL;

-- Add origin column
ALTER TABLE scheduling.appointments
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'human'
    CHECK (origin IN ('ai', 'human', 'webhook'));

-- Add created_by column
ALTER TABLE scheduling.appointments
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES core.users(id) ON DELETE SET NULL;

-- Expand status check to include 'pending'
ALTER TABLE scheduling.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE scheduling.appointments
  ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('pending', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'));
