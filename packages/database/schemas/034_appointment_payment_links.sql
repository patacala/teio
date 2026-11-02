-- =============================================================================
-- 034_appointment_payment_links.sql  –  Charge for appointments
--
-- Links the payments module to scheduling so the agent can charge for a booked
-- appointment. The signal is the calendar itself: only calendars the agent
-- books real appointments into (type = 'appointments') carry a payment service.
-- Follow-up calendars stay free so ordinary follow-ups never ask for money.
--
-- `payments.payments.appointment_id` is what lets the Stripe webhook confirm
-- the right appointment once the contact pays.
-- Idempotent.
-- =============================================================================

ALTER TABLE scheduling.work_schedules
  ADD COLUMN IF NOT EXISTS payment_service_id UUID
    REFERENCES payments.services(id) ON DELETE SET NULL;

ALTER TABLE payments.payments
  ADD COLUMN IF NOT EXISTS appointment_id UUID
    REFERENCES scheduling.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_appointment
  ON payments.payments (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- Only appointment calendars may charge. Guards against a follow_up calendar
-- being pointed at a service by a direct SQL update.
UPDATE scheduling.work_schedules
  SET payment_service_id = NULL
  WHERE type <> 'appointments' AND payment_service_id IS NOT NULL;
