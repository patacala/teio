-- 019_work_schedules.sql
-- Work schedule config per organization

CREATE TABLE IF NOT EXISTS scheduling.work_schedules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL UNIQUE REFERENCES core.organizations(id) ON DELETE CASCADE,
  work_days             INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 0=Sun ... 6=Sat
  start_time            TIME NOT NULL DEFAULT '09:00',
  end_time              TIME NOT NULL DEFAULT '18:00',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (15,30,60)),
  buffer_minutes        INTEGER NOT NULL DEFAULT 0,
  timezone              VARCHAR(100) NOT NULL DEFAULT 'UTC',
  blocked_dates         DATE[] NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_work_schedules_updated_at
  BEFORE UPDATE ON scheduling.work_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_work_schedules_org_id ON scheduling.work_schedules (organization_id);
