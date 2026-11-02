-- =============================================================================
-- 004: Conversation Management
-- =============================================================================

-- Conversations
CREATE TABLE IF NOT EXISTS conversations.conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES clients.contacts (id) ON DELETE CASCADE,
  channel           VARCHAR(50) NOT NULL
                      CHECK (channel IN ('whatsapp', 'sms', 'email', 'instagram',
                                         'facebook', 'slack', 'webchat', 'voice')),
  status            VARCHAR(50) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'pending', 'resolved', 'archived', 'snoozed')),
  assigned_agent_id UUID REFERENCES core.users (id) ON DELETE SET NULL,
  ai_agent_id       UUID,  -- FK added after agents table
  subject           VARCHAR(500),
  last_message_at   TIMESTAMPTZ,
  snoozed_until     TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  tags              TEXT[] DEFAULT '{}',
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_conversations_org_id ON conversations.conversations (organization_id);
CREATE INDEX idx_conversations_contact_id ON conversations.conversations (contact_id);
CREATE INDEX idx_conversations_status ON conversations.conversations (organization_id, status);
CREATE INDEX idx_conversations_channel ON conversations.conversations (organization_id, channel);
CREATE INDEX idx_conversations_assigned ON conversations.conversations (assigned_agent_id);
CREATE INDEX idx_conversations_last_msg ON conversations.conversations (organization_id, last_message_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS conversations.messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations.conversations (id) ON DELETE CASCADE,
  content         TEXT NOT NULL DEFAULT '',
  type            VARCHAR(50) NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text', 'image', 'video', 'audio', 'file',
                                    'location', 'template', 'interactive', 'system')),
  direction       VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  sender_id       UUID REFERENCES core.users (id) ON DELETE SET NULL,
  external_id     VARCHAR(500),       -- provider message ID
  media_url       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON conversations.messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_messages_conversation_id ON conversations.messages (conversation_id);
CREATE INDEX idx_messages_org_id ON conversations.messages (organization_id);
CREATE INDEX idx_messages_sent_at ON conversations.messages (conversation_id, sent_at DESC);
CREATE INDEX idx_messages_external_id ON conversations.messages (organization_id, external_id);

-- Conversation labels
CREATE TABLE IF NOT EXISTS conversations.labels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  color           VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_labels_org_id ON conversations.labels (organization_id);
