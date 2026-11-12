import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/053_reminders_and_outbox.sql. */
export class RemindersAndOutbox1793600000000 implements MigrationInterface {
  name = 'RemindersAndOutbox1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`

ALTER TABLE scheduling.work_schedules
  ADD COLUMN IF NOT EXISTS reminder_offsets_minutes INTEGER[] NOT NULL DEFAULT '{1440,120}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_reminder_offsets_check') THEN
    ALTER TABLE scheduling.work_schedules ADD CONSTRAINT work_schedules_reminder_offsets_check
      CHECK (cardinality(reminder_offsets_minutes) <= 5
             AND 5 <= ALL (reminder_offsets_minutes)
             AND 20160 >= ALL (reminder_offsets_minutes));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS scheduling.appointment_reminders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  appointment_id   UUID NOT NULL REFERENCES scheduling.appointments(id) ON DELETE CASCADE,
  offset_minutes   INTEGER NOT NULL,
  due_at           TIMESTAMPTZ NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'cancelled')),
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_appointment_reminders_offset UNIQUE (appointment_id, offset_minutes)
);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_due
  ON scheduling.appointment_reminders (due_at)
  WHERE status = 'pending';

-- Upcoming active bookings get their reminders once (only when the table is new).
INSERT INTO scheduling.appointment_reminders (organization_id, appointment_id, offset_minutes, due_at)
SELECT a.organization_id, a.id, o.offset_minutes, a.starts_at - make_interval(mins => o.offset_minutes)
  FROM scheduling.appointments a
  JOIN scheduling.work_schedules ws ON ws.id = a.calendar_id
  CROSS JOIN LATERAL unnest(ws.reminder_offsets_minutes) AS o(offset_minutes)
 WHERE a.status IN ('scheduled', 'confirmed')
   AND a.starts_at - make_interval(mins => o.offset_minutes) > NOW()
   AND NOT EXISTS (SELECT 1 FROM scheduling.appointment_reminders r WHERE r.appointment_id = a.id)
ON CONFLICT (appointment_id, offset_minutes) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.outbox_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Publication order: events of one transaction share created_at.
  seq              BIGSERIAL NOT NULL,
  organization_id  UUID,
  topic            VARCHAR(100) NOT NULL,
  payload          JSONB NOT NULL,
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  available_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE core.outbox_events ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending
  ON core.outbox_events (seq)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_events_published
  ON core.outbox_events (published_at)
  WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS core.processed_events (
  consumer      VARCHAR(100) NOT NULL,
  event_id      UUID NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (consumer, event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_events_at ON core.processed_events (processed_at);
    `);
  }

  public async down(): Promise<void> {
    // Forward-only: reverting would lose follow-up steps, reminders or pending events.
  }
}
