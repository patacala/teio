-- System communication templates (org_id IS NULL, is_system = true)
-- These serve as default templates for all organizations

-- Idempotent: organization_id is NULL, so a unique constraint cannot dedupe;
-- insert only the (event, channel) pairs that have no system template yet.

INSERT INTO integrations.communication_templates
  (id, organization_id, event_type, channel_type, provider, provider_template_id, name, description, is_system, is_active, created_at, updated_at)
SELECT gen_random_uuid(), NULL, v.event_type, v.channel_type, v.provider, v.provider_template_id, v.name, v.description, true, true, NOW(), NOW()
FROM (VALUES
  ('appointment_created', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_CREATED', 'Appointment Created', 'Sent when a new appointment is booked'),
  ('appointment_reminder', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_REMINDER', 'Appointment Reminder', 'Sent before an upcoming appointment'),
  ('appointment_cancelled', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_CANCELLED', 'Appointment Cancelled', 'Sent when an appointment is cancelled'),
  ('appointment_rescheduled', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_RESCHEDULED', 'Appointment Rescheduled', 'Sent when an appointment is rescheduled'),
  ('welcome', 'email', 'resend', 'PLACEHOLDER_TPL_WELCOME', 'Welcome', 'Sent to new contacts'),
  ('team_member_invited', 'email', 'resend', 'PLACEHOLDER_TPL_TEAM_INVITE', 'Team Member Invited', 'Sent when a team member is invited')
) AS v(event_type, channel_type, provider, provider_template_id, name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM integrations.communication_templates t
  WHERE t.is_system = true AND t.organization_id IS NULL
    AND t.event_type = v.event_type AND t.channel_type = v.channel_type
);
