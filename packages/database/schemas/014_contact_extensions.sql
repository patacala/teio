-- Migration 014: Contact extensions, funnel stages, message templates, conversation bot_active
-- Run after 013_billing.sql

-- Add lead_stage and lead_score to contacts
ALTER TABLE clients.contacts
  ADD COLUMN IF NOT EXISTS lead_stage VARCHAR(100),
  ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;

-- Add bot_active to conversations
ALTER TABLE conversations.conversations
  ADD COLUMN IF NOT EXISTS bot_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Funnel stages table
CREATE TABLE IF NOT EXISTS clients.funnel_stages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  "order"      INTEGER NOT NULL DEFAULT 0,
  color        VARCHAR(20),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funnel_stages_org ON clients.funnel_stages(organization_id, "order");

-- Message templates table
CREATE TABLE IF NOT EXISTS conversations.message_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  content         TEXT NOT NULL,
  channel         VARCHAR(50) NOT NULL DEFAULT 'all',
  variables       TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_org_channel
  ON conversations.message_templates(organization_id, channel);

-- Seed default funnel stages (org-agnostic seed — real orgs get their own via API)
-- (No global seed; stages are org-scoped)
