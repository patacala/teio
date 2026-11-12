import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/055_same_org_cleanup.sql. */
export class SameOrgCleanup1793800000000 implements MigrationInterface {
  name = 'SameOrgCleanup1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`

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
    `);
  }

  public async down(): Promise<void> {
    // Forward-only: quarantined rows stay in scheduling.quarantined_appointments for review.
  }
}
