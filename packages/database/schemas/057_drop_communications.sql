-- =============================================================================
-- 057_drop_communications.sql  –  Remove the communications module
--
-- The event → template system (system/org communication templates, dispatch
-- and delivery log) was removed from the product. Transactional messages are
-- now sent with built-in content straight from the code that triggers them
-- (password reset, appointment email/SMS, payment failed, follow-up email).
--
--   * Drops the delivery log and the templates (child table first: FK).
--   * Removes the org settings that only fed the dispatcher: branding and
--     notification_preferences.
-- Idempotent: a no-op on databases created after 024/026 were deleted.
-- =============================================================================

DROP TABLE IF EXISTS integrations.communication_deliveries;
DROP TABLE IF EXISTS integrations.communication_templates;

UPDATE core.organizations
SET settings = settings - 'branding' - 'notification_preferences'
WHERE settings ?| ARRAY['branding', 'notification_preferences'];
