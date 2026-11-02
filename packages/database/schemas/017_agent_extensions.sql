-- Add configuration columns to existing ai_agents table
ALTER TABLE agents.ai_agents
  ADD COLUMN IF NOT EXISTS role              VARCHAR(100) NOT NULL DEFAULT 'assistant',
  ADD COLUMN IF NOT EXISTS tone              VARCHAR(50)  NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS welcome_message   TEXT,
  ADD COLUMN IF NOT EXISTS fallback_message  TEXT,
  ADD COLUMN IF NOT EXISTS apology_message   TEXT,
  ADD COLUMN IF NOT EXISTS transfer_keywords TEXT[] DEFAULT '{}';

-- Agent capture fields: dynamic data collection config per agent
CREATE TABLE IF NOT EXISTS agents.agent_capture_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES agents.ai_agents(id) ON DELETE CASCADE,
  field_name      VARCHAR(100) NOT NULL,
  field_label     VARCHAR(255) NOT NULL,
  field_type      VARCHAR(50)  NOT NULL DEFAULT 'text'
                    CHECK (field_type IN ('text', 'email', 'phone', 'number', 'date', 'boolean')),
  required        BOOLEAN NOT NULL DEFAULT false,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capture_fields_agent ON agents.agent_capture_fields(agent_id);
CREATE INDEX IF NOT EXISTS idx_capture_fields_org   ON agents.agent_capture_fields(organization_id);

CREATE TRIGGER agent_capture_fields_updated_at
  BEFORE UPDATE ON agents.agent_capture_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
