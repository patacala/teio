-- =============================================================================
-- 010_channels_ingestion.sql
-- Adds integrations.channels table, extends conversations.messages for
-- omnichannel routing, and adds supporting indexes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- integrations.channels
-- One row per channel endpoint (e.g. a WhatsApp number, email inbox, webchat)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations.channels (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  type                VARCHAR(50) NOT NULL
                        CHECK (type IN ('whatsapp','sms','email','instagram',
                                        'facebook','messenger','slack','webchat',
                                        'voice','custom')),
  provider            VARCHAR(100) NOT NULL,           -- 'meta', 'twilio', 'vonage', etc.
  external_identifier VARCHAR(500) NOT NULL,           -- phone number, page ID, widget ID
  config              JSONB NOT NULL DEFAULT '{}',     -- provider credentials (encrypt at app layer)
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One channel type+identifier per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_org_type_ext
  ON integrations.channels (organization_id, type, external_identifier);

CREATE INDEX IF NOT EXISTS idx_channels_external_identifier
  ON integrations.channels (external_identifier);

CREATE INDEX IF NOT EXISTS idx_channels_org_id
  ON integrations.channels (organization_id);

-- ---------------------------------------------------------------------------
-- conversations.messages — add omnichannel columns
-- ---------------------------------------------------------------------------
ALTER TABLE conversations.messages
  ADD COLUMN IF NOT EXISTS channel          VARCHAR(50)  NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS channel_message_id VARCHAR(500),
  ADD COLUMN IF NOT EXISTS sender_type      VARCHAR(20)  NOT NULL DEFAULT 'user'
    CHECK (sender_type IN ('user','agent','ai','system'));

-- Dedup: partial unique index — NULLs excluded (outbound may have no provider ID)
-- NOTE: after range-partitioning on created_at this index must become
--       application-enforced (PG does not support cross-partition unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_channel_message_id_dedup
  ON conversations.messages (conversation_id, channel_message_id)
  WHERE channel_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_channel
  ON conversations.messages (organization_id, channel, sent_at DESC);

-- ---------------------------------------------------------------------------
-- clients.contacts — add external_id for direct provider lookups
-- ---------------------------------------------------------------------------
ALTER TABLE clients.contacts
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_contacts_external_id
  ON clients.contacts (organization_id, external_id)
  WHERE external_id IS NOT NULL;

-- GIN index for JSONB channel_ids lookups used in findOrCreateByChannel
CREATE INDEX IF NOT EXISTS idx_contacts_channel_ids
  ON clients.contacts USING gin (channel_ids);

-- =============================================================================
-- FUTURE: Range-partition conversations.messages by created_at
-- Uncomment and adapt once message volume warrants it.
-- Pre-create monthly partitions via pg_cron or pg_partman.
-- =============================================================================
--
-- Step 1 — rename existing table and re-create as partitioned:
--
-- ALTER TABLE conversations.messages RENAME TO messages_legacy;
-- CREATE TABLE conversations.messages (LIKE conversations.messages_legacy INCLUDING ALL)
--   PARTITION BY RANGE (created_at);
--
-- Step 2 — create initial partitions (example: 2026 Q1–Q2):
--
-- CREATE TABLE conversations.messages_2026_01 PARTITION OF conversations.messages
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- CREATE TABLE conversations.messages_2026_02 PARTITION OF conversations.messages
--   FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- -- … continue monthly
--
-- Step 3 — migrate legacy data:
-- INSERT INTO conversations.messages SELECT * FROM conversations.messages_legacy;
-- DROP TABLE conversations.messages_legacy;
--
-- IMPORTANT: cross-partition unique indexes are NOT supported in PG.
-- The channel_message_id dedup index (idx_messages_channel_message_id_dedup)
-- must be dropped and dedup enforced at the application layer (step 2 of
-- ingestMessage pipeline) after partitioning is applied.
-- =============================================================================
