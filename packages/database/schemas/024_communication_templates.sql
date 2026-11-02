-- 024_communication_templates.sql
-- Communication templates + delivery log for mapping system events to external provider templates

-- communication_templates: maps (org, event, channel) → external provider template ID
CREATE TABLE IF NOT EXISTS integrations.communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  channel_type VARCHAR(50) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  provider_template_id VARCHAR(500) NOT NULL,
  channel_id UUID REFERENCES integrations.channels(id) ON DELETE SET NULL,
  name VARCHAR(255),
  description TEXT,
  variables_schema JSONB DEFAULT '{}',
  from_override VARCHAR(500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active template per (org, event, channel, provider)
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_tpl_active
  ON integrations.communication_templates (organization_id, event_type, channel_type, provider)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_comm_tpl_org
  ON integrations.communication_templates (organization_id);

CREATE INDEX IF NOT EXISTS idx_comm_tpl_lookup
  ON integrations.communication_templates (organization_id, event_type, channel_type, is_active);

-- communication_deliveries: audit log for dispatched communications
CREATE TABLE IF NOT EXISTS integrations.communication_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  communication_template_id UUID REFERENCES integrations.communication_templates(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  channel_type VARCHAR(50) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  recipient VARCHAR(500) NOT NULL,
  provider_template_id VARCHAR(500),
  variables JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider_message_id VARCHAR(500),
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_del_org
  ON integrations.communication_deliveries (organization_id);

CREATE INDEX IF NOT EXISTS idx_comm_del_org_status
  ON integrations.communication_deliveries (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_comm_del_created
  ON integrations.communication_deliveries (created_at DESC);
