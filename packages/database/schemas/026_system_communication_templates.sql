-- System communication templates (org_id IS NULL, is_system = true)
-- These serve as default templates for all organizations

INSERT INTO communications.communication_templates
  (id, organization_id, event_type, channel_type, provider, provider_template_id, name, description, is_system, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), NULL, 'appointment_created', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_CREATED', 'Appointment Created', 'Sent when a new appointment is booked', true, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'appointment_reminder', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_REMINDER', 'Appointment Reminder', 'Sent before an upcoming appointment', true, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'appointment_cancelled', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_CANCELLED', 'Appointment Cancelled', 'Sent when an appointment is cancelled', true, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'appointment_rescheduled', 'email', 'resend', 'PLACEHOLDER_TPL_APPT_RESCHEDULED', 'Appointment Rescheduled', 'Sent when an appointment is rescheduled', true, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'welcome', 'email', 'resend', 'PLACEHOLDER_TPL_WELCOME', 'Welcome', 'Sent to new contacts', true, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'team_member_invited', 'email', 'resend', 'PLACEHOLDER_TPL_TEAM_INVITE', 'Team Member Invited', 'Sent when a team member is invited', true, true, NOW(), NOW())
ON CONFLICT DO NOTHING;
