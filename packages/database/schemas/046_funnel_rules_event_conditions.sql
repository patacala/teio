-- =============================================================================
-- 046_funnel_rules_event_conditions.sql  –  Scope "Lead lost", retire "Deal won"
--
-- Rule `conditions` can now match the triggering event's payload under an
-- `event` key (FunnelRulesService.matchesConditions).
--
-- 1. "Lead lost" fired on ANY exhausted sequence, so a finished
--    appointment_reminder / post_service / reactivation cadence marked the
--    contact Lost. Only an unanswered no_response cadence means the lead is lost.
-- 2. The funnel's goal ends at a booked (confirmed / paid) appointment; the
--    final sale is outside the CRM, so the "Deal won" default is retired.
--
-- Idempotent.
-- =============================================================================

UPDATE clients.funnel_rules
   SET conditions = '{"event": {"sequence_type": "no_response"}}'::jsonb
 WHERE organization_id IS NULL AND funnel_id IS NULL
   AND name = 'Lead lost'
   AND trigger_event = 'sequence.exhausted'
   AND conditions = '{}'::jsonb;

DELETE FROM clients.funnel_rules
 WHERE organization_id IS NULL AND funnel_id IS NULL
   AND name = 'Deal won';
