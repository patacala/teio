-- Migration 018: Named funnels, templates, and contact funnel history

-- 1. Rename order → position in funnel_stages
ALTER TABLE clients.funnel_stages RENAME COLUMN "order" TO position;

-- 2. Named funnel containers
CREATE TABLE IF NOT EXISTS clients.funnels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_funnels_org ON clients.funnels(organization_id);

-- 3. Link existing funnel_stages to funnels (nullable to preserve existing flat data)
ALTER TABLE clients.funnel_stages
  ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES clients.funnels(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_funnel_stages_funnel ON clients.funnel_stages(funnel_id);

-- 4. Global funnel templates (shared across all orgs)
CREATE TABLE IF NOT EXISTS clients.funnel_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100) NOT NULL DEFAULT 'generic'
);

CREATE TABLE IF NOT EXISTS clients.funnel_template_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES clients.funnel_templates(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  color       VARCHAR(20)
);
CREATE INDEX IF NOT EXISTS idx_fts_template ON clients.funnel_template_stages(template_id);

-- 5. Contact stage-change history (for activity timeline)
CREATE TABLE IF NOT EXISTS clients.contact_funnel_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES clients.contacts(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES clients.funnel_stages(id) ON DELETE SET NULL,
  to_stage_id   UUID REFERENCES clients.funnel_stages(id) ON DELETE SET NULL,
  changed_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cfh_contact ON clients.contact_funnel_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_cfh_created ON clients.contact_funnel_history(created_at);

-- 6. Seed 5 default templates (idempotent)
DO $$
DECLARE
  t_generic    UUID;
  t_agency     UUID;
  t_realestate UUID;
  t_local      UUID;
  t_ecomm      UUID;
BEGIN
  IF (SELECT COUNT(*) FROM clients.funnel_templates) > 0 THEN
    RETURN;
  END IF;

  INSERT INTO clients.funnel_templates(name, description, category)
    VALUES ('Generic Funnel', 'Standard sales pipeline for any industry', 'generic')
    RETURNING id INTO t_generic;
  INSERT INTO clients.funnel_template_stages(template_id, name, position, color) VALUES
    (t_generic, 'New',           0, '#3B82F6'),
    (t_generic, 'Contacted',     1, '#8B5CF6'),
    (t_generic, 'Qualified',     2, '#6366F1'),
    (t_generic, 'Interested',    3, '#F59E0B'),
    (t_generic, 'Proposal Sent', 4, '#EC4899'),
    (t_generic, 'Negotiation',   5, '#14B8A6'),
    (t_generic, 'Won',           6, '#10B981'),
    (t_generic, 'Lost',          7, '#EF4444');

  INSERT INTO clients.funnel_templates(name, description, category)
    VALUES ('Agency Funnel', 'Optimized for marketing and creative agencies', 'agency')
    RETURNING id INTO t_agency;
  INSERT INTO clients.funnel_template_stages(template_id, name, position, color) VALUES
    (t_agency, 'New Lead',        0, '#3B82F6'),
    (t_agency, 'Initial Contact', 1, '#8B5CF6'),
    (t_agency, 'Diagnosis',       2, '#6366F1'),
    (t_agency, 'Proposal Sent',   3, '#F59E0B'),
    (t_agency, 'Follow Up',       4, '#EC4899'),
    (t_agency, 'Negotiation',     5, '#14B8A6'),
    (t_agency, 'Client Won',      6, '#10B981'),
    (t_agency, 'Client Lost',     7, '#EF4444');

  INSERT INTO clients.funnel_templates(name, description, category)
    VALUES ('Real Estate Funnel', 'Pipeline for property sales and leasing', 'real_estate')
    RETURNING id INTO t_realestate;
  INSERT INTO clients.funnel_template_stages(template_id, name, position, color) VALUES
    (t_realestate, 'New Lead',               0, '#3B82F6'),
    (t_realestate, 'Initial Contact',        1, '#8B5CF6'),
    (t_realestate, 'Property Recommended',   2, '#6366F1'),
    (t_realestate, 'Visit Scheduled',        3, '#F59E0B'),
    (t_realestate, 'Offer Sent',             4, '#EC4899'),
    (t_realestate, 'Negotiation',            5, '#14B8A6'),
    (t_realestate, 'Property Sold',          6, '#10B981'),
    (t_realestate, 'Lead Lost',              7, '#EF4444');

  INSERT INTO clients.funnel_templates(name, description, category)
    VALUES ('Local Services Funnel', 'For local service businesses', 'local_services')
    RETURNING id INTO t_local;
  INSERT INTO clients.funnel_template_stages(template_id, name, position, color) VALUES
    (t_local, 'New Lead',              0, '#3B82F6'),
    (t_local, 'Initial Consultation',  1, '#8B5CF6'),
    (t_local, 'Quote Sent',            2, '#6366F1'),
    (t_local, 'Appointment Scheduled', 3, '#F59E0B'),
    (t_local, 'Service Completed',     4, '#14B8A6'),
    (t_local, 'Returning Customer',    5, '#10B981'),
    (t_local, 'Lead Lost',             6, '#EF4444');

  INSERT INTO clients.funnel_templates(name, description, category)
    VALUES ('Ecommerce Funnel', 'For online stores and product-based businesses', 'ecommerce')
    RETURNING id INTO t_ecomm;
  INSERT INTO clients.funnel_template_stages(template_id, name, position, color) VALUES
    (t_ecomm, 'New Lead',           0, '#3B82F6'),
    (t_ecomm, 'Product Interest',   1, '#8B5CF6'),
    (t_ecomm, 'Cart Started',       2, '#6366F1'),
    (t_ecomm, 'Purchase Completed', 3, '#10B981'),
    (t_ecomm, 'Potential Rebuy',    4, '#F59E0B'),
    (t_ecomm, 'Customer Lost',      5, '#EF4444');

END $$;
