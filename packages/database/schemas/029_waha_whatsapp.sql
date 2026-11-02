-- =============================================================================
-- 029_waha_whatsapp.sql
-- Retires the Meta Cloud API WhatsApp integration in favour of WAHA
-- (self-hosted, QR-linked). Idempotent.
--
-- Nothing is deleted: conversations, messages and contact history stay intact
-- and remain visible in the inbox. Only the channel rows are deactivated so
-- they stop being resolved for inbound routing and outbound dispatch.
--
-- WAHA channels use the same type ('whatsapp') with provider = 'waha', and
-- store the SESSION NAME in external_identifier (the phone number is unknown
-- until the QR is scanned; it lives in config.phone_number instead).
-- =============================================================================

UPDATE integrations.channels
   SET is_active = false
 WHERE type = 'whatsapp'
   AND provider = 'meta'
   AND is_active = true;

-- Speeds up the session lookup done on every inbound WAHA webhook
-- (findByExternalIdentifier: external_identifier + type + provider + is_active)
CREATE INDEX IF NOT EXISTS idx_channels_provider_ext
  ON integrations.channels (provider, type, external_identifier)
  WHERE is_active = true;
