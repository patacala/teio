-- =============================================================================
-- 007: Integrations & Webhooks
-- =============================================================================

-- Channel integrations (per-organization channel credentials)
CREATE TABLE IF NOT EXISTS integrations.channel_configs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  channel         VARCHAR(50) NOT NULL
                    CHECK (channel IN ('whatsapp', 'sms', 'email', 'instagram',
                                       'facebook', 'slack', 'webchat', 'voice')),
  name            VARCHAR(255) NOT NULL,
  credentials     JSONB NOT NULL DEFAULT '{}',  -- encrypted at app layer
  settings        JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_channel_configs_updated_at
  BEFORE UPDATE ON integrations.channel_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_channel_configs_org_id ON integrations.channel_configs (organization_id);
CREATE UNIQUE INDEX idx_channel_configs_unique ON integrations.channel_configs (organization_id, channel, name);

-- Outbound webhooks (notify external systems)
CREATE TABLE IF NOT EXISTS integrations.webhooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  url             TEXT NOT NULL,
  secret          VARCHAR(255),
  events          TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_webhooks_updated_at
  BEFORE UPDATE ON integrations.webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_webhooks_org_id ON integrations.webhooks (organization_id);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS integrations.webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id      UUID NOT NULL REFERENCES integrations.webhooks (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL,
  status_code     INTEGER,
  response_body   TEXT,
  duration_ms     INTEGER,
  succeeded       BOOLEAN,
  error_message   TEXT,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON integrations.webhook_deliveries (webhook_id);
CREATE INDEX idx_webhook_deliveries_delivered_at ON integrations.webhook_deliveries (delivered_at DESC);
