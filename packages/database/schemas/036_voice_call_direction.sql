-- =============================================================================
-- 036_voice_call_direction.sql  –  Persist inbound/outbound on voice calls
--
-- The Retell webhook already carries `direction` (used for notifications) but it
-- was never stored on voice.calls, so the UI could not tell an incoming call
-- from an outgoing one. Add the column so the calls list can label each call.
--
-- Existing rows default to 'inbound' — matching the webhook convention where an
-- absent direction is treated as inbound. Idempotent.
-- =============================================================================

ALTER TABLE voice.calls
  ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'inbound';
