-- =============================================================================
-- 044_entity_schema_alignment.sql  –  Columns the API entities use but no
-- schema file created. Found by comparing every TypeORM entity against a
-- database built from these schema files. Without them, channel ingestion
-- (integrations.channels.updated_at) and conversation pin/read tracking fail
-- on a freshly provisioned database.
-- auth_header_value / prosales_document_id were only added by TypeORM
-- migrations; they are repeated here so the SQL schema is complete on its own.
-- Idempotent.
-- =============================================================================

ALTER TABLE integrations.channels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE conversations.conversations
  ADD COLUMN IF NOT EXISTS is_pinned    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

ALTER TABLE ai_agents.agents
  ADD COLUMN IF NOT EXISTS auth_header_value TEXT;

ALTER TABLE knowledge.knowledge_entries
  ADD COLUMN IF NOT EXISTS prosales_document_id UUID;
