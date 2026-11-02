-- 025: Platform admin flag + system templates support
-- Platform admin flag on users (independent of org role)
ALTER TABLE core.users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- System template flag + nullable org_id
ALTER TABLE integrations.communication_templates
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE integrations.communication_templates
  ALTER COLUMN organization_id DROP NOT NULL;

-- Index for system template fallback lookup
CREATE INDEX IF NOT EXISTS idx_comm_tpl_system
  ON integrations.communication_templates (event_type, channel_type, is_active)
  WHERE is_system = true AND organization_id IS NULL;
