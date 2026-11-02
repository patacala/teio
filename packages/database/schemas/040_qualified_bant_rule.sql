-- =============================================================================
-- 040_qualified_bant_rule.sql  –  Qualification is BANT, not data completeness
--
-- The 038 seed wrongly moved a contact to Qualified just for having full contact
-- details. Real qualification requires signals captured during the conversation:
-- decision maker, budget, timeline, and the concrete service they need. This
-- retires that rule and adds a conditions-based one driven by `contact.data.captured`.
--
-- The agent (n8n) stores these in contacts.custom_fields:
--   is_decision_maker (true), has_budget (true), timeline (any value),
--   service_needed (e.g. "car", "dental cleaning", "lawyer appointment").
-- Idempotent.
-- =============================================================================

-- Drop the wrong system default.
DELETE FROM clients.funnel_rules
  WHERE organization_id IS NULL AND funnel_id IS NULL
    AND name = 'Data completed';

-- Add the BANT-based qualification rule (system default).
INSERT INTO clients.funnel_rules
  (name, trigger_event, from_stage_types, to_stage_type, conditions, priority)
SELECT
  'Qualified (BANT)',
  'contact.data.captured',
  ARRAY['new','contacted']::TEXT[],
  'qualified',
  '{"custom_fields": {"is_decision_maker": true, "has_budget": true, "timeline": "*", "service_needed": "*"}}'::jsonb,
  10
WHERE NOT EXISTS (
  SELECT 1 FROM clients.funnel_rules r
  WHERE r.organization_id IS NULL AND r.funnel_id IS NULL AND r.name = 'Qualified (BANT)'
);
