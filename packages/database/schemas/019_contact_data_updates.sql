-- Migration 019: Contact data updates tracking
CREATE TABLE IF NOT EXISTS clients.contact_data_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES clients.contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '{}',
  changed_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_data_updates_contact
  ON clients.contact_data_updates(contact_id, created_at DESC);
