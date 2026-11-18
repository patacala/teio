import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/058_automations.sql. */
export class Automations1794100000000 implements MigrationInterface {
  name = 'Automations1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
-- =============================================================================
-- 058_automations.sql  –  Automations (workflow builder) replace sequences
--
-- Each organization builds its own automations: triggers (an event, a
-- schedule, or manual enrolment) + a tree of steps + settings.
--
--   * automations / automation_versions: the editable draft and the immutable
--     published versions. Runs pin to a version, so editing never changes a
--     run in progress.
--   * automation_triggers / automation_schedules: lookup tables rebuilt on
--     publish/pause — which automations an event or a clock tick starts.
--   * automation_runs: one execution. 'contact' scope = about one contact;
--     'organization' scope = a scheduled run for the whole organization.
--   * automation_run_steps: what each step did (history shown in the app).
--   * automation_deliveries: one row per step and recipient, written before
--     sending, so a retry never messages the same recipient twice.
--   * scheduled_actions.run_id: a task created by a run can resume it.
--
-- The legacy follow-up sequences are cancelled here (product decision: no
-- migration of runs in progress). Their tables stay, unused, until the
-- installer has converted every organization's templates; a later migration
-- drops them.
-- Idempotent.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS automation;

-- ---------------------------------------------------------------------------
-- Automations and versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation.automations (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  name                     VARCHAR(200) NOT NULL,
  description              TEXT,
  status                   VARCHAR(20) NOT NULL DEFAULT 'draft',
  category                 VARCHAR(20) NOT NULL DEFAULT 'custom',
  -- Set on automations installed by the platform (system templates).
  template_key             VARCHAR(60),
  is_system                BOOLEAN NOT NULL DEFAULT false,
  locale                   VARCHAR(10) NOT NULL DEFAULT 'en',
  -- Working copy edited in the builder: { triggers, graph, settings }.
  draft                    JSONB NOT NULL DEFAULT '{}',
  published_version_id     UUID,
  has_unpublished_changes  BOOLEAN NOT NULL DEFAULT false,
  created_by               UUID REFERENCES core.users(id) ON DELETE SET NULL,
  updated_by               UUID REFERENCES core.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT automations_status_check CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  CONSTRAINT automations_category_check CHECK (category IN ('ai', 'messaging', 'booking', 'follow_up', 'custom'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_automations_template
  ON automation.automations (organization_id, template_key)
  WHERE template_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automations_org_status
  ON automation.automations (organization_id, status);

CREATE TABLE IF NOT EXISTS automation.automation_versions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id    UUID NOT NULL REFERENCES automation.automations(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  triggers         JSONB NOT NULL DEFAULT '[]',
  graph            JSONB NOT NULL,
  settings         JSONB NOT NULL DEFAULT '{}',
  published_by     UUID REFERENCES core.users(id) ON DELETE SET NULL,
  published_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_automation_versions UNIQUE (automation_id, version)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automations_published_version_fkey') THEN
    ALTER TABLE automation.automations ADD CONSTRAINT automations_published_version_fkey
      FOREIGN KEY (published_version_id) REFERENCES automation.automation_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- What starts an automation (rebuilt from the published version)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation.automation_triggers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  automation_id    UUID NOT NULL REFERENCES automation.automations(id) ON DELETE CASCADE,
  version_id       UUID NOT NULL REFERENCES automation.automation_versions(id) ON DELETE CASCADE,
  trigger_key      VARCHAR(60) NOT NULL,
  filters          JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The event consumer: which active automations does this event start?
CREATE INDEX IF NOT EXISTS idx_automation_triggers_lookup
  ON automation.automation_triggers (organization_id, trigger_key)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS automation.automation_schedules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  automation_id    UUID NOT NULL REFERENCES automation.automations(id) ON DELETE CASCADE,
  version_id       UUID NOT NULL REFERENCES automation.automation_versions(id) ON DELETE CASCADE,
  -- { frequency: once|daily|weekly|monthly, time: 'HH:MM', days_of_week?, day_of_month?, date? }
  spec             JSONB NOT NULL,
  timezone         VARCHAR(100) NOT NULL DEFAULT 'UTC',
  next_run_at      TIMESTAMPTZ,
  last_run_at      TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The scheduler: schedules that are due.
CREATE INDEX IF NOT EXISTS idx_automation_schedules_due
  ON automation.automation_schedules (next_run_at)
  WHERE is_active;

-- ---------------------------------------------------------------------------
-- Runs and what their steps did
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation.automation_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  automation_id     UUID NOT NULL REFERENCES automation.automations(id) ON DELETE CASCADE,
  version_id        UUID NOT NULL REFERENCES automation.automation_versions(id) ON DELETE CASCADE,
  scope             VARCHAR(20) NOT NULL DEFAULT 'contact',
  contact_id        UUID,
  conversation_id   UUID REFERENCES conversations.conversations(id) ON DELETE SET NULL,
  -- false when the automation lets a contact be in it several times at once
  -- (each incoming message, each booking): such runs never block each other.
  exclusive         BOOLEAN NOT NULL DEFAULT true,
  status            VARCHAR(20) NOT NULL DEFAULT 'waiting',
  current_node_key  VARCHAR(64),
  -- When a waiting run continues (a wait step, a timeout, a retry).
  resume_at         TIMESTAMPTZ,
  -- A "wait for event" step: { events, filters, timeout_at }.
  waiting_for       JSONB,
  -- The trigger event and what the steps computed so far.
  context           JSONB NOT NULL DEFAULT '{}',
  -- Bumped on every claim: two workers can never run the same run at once.
  seq               INTEGER NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  attempts          INTEGER NOT NULL DEFAULT 0,
  trigger_key       VARCHAR(60) NOT NULL,
  trigger_event_id  VARCHAR(120),
  exit_reason       VARCHAR(200),
  last_error        TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT automation_runs_status_check
    CHECK (status IN ('waiting', 'running', 'completed', 'exited', 'failed', 'cancelled')),
  CONSTRAINT automation_runs_scope_check CHECK (scope IN ('contact', 'organization')),
  CONSTRAINT automation_runs_contact_scope_check CHECK ((scope = 'contact') = (contact_id IS NOT NULL)),
  -- A contact run can only be about a contact of the same organization.
  CONSTRAINT automation_runs_contact_same_org_fkey
    FOREIGN KEY (organization_id, contact_id) REFERENCES clients.contacts (organization_id, id) ON DELETE CASCADE
);

-- One active run per contact per automation (unless it allows parallel runs).
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_runs_active_contact
  ON automation.automation_runs (automation_id, contact_id)
  WHERE status IN ('waiting', 'running') AND contact_id IS NOT NULL AND exclusive;
-- An event (or a schedule tick) starts an automation at most once, even if redelivered.
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_runs_contact_event
  ON automation.automation_runs (automation_id, contact_id, trigger_event_id)
  WHERE trigger_event_id IS NOT NULL AND contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_runs_org_event
  ON automation.automation_runs (automation_id, trigger_event_id)
  WHERE trigger_event_id IS NOT NULL AND contact_id IS NULL;
-- The scheduler: waiting runs that are due.
CREATE INDEX IF NOT EXISTS idx_automation_runs_due
  ON automation.automation_runs (resume_at)
  WHERE status = 'waiting';
-- The reaper: runs whose worker died.
CREATE INDEX IF NOT EXISTS idx_automation_runs_running
  ON automation.automation_runs (locked_until)
  WHERE status = 'running';
-- Exit rules and "wait for event": the active runs of a contact.
CREATE INDEX IF NOT EXISTS idx_automation_runs_contact_active
  ON automation.automation_runs (organization_id, contact_id)
  WHERE status IN ('waiting', 'running');
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
  ON automation.automation_runs (automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_contact
  ON automation.automation_runs (contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS automation.automation_run_steps (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id           UUID NOT NULL REFERENCES automation.automation_runs(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  step_no          INTEGER NOT NULL,
  node_key         VARCHAR(64) NOT NULL,
  node_type        VARCHAR(40) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'running',
  branch           VARCHAR(40),
  output           JSONB NOT NULL DEFAULT '{}',
  error            TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  CONSTRAINT uq_automation_run_steps UNIQUE (run_id, step_no),
  CONSTRAINT automation_run_steps_status_check CHECK (status IN ('running', 'completed', 'failed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS automation.automation_deliveries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  run_step_id      UUID NOT NULL REFERENCES automation.automation_run_steps(id) ON DELETE CASCADE,
  -- contact:<id>, user:<id>, email:<address>, phone:<number>, ai:<connection id>
  recipient_key    VARCHAR(320) NOT NULL,
  channel          VARCHAR(20) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'sending',
  reference_id     VARCHAR(200),
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_automation_deliveries UNIQUE (run_step_id, recipient_key),
  CONSTRAINT automation_deliveries_status_check CHECK (status IN ('sending', 'sent', 'failed', 'skipped'))
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['automations', 'automation_schedules', 'automation_runs', 'automation_deliveries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON automation.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON automation.%1$s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Tasks created by a run (the "Create task" step) can resume it when done.
-- ---------------------------------------------------------------------------
ALTER TABLE scheduling.scheduled_actions
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES automation.automation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS node_key VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_scheduled_actions_run
  ON scheduling.scheduled_actions (run_id)
  WHERE run_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Legacy follow-up sequences: cancelled, not migrated.
-- ---------------------------------------------------------------------------
UPDATE scheduling.scheduled_actions
   SET status = 'cancelled'
 WHERE sequence_id IS NOT NULL
   AND status IN ('pending', 'processing', 'awaiting_user');

UPDATE scheduling.automation_sequences
   SET status = 'cancelled',
       completion_reason = 'migrated',
       completed_at = NOW()
 WHERE status = 'active';
    `);
  }

  public async down(): Promise<void> {
    // Forward-only: the legacy sequences cancelled here are not resumed.
  }
}
