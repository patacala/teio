-- =============================================================================
-- 006: Scheduling & Appointments
-- =============================================================================

-- Calendar resources
CREATE TABLE IF NOT EXISTS scheduling.calendars (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  timezone        VARCHAR(100) NOT NULL DEFAULT 'UTC',
  working_hours   JSONB NOT NULL DEFAULT '{}',
  buffer_time     INTEGER NOT NULL DEFAULT 15,  -- minutes between appointments
  is_active       BOOLEAN NOT NULL DEFAULT true,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_calendars_updated_at
  BEFORE UPDATE ON scheduling.calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_calendars_org_id ON scheduling.calendars (organization_id);
CREATE INDEX idx_calendars_owner_id ON scheduling.calendars (owner_id);

-- Appointments
CREATE TABLE IF NOT EXISTS scheduling.appointments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  calendar_id     UUID NOT NULL REFERENCES scheduling.calendars (id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES clients.contacts (id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations.conversations (id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES core.users (id) ON DELETE SET NULL,
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  status          VARCHAR(50) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'confirmed', 'completed',
                                      'cancelled', 'no_show')),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  timezone        VARCHAR(100) NOT NULL DEFAULT 'UTC',
  location        TEXT,
  meeting_url     TEXT,
  reminder_sent   BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON scheduling.appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_appointments_org_id ON scheduling.appointments (organization_id);
CREATE INDEX idx_appointments_calendar_id ON scheduling.appointments (calendar_id);
CREATE INDEX idx_appointments_contact_id ON scheduling.appointments (contact_id);
CREATE INDEX idx_appointments_assigned_to ON scheduling.appointments (assigned_to);
CREATE INDEX idx_appointments_starts_at ON scheduling.appointments (organization_id, starts_at);
CREATE INDEX idx_appointments_status ON scheduling.appointments (organization_id, status);
