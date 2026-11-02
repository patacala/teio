-- ============================================================
-- 023_demo_magic_links.sql
-- Magic links + demo request tables for the public demo flow
-- ============================================================

-- Token store (core schema)
CREATE TABLE IF NOT EXISTS core.magic_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_hash      VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hex del raw token
  type            VARCHAR(50) NOT NULL,           -- MagicLinkType enum
  organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL DEFAULT '{}',
  expires_at      TIMESTAMPTZ NOT NULL,
  max_uses        INTEGER,                        -- null = sin límite
  uses_count      INTEGER NOT NULL DEFAULT 0,
  revoked_at      TIMESTAMPTZ,
  ip_address      VARCHAR(45),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token_hash ON core.magic_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_links_type ON core.magic_links (type, created_at DESC);

-- Demo request (clients schema — references contacts and companies)
CREATE TABLE IF NOT EXISTS clients.demo_requests (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id            UUID REFERENCES clients.contacts(id) ON DELETE SET NULL,
  company_id            UUID REFERENCES clients.companies(id) ON DELETE SET NULL,
  organization_id       UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  demo_type             VARCHAR(50) NOT NULL,    -- DemoType enum
  status                VARCHAR(50) NOT NULL DEFAULT 'processing',
  init_token_id         UUID REFERENCES core.magic_links(id) ON DELETE SET NULL,
  experience_token_id   UUID REFERENCES core.magic_links(id) ON DELETE SET NULL,
  demo_url              TEXT,                    -- Link 2 URL completa (se guarda al generar)
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_demo_requests_updated_at
  BEFORE UPDATE ON clients.demo_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_demo_requests_organization_id ON clients.demo_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_requests_contact_id ON clients.demo_requests (contact_id);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON clients.demo_requests (status);
