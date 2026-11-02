-- 012_ai_automation.sql
-- AI Automation layer: event-driven agents, CRM tools, execution audit logs

CREATE SCHEMA IF NOT EXISTS ai_agents;

-- ai_agents.agents — automation agent config per org
CREATE TABLE IF NOT EXISTS ai_agents.agents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  trigger_event     VARCHAR(100) NOT NULL,  -- 'message.received', 'call.completed', 'contact.created'
  workflow_endpoint TEXT NOT NULL,          -- n8n webhook URL
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_automation_agents_org_event ON ai_agents.agents (organization_id, trigger_event) WHERE is_active = true;

-- ai_agents.agent_tools — CRM tool definitions available to agents
CREATE TABLE IF NOT EXISTS ai_agents.agent_tools (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,     -- 'send_message', 'create_contact', etc.
  description     TEXT,
  endpoint        VARCHAR(500),             -- internal route reference (informational)
  method          VARCHAR(10) NOT NULL DEFAULT 'POST',
  config_schema   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_agent_tools_org_name ON ai_agents.agent_tools (organization_id, name);

-- ai_agents.agent_tool_executions — audit log of every tool call
CREATE TABLE IF NOT EXISTS ai_agents.agent_tool_executions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES ai_agents.agents(id) ON DELETE CASCADE,
  tool_id         UUID REFERENCES ai_agents.agent_tools(id) ON DELETE SET NULL,
  conversation_id UUID,
  input           JSONB NOT NULL DEFAULT '{}',
  result          JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','success','failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tool_executions_agent_id ON ai_agents.agent_tool_executions (agent_id, created_at DESC);
CREATE INDEX idx_tool_executions_org_id   ON ai_agents.agent_tool_executions (organization_id, created_at DESC);

-- ai_agents.agent_logs — full trace log
CREATE TABLE IF NOT EXISTS ai_agents.agent_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES ai_agents.agents(id) ON DELETE CASCADE,
  conversation_id UUID,
  event_type      VARCHAR(100) NOT NULL,  -- 'agent_triggered','workflow_called','tool_called','tool_failed','response_generated'
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_logs_agent_id ON ai_agents.agent_logs (agent_id, created_at DESC);
CREATE INDEX idx_agent_logs_org_id   ON ai_agents.agent_logs (organization_id, created_at DESC);
