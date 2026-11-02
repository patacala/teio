-- =============================================================================
-- 038_funnel_rules.sql  –  Funnel automation rules + system defaults
--
-- Data-driven rules that move a contact to a target `stage_type` when a domain
-- event fires. NULL organization_id/funnel_id = a system default that applies to
-- every org/funnel (resolved against the contact's own funnel by stage_type).
-- Orgs can later add scoped rules that override the defaults by priority.
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS clients.funnel_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
  funnel_id        UUID REFERENCES clients.funnels(id) ON DELETE CASCADE,
  name             VARCHAR(120) NOT NULL,
  trigger_event    VARCHAR(60)  NOT NULL,
  conditions       JSONB        NOT NULL DEFAULT '{}',
  from_stage_types TEXT[]       NOT NULL DEFAULT '{}',
  to_stage_type    VARCHAR(30)  NOT NULL,
  direction_policy VARCHAR(20)  NOT NULL DEFAULT 'forward_only',
  priority         INTEGER      NOT NULL DEFAULT 0,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funnel_rules_trigger
  ON clients.funnel_rules (trigger_event, is_active);

-- System default rules (organization_id/funnel_id NULL). Seeded once, keyed by a
-- stable name so re-running the migration does not duplicate them.
INSERT INTO clients.funnel_rules (name, trigger_event, from_stage_types, to_stage_type, priority)
SELECT * FROM (VALUES
  ('Lead contacted',        'message.received',        ARRAY['new']::TEXT[],                          'contacted',              10),
  ('Data completed',        'contact.data.completed',  ARRAY['new','contacted']::TEXT[],              'qualified',              10),
  ('Appointment scheduled', 'appointment.created',     ARRAY[]::TEXT[],                                'appointment_scheduled',  10),
  ('Appointment confirmed', 'appointment.confirmed',   ARRAY[]::TEXT[],                                'appointment_confirmed',  10),
  ('Deal won',              'appointment.completed',   ARRAY['appointment_confirmed']::TEXT[],        'won',                    10),
  ('Lead lost',             'sequence.exhausted',      ARRAY[]::TEXT[],                                'lost',                   10)
) AS v(name, trigger_event, from_stage_types, to_stage_type, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM clients.funnel_rules r
  WHERE r.organization_id IS NULL AND r.funnel_id IS NULL AND r.name = v.name
);
