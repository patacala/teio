import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/059_drop_legacy_sequences.sql. */
export class DropLegacySequences1794200000000 implements MigrationInterface {
  name = 'DropLegacySequences1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
-- =============================================================================
-- 059_drop_legacy_sequences.sql  –  Remove the legacy follow-up sequences
--
-- Automations (058) replaced sequences. The installer converted each
-- organization's sequence templates and "sequences on/off" setting into
-- automations, so the legacy data can go:
--
--   * Refuses to run while an organization with its own sequence templates
--     (or follow-ups turned off) has no automations installed, since that
--     would be lost: call POST /api/v1/automations/install-all on the
--     previous release first.
--   * Drops the sequence tables and scheduled_actions.sequence_id.
--   * Drops the follow-up columns left on appointments since 052 (steps moved
--     to scheduled_actions) and the unused reminder flags (reminders live in
--     appointment_reminders since 053). The overlap constraint and the
--     unconfirmed index are rebuilt without "action IS NULL" (always true).
--   * Appointment status/origin checks no longer accept the follow-up step
--     values (processing, failed, automation). NOT VALID: old rows are kept
--     as they are, new writes are checked.
--   * Removes settings.sequences_enabled.
-- Idempotent.
-- =============================================================================

DO $$
DECLARE
  pending INTEGER;
BEGIN
  IF to_regclass('scheduling.sequence_templates') IS NULL THEN
    RETURN;
  END IF;
  -- Only organizations with something to convert block: their own templates,
  -- or follow-ups turned off. The others get the same automations either way.
  SELECT COUNT(*) INTO pending
    FROM core.organizations o
   WHERE COALESCE((o.settings->>'automations_installed')::int, 0) < 1
     AND (o.settings->>'sequences_enabled' = 'false'
          OR EXISTS (SELECT 1 FROM scheduling.sequence_templates t WHERE t.organization_id = o.id));
  IF pending > 0 THEN
    RAISE EXCEPTION '% organization(s) have no automations installed. Call POST /api/v1/automations/install-all on the previous release, then run this again.', pending;
  END IF;
END $$;

ALTER TABLE scheduling.scheduled_actions DROP COLUMN IF EXISTS sequence_id;

ALTER TABLE scheduling.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
DROP INDEX IF EXISTS scheduling.idx_appointments_unconfirmed;

ALTER TABLE scheduling.appointments
  DROP COLUMN IF EXISTS sequence_id,
  DROP COLUMN IF EXISTS action,
  DROP COLUMN IF EXISTS executor,
  DROP COLUMN IF EXISTS channel_strategy,
  DROP COLUMN IF EXISTS message_content,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS max_attempts,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS resolved_channel,
  DROP COLUMN IF EXISTS reminder_sent,
  DROP COLUMN IF EXISTS confirmation_reminder_sent_at;

ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (calendar_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (calendar_id IS NOT NULL AND override_at IS NULL AND status IN ('held', 'scheduled', 'confirmed'));

CREATE INDEX IF NOT EXISTS idx_appointments_unconfirmed
  ON scheduling.appointments (starts_at)
  WHERE status = 'scheduled';

ALTER TABLE scheduling.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'held', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')) NOT VALID;

ALTER TABLE scheduling.appointments DROP CONSTRAINT IF EXISTS appointments_origin_check;
ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_origin_check
  CHECK (origin IN ('ai', 'human', 'webhook')) NOT VALID;

DROP TABLE IF EXISTS scheduling.sequence_steps;
DROP TABLE IF EXISTS scheduling.automation_sequences;
DROP TABLE IF EXISTS scheduling.sequence_template_steps;
DROP TABLE IF EXISTS scheduling.sequence_templates;

UPDATE core.organizations
   SET settings = settings - 'sequences_enabled'
 WHERE settings ? 'sequences_enabled';
`);
  }

  public async down(): Promise<void> {
    // Forward-only: the legacy sequences were replaced by automations.
  }
}
