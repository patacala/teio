-- =============================================================================
-- 047_scheduled_actions.sql  –  Follow-up steps leave the appointments table
--
-- Automation steps ("send a WhatsApp at 10:00") were stored as 15-minute
-- appointments, so every booking query had to filter them out. They now live
-- in scheduling.scheduled_actions and appointments only hold real bookings.
--
--   * Existing steps are copied with the SAME id, so callbacks already in
--     flight (n8n complete_follow_up with the old appointment id) keep working.
--   * Copied rows are removed from appointments, and appointments.action must
--     stay NULL from now on. The automation columns on appointments are no
--     longer read and can be dropped in a later release.
--   * status 'awaiting_user': a step a person has to do (executor = 'user').
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduling.scheduled_actions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  calendar_id       UUID REFERENCES scheduling.work_schedules(id) ON DELETE SET NULL,
  contact_id        UUID NOT NULL REFERENCES clients.contacts(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations.conversations(id) ON DELETE SET NULL,
  sequence_id       UUID REFERENCES scheduling.automation_sequences(id) ON DELETE SET NULL,
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  action            VARCHAR(20) NOT NULL,
  executor          VARCHAR(10) NOT NULL DEFAULT 'system',
  channel_strategy  VARCHAR(20) NOT NULL DEFAULT 'auto',
  message_content   TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  due_at            TIMESTAMPTZ NOT NULL,
  timezone          VARCHAR(100) NOT NULL DEFAULT 'UTC',
  source            VARCHAR(50) NOT NULL DEFAULT 'manual',
  origin            VARCHAR(20) NOT NULL DEFAULT 'automation',
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 3,
  last_error        TEXT,
  resolved_channel  VARCHAR(50),
  completed_at      TIMESTAMPTZ,
  completed_by      UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES core.users(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scheduled_actions_status_check
    CHECK (status IN ('pending', 'processing', 'awaiting_user', 'completed', 'cancelled', 'failed')),
  CONSTRAINT scheduled_actions_action_check
    CHECK (action IN ('send_message', 'send_email', 'notify_agent', 'create_task', 'call')),
  CONSTRAINT scheduled_actions_executor_check CHECK (executor IN ('system', 'user')),
  CONSTRAINT scheduled_actions_contact_same_org_fkey
    FOREIGN KEY (organization_id, contact_id) REFERENCES clients.contacts (organization_id, id)
);

DROP TRIGGER IF EXISTS trg_scheduled_actions_updated_at ON scheduling.scheduled_actions;
CREATE TRIGGER trg_scheduled_actions_updated_at
  BEFORE UPDATE ON scheduling.scheduled_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- The scheduler: due steps.
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_due
  ON scheduling.scheduled_actions (due_at)
  WHERE status = 'pending';
-- The reaper: steps dispatched to n8n that never came back.
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_processing
  ON scheduling.scheduled_actions (updated_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_org_due
  ON scheduling.scheduled_actions (organization_id, due_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_contact
  ON scheduling.scheduled_actions (organization_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_sequence
  ON scheduling.scheduled_actions (sequence_id)
  WHERE sequence_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Move existing steps (same ids) and keep appointments for bookings only.
-- ---------------------------------------------------------------------------
INSERT INTO scheduling.scheduled_actions (
  id, organization_id, calendar_id, contact_id, conversation_id, sequence_id, title, description,
  action, executor, channel_strategy, message_content, status, due_at, timezone, source, origin,
  attempts, max_attempts, last_error, resolved_channel, completed_at, created_by, metadata,
  created_at, updated_at
)
SELECT
  a.id, a.organization_id, a.calendar_id, a.contact_id, a.conversation_id, a.sequence_id, a.title, a.description,
  CASE WHEN a.action IN ('send_message', 'send_email', 'notify_agent', 'create_task', 'call')
       THEN a.action ELSE 'notify_agent' END,
  CASE WHEN a.executor = 'user' THEN 'user' ELSE 'system' END,
  COALESCE(a.channel_strategy, 'auto'), a.message_content,
  CASE a.status
    WHEN 'scheduled' THEN 'pending'
    WHEN 'confirmed' THEN 'pending'
    WHEN 'held' THEN 'pending'
    WHEN 'no_show' THEN 'cancelled'
    ELSE a.status
  END,
  a.starts_at, a.timezone, COALESCE(a.source, 'manual'), a.origin,
  a.attempts, a.max_attempts, a.last_error, a.resolved_channel, a.completed_at, a.created_by, a.metadata,
  a.created_at, a.updated_at
FROM scheduling.appointments a
WHERE a.action IS NOT NULL
  AND EXISTS (SELECT 1 FROM clients.contacts c WHERE c.id = a.contact_id AND c.organization_id = a.organization_id)
ON CONFLICT (id) DO NOTHING;

DELETE FROM scheduling.appointments a
 WHERE a.action IS NOT NULL
   AND EXISTS (SELECT 1 FROM scheduling.scheduled_actions s WHERE s.id = a.id);

-- Anything left (steps pointing at another organization's contact) is dropped:
-- it could never have been executed correctly.
DELETE FROM scheduling.appointments WHERE action IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_bookings_only_check') THEN
    ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_bookings_only_check
      CHECK (action IS NULL);
  END IF;
END $$;

DROP INDEX IF EXISTS scheduling.idx_appointments_automation_due;
