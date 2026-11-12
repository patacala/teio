import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/051_booking_lifecycle.sql (one-time backfills guarded by column checks). */
export class BookingLifecycle1793400000000 implements MigrationInterface {
  name = 'BookingLifecycle1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- appointments: statuses and audit columns
-- ---------------------------------------------------------------------------
ALTER TABLE scheduling.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'held', 'scheduled', 'confirmed', 'completed',
                    'cancelled', 'no_show', 'processing', 'failed'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'scheduling' AND table_name = 'appointments' AND column_name = 'confirmed_via'
  ) THEN
    ALTER TABLE scheduling.appointments
      ADD COLUMN confirmed_at TIMESTAMPTZ,
      ADD COLUMN confirmed_via VARCHAR(20),
      ADD COLUMN confirmed_by UUID REFERENCES core.users(id) ON DELETE SET NULL;

    UPDATE scheduling.appointments
       SET status = 'confirmed', confirmed_at = NOW(), confirmed_via = 'legacy'
     WHERE action IS NULL AND status IN ('pending', 'scheduled') AND ends_at > NOW();

    UPDATE scheduling.appointments
       SET confirmed_at = COALESCE(updated_at, NOW()), confirmed_via = 'legacy'
     WHERE action IS NULL AND status = 'confirmed' AND confirmed_via IS NULL;
  END IF;
END $$;

ALTER TABLE scheduling.appointments
  ADD COLUMN IF NOT EXISTS confirmation_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confirmation_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(30),
  ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_waived_by UUID REFERENCES core.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'scheduling' AND table_name = 'appointments' AND column_name = 'payment_id'
  ) THEN
    ALTER TABLE scheduling.appointments
      ADD COLUMN payment_id UUID REFERENCES payments.payments(id) ON DELETE SET NULL;

    -- payments.appointment_id is the link the webhook used; one appointment per payment.
    UPDATE scheduling.appointments a
       SET payment_id = p.id
      FROM (
        SELECT DISTINCT ON (appointment_id) id, appointment_id
          FROM payments.payments
         WHERE appointment_id IS NOT NULL AND status = 'paid'
         ORDER BY appointment_id, paid_at NULLS LAST, created_at
      ) p
     WHERE a.id = p.appointment_id
       AND NOT EXISTS (SELECT 1 FROM scheduling.appointments x WHERE x.payment_id = p.id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_payment_id
  ON scheduling.appointments (payment_id)
  WHERE payment_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_held_expiry_check') THEN
    ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_held_expiry_check
      CHECK (status <> 'held' OR hold_expires_at IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_confirmed_via_check') THEN
    ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_confirmed_via_check
      CHECK (confirmed_via IS NULL OR confirmed_via IN ('email_link', 'sms_link', 'payment', 'staff', 'legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_cancel_reason_check') THEN
    ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_cancel_reason_check
      CHECK (cancel_reason IS NULL OR cancel_reason IN ('contact', 'staff', 'ai', 'payment_not_received'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_held_expiry
  ON scheduling.appointments (hold_expires_at)
  WHERE status = 'held';

CREATE INDEX IF NOT EXISTS idx_appointments_unconfirmed
  ON scheduling.appointments (starts_at)
  WHERE status = 'scheduled' AND action IS NULL;

-- ---------------------------------------------------------------------------
-- Appointments without a calendar (the API used to reassign them on every
-- calendar list): follow-up steps go to the follow-up calendar, bookings to the
-- appointments calendar, else the oldest calendar of the organization.
-- ---------------------------------------------------------------------------
UPDATE scheduling.appointments a
   SET calendar_id = COALESCE(
     (SELECT ws.id FROM scheduling.work_schedules ws
       WHERE ws.organization_id = a.organization_id
         AND ws.type = CASE WHEN a.action IS NULL THEN 'appointments' ELSE 'follow_up' END
       ORDER BY ws.created_at, ws.id LIMIT 1),
     (SELECT ws.id FROM scheduling.work_schedules ws
       WHERE ws.organization_id = a.organization_id
       ORDER BY ws.created_at, ws.id LIMIT 1))
 WHERE a.calendar_id IS NULL;

-- ---------------------------------------------------------------------------
-- No overlapping bookings per calendar. Bookings that already overlap were
-- never validated: keep them, flag the later one of each pair as an override
-- (excluded from the constraint, still counted as busy by the API).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap') THEN
    UPDATE scheduling.appointments b
       SET override_at = NOW(),
           override_reason = 'Overlapped another booking before overlap protection existed'
     WHERE b.override_at IS NULL
       AND b.action IS NULL
       AND b.status IN ('held', 'scheduled', 'confirmed')
       AND EXISTS (
         SELECT 1 FROM scheduling.appointments a
          WHERE a.calendar_id = b.calendar_id
            AND a.action IS NULL
            AND a.status IN ('held', 'scheduled', 'confirmed')
            AND a.override_at IS NULL
            AND (a.created_at, a.id) < (b.created_at, b.id)
            AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
       );

    ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_no_overlap
      EXCLUDE USING gist (calendar_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
      WHERE (action IS NULL AND calendar_id IS NOT NULL AND override_at IS NULL
             AND status IN ('held', 'scheduled', 'confirmed'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- work_schedules: system calendars, hold length, basic sanity for new rows
-- ---------------------------------------------------------------------------
ALTER TABLE scheduling.work_schedules
  ADD COLUMN IF NOT EXISTS system_key VARCHAR(30),
  ADD COLUMN IF NOT EXISTS hold_minutes INTEGER NOT NULL DEFAULT 60;

UPDATE scheduling.work_schedules ws
   SET system_key = ws.type
 WHERE ws.type IN ('appointments', 'follow_up')
   AND ws.system_key IS NULL
   AND ws.id = (
     SELECT w2.id FROM scheduling.work_schedules w2
      WHERE w2.organization_id = ws.organization_id AND w2.type = ws.type
      ORDER BY w2.created_at, w2.id
      LIMIT 1
   )
   AND NOT EXISTS (
     SELECT 1 FROM scheduling.work_schedules w3
      WHERE w3.organization_id = ws.organization_id AND w3.system_key = ws.type
   );

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_schedules_system_key
  ON scheduling.work_schedules (organization_id, system_key)
  WHERE system_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_hold_minutes_check') THEN
    ALTER TABLE scheduling.work_schedules ADD CONSTRAINT work_schedules_hold_minutes_check
      CHECK (hold_minutes BETWEEN 30 AND 1440);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_hours_check') THEN
    ALTER TABLE scheduling.work_schedules ADD CONSTRAINT work_schedules_hours_check
      CHECK (start_time < end_time) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_work_days_check') THEN
    ALTER TABLE scheduling.work_schedules ADD CONSTRAINT work_schedules_work_days_check
      CHECK (work_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Same-organization references. Rows that already break the rule are left in
-- place (constraint stays NOT VALID and a warning is raised); new rows are
-- always checked.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_org_id ON clients.contacts (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_schedules_org_id ON scheduling.work_schedules (organization_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_contact_same_org_fkey') THEN
    ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_contact_same_org_fkey
      FOREIGN KEY (organization_id, contact_id)
      REFERENCES clients.contacts (organization_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_calendar_same_org_fkey') THEN
    ALTER TABLE scheduling.appointments ADD CONSTRAINT appointments_calendar_same_org_fkey
      FOREIGN KEY (organization_id, calendar_id)
      REFERENCES scheduling.work_schedules (organization_id, id) NOT VALID;
  END IF;

  BEGIN
    ALTER TABLE scheduling.appointments VALIDATE CONSTRAINT appointments_contact_same_org_fkey;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE WARNING 'appointments reference contacts of another organization; appointments_contact_same_org_fkey left NOT VALID';
  END;
  BEGIN
    ALTER TABLE scheduling.appointments VALIDATE CONSTRAINT appointments_calendar_same_org_fkey;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE WARNING 'appointments reference calendars of another organization; appointments_calendar_same_org_fkey left NOT VALID';
  END;
END $$;

-- ---------------------------------------------------------------------------
-- payments: keep records when a contact is deleted; manual follow-up state
-- ---------------------------------------------------------------------------
ALTER TABLE payments.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'paid', 'expired', 'canceled', 'failed', 'refunded'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'payments' AND table_name = 'payments' AND column_name = 'contact_name'
  ) THEN
    ALTER TABLE payments.payments
      ADD COLUMN contact_name VARCHAR(255),
      ADD COLUMN contact_email VARCHAR(255);

    UPDATE payments.payments p
       SET contact_name = NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
           contact_email = c.email
      FROM clients.contacts c
     WHERE c.id = p.contact_id;
  END IF;
END $$;

ALTER TABLE payments.payments ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE payments.payments DROP CONSTRAINT IF EXISTS payments_contact_id_fkey;
ALTER TABLE payments.payments ADD CONSTRAINT payments_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES clients.contacts(id) ON DELETE SET NULL;

ALTER TABLE payments.payments
  ADD COLUMN IF NOT EXISTS attention_reason VARCHAR(40),
  ADD COLUMN IF NOT EXISTS attention_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution VARCHAR(30),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES core.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_attention_reason_check') THEN
    ALTER TABLE payments.payments ADD CONSTRAINT payments_attention_reason_check
      CHECK (attention_reason IS NULL OR attention_reason IN ('slot_unavailable', 'appointment_cancelled', 'booking_failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_resolution_check') THEN
    ALTER TABLE payments.payments ADD CONSTRAINT payments_resolution_check
      CHECK (resolution IS NULL OR resolution IN ('rebooked', 'refunded_manually', 'dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_attention
  ON payments.payments (organization_id, attention_at)
  WHERE attention_reason IS NOT NULL AND resolved_at IS NULL;
    `);
  }

  public async down(): Promise<void> {
    // Forward-only: reverting would drop payment links and booking audit history.
  }
}
