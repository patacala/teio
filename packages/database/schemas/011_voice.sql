-- 011_voice.sql — Voice call tables for Retell AI integration
CREATE SCHEMA IF NOT EXISTS voice;

-- ─── voice.calls ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice.calls (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  contact_id         UUID REFERENCES clients.contacts(id) ON DELETE SET NULL,
  conversation_id    UUID REFERENCES conversations.conversations(id) ON DELETE SET NULL,
  channel            VARCHAR(50) NOT NULL DEFAULT 'voice',
  provider           VARCHAR(50) NOT NULL DEFAULT 'retell',
  external_call_id   VARCHAR(255) NOT NULL,
  phone_from         VARCHAR(50) NOT NULL,
  phone_to           VARCHAR(50) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'initiated'
                       CHECK (status IN ('initiated','in_progress','completed','failed')),
  duration_seconds   INTEGER,
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_external_call_id ON voice.calls (external_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_org_id             ON voice.calls (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_conversation_id    ON voice.calls (conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact_id         ON voice.calls (contact_id);

-- ─── voice.call_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice.call_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  call_id         UUID NOT NULL REFERENCES voice.calls(id) ON DELETE CASCADE,
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON voice.call_events (call_id, created_at DESC);

-- ─── voice.call_transcripts (append-only) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice.call_transcripts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  call_id           UUID NOT NULL REFERENCES voice.calls(id) ON DELETE CASCADE,
  speaker           VARCHAR(20) NOT NULL CHECK (speaker IN ('user','ai','system')),
  content           TEXT NOT NULL,
  timestamp_seconds NUMERIC(8,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id
  ON voice.call_transcripts (call_id, timestamp_seconds ASC);
