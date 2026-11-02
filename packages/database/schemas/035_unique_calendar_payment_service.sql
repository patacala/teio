-- =============================================================================
-- 035_unique_calendar_payment_service.sql  –  One appointments calendar per service
--
-- Enforces a 1:1 link between a payment service and the appointments calendar
-- that charges it. Without this, several calendars could point at the same
-- service and the payment→booking resolution became ambiguous.
--
-- The link itself lives on scheduling.work_schedules.payment_service_id
-- (added in 034). This migration only guarantees it is unique per service.
-- Idempotent.
-- =============================================================================

-- De-dup defensively: if a service is already linked from >1 appointments
-- calendar, keep the oldest and clear the rest so the unique index can build.
UPDATE scheduling.work_schedules ws
  SET payment_service_id = NULL
  WHERE ws.type = 'appointments'
    AND ws.payment_service_id IS NOT NULL
    AND ws.id <> (
      SELECT w2.id
      FROM scheduling.work_schedules w2
      WHERE w2.payment_service_id = ws.payment_service_id
        AND w2.type = 'appointments'
      ORDER BY w2.created_at ASC
      LIMIT 1
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_schedules_payment_service
  ON scheduling.work_schedules (payment_service_id)
  WHERE payment_service_id IS NOT NULL AND type = 'appointments';
