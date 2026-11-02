-- =============================================================================
-- 008: Analytics & Events
-- =============================================================================

-- Analytics events (append-only)
CREATE TABLE IF NOT EXISTS analytics.events (
  id              UUID NOT NULL DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  event_type      VARCHAR(100) NOT NULL,
  actor_id        UUID,               -- user or ai_agent
  actor_type      VARCHAR(50),        -- 'user' | 'ai_agent' | 'system'
  resource_id     UUID,               -- conversation, contact, etc.
  resource_type   VARCHAR(50),
  properties      JSONB NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Create monthly partitions for current and next month
CREATE TABLE IF NOT EXISTS analytics.events_2026_03
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_04
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS analytics.events_2026_05
  PARTITION OF analytics.events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE INDEX idx_events_org_id ON analytics.events (organization_id, occurred_at DESC);
CREATE INDEX idx_events_type ON analytics.events (organization_id, event_type, occurred_at DESC);
CREATE INDEX idx_events_resource ON analytics.events (resource_type, resource_id);

-- Conversation metrics (pre-aggregated for dashboards)
CREATE TABLE IF NOT EXISTS analytics.conversation_metrics (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  channel               VARCHAR(50),
  total_conversations   INTEGER NOT NULL DEFAULT 0,
  opened_conversations  INTEGER NOT NULL DEFAULT 0,
  resolved_conversations INTEGER NOT NULL DEFAULT 0,
  avg_response_time_sec INTEGER,
  avg_resolution_time_sec INTEGER,
  ai_handled_count      INTEGER NOT NULL DEFAULT 0,
  human_handled_count   INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, date, channel)
);

CREATE INDEX idx_conv_metrics_org_date ON analytics.conversation_metrics (organization_id, date DESC);

-- Agent performance metrics
CREATE TABLE IF NOT EXISTS analytics.agent_metrics (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  user_id               UUID REFERENCES core.users (id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  conversations_handled INTEGER NOT NULL DEFAULT 0,
  messages_sent         INTEGER NOT NULL DEFAULT 0,
  avg_response_time_sec INTEGER,
  resolved_count        INTEGER NOT NULL DEFAULT 0,
  csat_score            NUMERIC(3, 2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id, date)
);

CREATE INDEX idx_agent_metrics_org_date ON analytics.agent_metrics (organization_id, date DESC);
