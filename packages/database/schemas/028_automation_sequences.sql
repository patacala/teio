-- 028_automation_sequences.sql
-- Automation sequences for follow-up workflows

CREATE TABLE IF NOT EXISTS scheduling.automation_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES clients.contacts(id) ON DELETE CASCADE,
  conversation_id UUID,
  sequence_type VARCHAR(30) NOT NULL DEFAULT 'no_response',
  current_attempt INT NOT NULL DEFAULT 1,
  max_attempts INT NOT NULL DEFAULT 7,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  completion_reason VARCHAR(30),
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active sequence per contact per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_active_contact
  ON scheduling.automation_sequences (organization_id, contact_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sequence_org_status
  ON scheduling.automation_sequences (organization_id, status);

-- Add sequence_id to appointments
ALTER TABLE scheduling.appointments
  ADD COLUMN IF NOT EXISTS sequence_id UUID
  REFERENCES scheduling.automation_sequences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_sequence
  ON scheduling.appointments (sequence_id) WHERE sequence_id IS NOT NULL;
