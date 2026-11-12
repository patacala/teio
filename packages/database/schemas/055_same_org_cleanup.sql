-- =============================================================================
-- 050_same_org_cleanup.sql  –  Finish the same-organization constraints
--
-- 051 added appointments_contact_same_org_fkey and
-- appointments_calendar_same_org_fkey as NOT VALID and only validated them
-- when no old row broke the rule. This repairs those rows and validates both,
-- so the rule holds for every row, old and new:
--
--   * calendar of another organization: the booking itself is fine, so it
--     moves to its own organization's appointments calendar (else its oldest
--     calendar), flagged as an override because it was never checked there.
--   * contact of another organization: the row cannot be repaired (it is not
--     known which side is wrong). It is copied to
--     scheduling.quarantined_appointments with the reason, then removed.
--
-- Also adds work_schedules.contact_reschedule_days: how many days of free
-- times a contact sees when changing a booking from their link.
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduling.quarantined_appointments (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL,
  reason           TEXT NOT NULL,
  row_data         JSONB NOT NULL,
  quarantined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE scheduling.appointments a
   SET calendar_id = COALESCE(
         (SELECT ws.id FROM scheduling.work_schedules ws
           WHERE ws.organization_id = a.organization_id AND ws.system_key = 'appointments'),
         (SELECT ws.id FROM scheduling.work_schedules ws
           WHERE ws.organization_id = a.organization_id
           ORDER BY ws.created_at, ws.id LIMIT 1)),
       override_at = COALESCE(a.override_at, NOW()),
       override_reason = COALESCE(a.override_reason, 'Was on a calendar of another organization; moved to this organization')
 WHERE a.calendar_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM scheduling.work_schedules ws
      WHERE ws.id = a.calendar_id AND ws.organization_id = a.organization_id);

INSERT INTO scheduling.quarantined_appointments (id, organization_id, reason, row_data)
SELECT a.id, a.organization_id, 'Contact belongs to another organization', to_jsonb(a)
  FROM scheduling.appointments a
 WHERE NOT EXISTS (
   SELECT 1 FROM clients.contacts c WHERE c.id = a.contact_id AND c.organization_id = a.organization_id)
ON CONFLICT (id) DO NOTHING;

DELETE FROM scheduling.appointments a
 WHERE NOT EXISTS (
   SELECT 1 FROM clients.contacts c WHERE c.id = a.contact_id AND c.organization_id = a.organization_id);

ALTER TABLE scheduling.appointments VALIDATE CONSTRAINT appointments_contact_same_org_fkey;
ALTER TABLE scheduling.appointments VALIDATE CONSTRAINT appointments_calendar_same_org_fkey;

ALTER TABLE scheduling.work_schedules
  ADD COLUMN IF NOT EXISTS contact_reschedule_days INTEGER NOT NULL DEFAULT 14;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_contact_reschedule_days_check') THEN
    ALTER TABLE scheduling.work_schedules ADD CONSTRAINT work_schedules_contact_reschedule_days_check
      CHECK (contact_reschedule_days BETWEEN 1 AND 60);
  END IF;
END $$;
