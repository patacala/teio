-- =============================================================================
-- 003: Client Management (Contacts & Companies)
-- =============================================================================

-- Companies
CREATE TABLE IF NOT EXISTS clients.companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  domain          VARCHAR(255),
  industry        VARCHAR(100),
  size            VARCHAR(50),
  website         TEXT,
  phone           VARCHAR(50),
  address         JSONB DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON clients.companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_companies_organization_id ON clients.companies (organization_id);
CREATE INDEX idx_companies_name ON clients.companies USING gin (name gin_trgm_ops);

-- Contacts
CREATE TABLE IF NOT EXISTS clients.contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  company_id      UUID REFERENCES clients.companies (id) ON DELETE SET NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100),
  email           VARCHAR(320),
  phone           VARCHAR(50),
  avatar_url      TEXT,
  status          VARCHAR(50) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'blocked')),
  channel_ids     JSONB NOT NULL DEFAULT '{}',  -- {whatsapp: "+1234", email: "x@y.com"}
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  tags            TEXT[] DEFAULT '{}',
  assigned_to     UUID REFERENCES core.users (id) ON DELETE SET NULL,
  last_contacted_at TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON clients.contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_contacts_organization_id ON clients.contacts (organization_id);
CREATE INDEX idx_contacts_email ON clients.contacts (organization_id, email);
CREATE INDEX idx_contacts_phone ON clients.contacts (organization_id, phone);
CREATE INDEX idx_contacts_company_id ON clients.contacts (company_id);
CREATE INDEX idx_contacts_assigned_to ON clients.contacts (assigned_to);
CREATE INDEX idx_contacts_name ON clients.contacts USING gin (
  (first_name || ' ' || COALESCE(last_name, '')) gin_trgm_ops
);
CREATE INDEX idx_contacts_tags ON clients.contacts USING gin (tags);
