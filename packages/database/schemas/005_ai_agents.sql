-- =============================================================================
-- 005: AI Agents
-- =============================================================================

-- AI Agent configurations
CREATE TABLE IF NOT EXISTS agents.ai_agents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  provider          VARCHAR(50) NOT NULL DEFAULT 'openai'
                      CHECK (provider IN ('openai', 'anthropic', 'google', 'custom')),
  model             VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
  system_prompt     TEXT NOT NULL DEFAULT '',
  temperature       NUMERIC(3, 2) NOT NULL DEFAULT 0.7,
  max_tokens        INTEGER NOT NULL DEFAULT 1000,
  status            VARCHAR(50) NOT NULL DEFAULT 'inactive'
                      CHECK (status IN ('active', 'inactive', 'training', 'error')),
  channels          TEXT[] DEFAULT '{}',  -- which channels this agent handles
  escalation_rules  JSONB NOT NULL DEFAULT '{}',
  knowledge_base    JSONB NOT NULL DEFAULT '{}',
  tools_config      JSONB NOT NULL DEFAULT '{}',
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_by        UUID REFERENCES core.users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ai_agents_updated_at
  BEFORE UPDATE ON agents.ai_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_ai_agents_org_id ON agents.ai_agents (organization_id);
CREATE INDEX idx_ai_agents_status ON agents.ai_agents (organization_id, status);

-- Add FK from conversations to ai_agents (deferred, agent table now exists)
ALTER TABLE conversations.conversations
  ADD CONSTRAINT fk_conversations_ai_agent
  FOREIGN KEY (ai_agent_id) REFERENCES agents.ai_agents (id) ON DELETE SET NULL;

-- AI Agent conversation sessions
CREATE TABLE IF NOT EXISTS agents.ai_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  ai_agent_id     UUID NOT NULL REFERENCES agents.ai_agents (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations.conversations (id) ON DELETE CASCADE,
  messages_log    JSONB NOT NULL DEFAULT '[]',
  token_usage     INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  handed_off_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ai_sessions_updated_at
  BEFORE UPDATE ON agents.ai_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_ai_sessions_org_id ON agents.ai_sessions (organization_id);
CREATE INDEX idx_ai_sessions_conversation_id ON agents.ai_sessions (conversation_id);
CREATE INDEX idx_ai_sessions_agent_id ON agents.ai_sessions (ai_agent_id);
