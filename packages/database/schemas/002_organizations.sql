-- =============================================================================
-- 002: Organizations & Users
-- =============================================================================

-- Organizations (tenants)
CREATE TABLE IF NOT EXISTS core.organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) NOT NULL UNIQUE,
  plan            VARCHAR(50) NOT NULL DEFAULT 'free'
                    CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  settings        JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON core.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_organizations_slug ON core.organizations (slug);
CREATE INDEX idx_organizations_plan ON core.organizations (plan);

-- Users (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS core.users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations (id) ON DELETE CASCADE,
  email           VARCHAR(320) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  avatar_url      TEXT,
  role            VARCHAR(50) NOT NULL DEFAULT 'agent'
                    CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_seen_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON core.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_users_organization_id ON core.users (organization_id);
CREATE INDEX idx_users_email ON core.users (email);
CREATE INDEX idx_users_role ON core.users (organization_id, role);
