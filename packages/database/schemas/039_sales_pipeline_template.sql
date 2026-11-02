-- =============================================================================
-- 039_sales_pipeline_template.sql  –  Automation-aligned sales pipeline template
--
-- Seeds a "Sales Pipeline" funnel template whose stages map 1:1 to the stage_types
-- the funnel automation engine moves through (037/038), so a contact flows all the
-- way from New Lead to Won automatically:
--   message.received        -> Contacted
--   contact.data.completed  -> Qualified
--   appointment.created     -> Appointment Scheduled
--   appointment.confirmed   -> Appointment Confirmed
--   appointment.completed   -> Won
--   sequence.exhausted      -> Lost
--
-- stage_type / is_terminal are set explicitly (037's name-backfill only ran once).
-- Idempotent: keyed on the template name.
-- =============================================================================

DO $$
DECLARE
  t_sales UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM clients.funnel_templates WHERE name = 'Sales Pipeline') THEN
    RETURN;
  END IF;

  INSERT INTO clients.funnel_templates(name, description, category)
    VALUES ('Sales Pipeline', 'Appointment-driven sales pipeline with automatic stage movement', 'sales')
    RETURNING id INTO t_sales;

  INSERT INTO clients.funnel_template_stages
    (template_id, name, position, color, stage_type, is_terminal) VALUES
    (t_sales, 'New Lead',              0, '#3B82F6', 'new',                   FALSE),
    (t_sales, 'Contacted',             1, '#8B5CF6', 'contacted',             FALSE),
    (t_sales, 'Qualified',             2, '#6366F1', 'qualified',             FALSE),
    (t_sales, 'Appointment Scheduled', 3, '#F59E0B', 'appointment_scheduled', FALSE),
    (t_sales, 'Appointment Confirmed', 4, '#14B8A6', 'appointment_confirmed', FALSE),
    (t_sales, 'Won',                   5, '#10B981', 'won',                   TRUE),
    (t_sales, 'Lost',                  6, '#EF4444', 'lost',                  TRUE);
END $$;
