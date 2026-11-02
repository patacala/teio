-- =============================================================================
-- 030_sequence_steps.sql
-- Follow-up sequences become data-driven: each step carries its own action and
-- channel strategy instead of the hardcoded 'send_message' / 'auto' pair in
-- AutomationSequenceService.createSequenceAppointment().
--
-- Mirrors the funnel template pattern (018): templates are platform seed data
-- that get CLONED into per-sequence steps on creation, so editing a template
-- never affects sequences already in flight.
--
-- Templates are keyed by sequence_type (no_response, reactivation, ...), NOT by
-- channel — the channel is resolved at execution time by
-- ChannelStrategyResolverService from each step's channel_strategy.
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Template (mould). organization_id NULL = platform default; SET = org's own.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduling.sequence_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  sequence_type   VARCHAR(30) NOT NULL DEFAULT 'no_response',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduling.sequence_template_steps (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id      UUID NOT NULL REFERENCES scheduling.sequence_templates(id) ON DELETE CASCADE,
  position         INT NOT NULL,
  action           VARCHAR(20) NOT NULL DEFAULT 'send_message',
  channel_strategy VARCHAR(20) NOT NULL DEFAULT 'auto',
  delay_hours      INT NOT NULL DEFAULT 24,
  config           JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seq_template_steps_position
  ON scheduling.sequence_template_steps (template_id, position);

-- Lookup done on every sequence creation: platform default for a sequence_type
CREATE INDEX IF NOT EXISTS idx_seq_templates_platform
  ON scheduling.sequence_templates (sequence_type)
  WHERE organization_id IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_seq_templates_org
  ON scheduling.sequence_templates (organization_id, sequence_type)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Instance (clone). The plan for ONE sequence — immutable w.r.t. the template.
--
-- Execution state deliberately lives in scheduling.appointments (which already
-- has status/attempts/max_attempts/last_error and links back via sequence_id).
-- Only the observed OUTCOME is recorded here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduling.sequence_steps (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  sequence_id      UUID NOT NULL REFERENCES scheduling.automation_sequences(id) ON DELETE CASCADE,
  position         INT NOT NULL,
  action           VARCHAR(20) NOT NULL DEFAULT 'send_message',
  channel_strategy VARCHAR(20) NOT NULL DEFAULT 'auto',
  delay_hours      INT NOT NULL DEFAULT 24,
  config           JSONB NOT NULL DEFAULT '{}',
  -- What actually ran (e.g. 'call' degraded to 'send_message' with no n8n webhook)
  executed_action  VARCHAR(20),
  -- Which channel the resolver actually picked, for auditing strategy effectiveness
  resolved_channel VARCHAR(20),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_steps_position
  ON scheduling.sequence_steps (sequence_id, position);

CREATE INDEX IF NOT EXISTS idx_sequence_steps_org
  ON scheduling.sequence_steps (organization_id);

-- ---------------------------------------------------------------------------
-- automation_sequences: channel out of metadata JSONB (queryable/indexable),
-- template_id for analytics ("which template converts best?")
-- ---------------------------------------------------------------------------
ALTER TABLE scheduling.automation_sequences
  ADD COLUMN IF NOT EXISTS channel     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES scheduling.sequence_templates(id) ON DELETE SET NULL;

-- Backfill from the JSONB the service used to write
UPDATE scheduling.automation_sequences
   SET channel = metadata->>'channel'
 WHERE channel IS NULL AND metadata->>'channel' IS NOT NULL;

-- =============================================================================
-- Seed: platform templates, one per sequence_type.
--
-- Channel variation is expressed per STEP, not by having a template per channel:
-- resolveAuto() prefers the last conversation channel, so 'auto' on every step
-- would pick the same channel every time. Breaking out of the thread (the call
-- on step 4, the email on step 5) has to be stated explicitly.
-- =============================================================================
DO $$
DECLARE
  t_no_response UUID;
  t_reactivation UUID;
  t_post_service UUID;
  t_reminder UUID;
BEGIN
  IF (SELECT COUNT(*) FROM scheduling.sequence_templates WHERE organization_id IS NULL) > 0 THEN
    RETURN;
  END IF;

  -- no_response — 7 touches over 7 business days, escalating to a call
  INSERT INTO scheduling.sequence_templates(name, description, sequence_type)
    VALUES ('Standard Follow-up', 'Seven touches escalating to a call when the contact goes quiet', 'no_response')
    RETURNING id INTO t_no_response;
  INSERT INTO scheduling.sequence_template_steps(template_id, position, action, channel_strategy, delay_hours) VALUES
    (t_no_response, 1, 'send_message', 'auto',       24),
    (t_no_response, 2, 'send_message', 'auto',       24),
    (t_no_response, 3, 'send_message', 'auto',       24),
    (t_no_response, 4, 'call',         'voice_only', 24),  -- deliberate escalation
    (t_no_response, 5, 'send_message', 'email_only', 24),  -- another lane, in case the thread is unread
    (t_no_response, 6, 'send_message', 'auto',       24),
    (t_no_response, 7, 'send_message', 'auto',       24);  -- breakup message

  -- reactivation — few touches, long gaps
  INSERT INTO scheduling.sequence_templates(name, description, sequence_type)
    VALUES ('Reactivation', 'Low-frequency touches to wake up a cold contact', 'reactivation')
    RETURNING id INTO t_reactivation;
  INSERT INTO scheduling.sequence_template_steps(template_id, position, action, channel_strategy, delay_hours) VALUES
    (t_reactivation, 1, 'send_message', 'auto',       72),
    (t_reactivation, 2, 'send_message', 'email_only', 120),
    (t_reactivation, 3, 'call',         'voice_only', 120),
    (t_reactivation, 4, 'send_message', 'auto',       168);

  -- post_service — short and close to the interaction
  INSERT INTO scheduling.sequence_templates(name, description, sequence_type)
    VALUES ('Post-service Follow-up', 'Short check-in after a completed service', 'post_service')
    RETURNING id INTO t_post_service;
  INSERT INTO scheduling.sequence_template_steps(template_id, position, action, channel_strategy, delay_hours) VALUES
    (t_post_service, 1, 'send_message', 'auto', 24),
    (t_post_service, 2, 'send_message', 'auto', 72),
    (t_post_service, 3, 'send_message', 'auto', 120);

  -- appointment_reminder — hours, not days
  INSERT INTO scheduling.sequence_templates(name, description, sequence_type)
    VALUES ('Appointment Reminder', 'Short reminders ahead of a scheduled appointment', 'appointment_reminder')
    RETURNING id INTO t_reminder;
  INSERT INTO scheduling.sequence_template_steps(template_id, position, action, channel_strategy, delay_hours) VALUES
    (t_reminder, 1, 'send_message', 'auto', 24),
    (t_reminder, 2, 'send_message', 'auto', 2);
END $$;
