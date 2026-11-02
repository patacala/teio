-- 032_sequence_unique_per_type.sql
-- A contact can run several sequences at once (e.g. reactivation alongside
-- no_response) as long as their types differ. Replaces the 028 index that
-- allowed only one active sequence per contact.

DROP INDEX IF EXISTS scheduling.idx_sequence_active_contact;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_active_contact_type
  ON scheduling.automation_sequences (organization_id, contact_id, sequence_type)
  WHERE status = 'active';
