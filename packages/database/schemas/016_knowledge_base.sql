-- =============================================================================
-- 016: Knowledge Base
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE knowledge.knowledge_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  category        VARCHAR(100) NOT NULL DEFAULT 'general',
  status          VARCHAR(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_entries_org      ON knowledge.knowledge_entries(organization_id);
CREATE INDEX idx_knowledge_entries_status   ON knowledge.knowledge_entries(organization_id, status);
CREATE INDEX idx_knowledge_entries_category ON knowledge.knowledge_entries(organization_id, category);
CREATE INDEX idx_knowledge_entries_title_trgm
  ON knowledge.knowledge_entries USING GIN (title gin_trgm_ops);
CREATE INDEX idx_knowledge_entries_content_trgm
  ON knowledge.knowledge_entries USING GIN (content gin_trgm_ops);

CREATE TRIGGER knowledge_entries_updated_at
  BEFORE UPDATE ON knowledge.knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
