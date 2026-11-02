-- Migration 009: API Keys + auth_user_id on users
-- Add Supabase auth link to users
ALTER TABLE core.users ADD COLUMN IF NOT EXISTS
  auth_user_id VARCHAR(255) UNIQUE;

-- API keys table
CREATE TABLE IF NOT EXISTS core.api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES core.users(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  key_hash        VARCHAR(255) NOT NULL UNIQUE,
  key_prefix      VARCHAR(12)  NOT NULL,
  scopes          TEXT[]       NOT NULL DEFAULT '{}',
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  expires_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON core.api_keys (organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON core.api_keys (key_prefix);
