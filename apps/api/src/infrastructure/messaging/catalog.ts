import type { EmailTemplate } from './email-layout';

/**
 * Every built-in message the product sends, in one place, in English.
 * Copy uses {{placeholders}} (documented in TEMPLATE_VARIABLES); there is no
 * template editor, change the copy here.
 *
 * Every message addressed to a person greets them with {{user_name}}.
 * Appointment messages also carry the appointment details and the
 * organization (the business the contact booked with).
 */

export const TEMPLATE_VARIABLES = {
  user_name: 'Recipient name: the user (platform emails) or the contact (appointments, follow-ups). "there" when unknown.',
  organization_name: 'The organization (business) sending the message.',
  app_url: 'Web app URL.',
  reset_url: 'Password reset link.',
  billing_url: 'Billing page in the web app.',
  review_url: 'Page where admins review a payment.',
  amount: 'Formatted amount with currency, e.g. "149.00 USD".',
  payer_name: 'Who paid.',
  reason: 'Why a payment needs review.',
  demo_type: 'Type of demo (live chat, AI voice, CRM).',
  demo_url: 'Link to the demo.',
  subject: 'Subject written by a person or the AI agent.',
  message: 'Body text written by a person, a follow-up step or the AI agent.',
  appointment_title: 'Appointment title.',
  appointment_date: 'Appointment date, e.g. "Monday, March 23, 2026".',
  appointment_time: 'Start time, e.g. "09:00 AM".',
  appointment_end_time: 'End time.',
  timezone: 'Time zone of the appointment.',
  location: 'Where the appointment takes place (empty: row hidden).',
  meeting_url: 'Video call link (empty: button hidden).',
  manage_url: 'Link to reschedule or cancel (empty: link hidden).',
  confirm_url: 'Link to confirm the appointment.',
  contact_name: 'A contact, in notifications shown to the organization\'s users.',
  phone: 'A phone number.',
  step_title: 'Title of a follow-up step.',
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;

const APPOINTMENT_DETAILS: EmailTemplate['details'] = [
  { label: 'Appointment', value: '{{appointment_title}}' },
  { label: 'Date', value: '{{appointment_date}}' },
  { label: 'Time', value: '{{appointment_time}} – {{appointment_end_time}} ({{timezone}})' },
  { label: 'Location', value: '{{location}}' },
];

const appointmentEmail = (t: Omit<EmailTemplate, 'heading' | 'details' | 'footer'>): EmailTemplate => ({
  heading: '{{organization_name}}',
  details: APPOINTMENT_DETAILS,
  footer: '{{organization_name}}',
  ...t,
});

const MANAGE_LINK = { label: 'Reschedule or cancel', url: '{{manage_url}}' };
const JOIN_BUTTON = { label: 'Join meeting', url: '{{meeting_url}}' };

export const EMAIL_TEMPLATES = {
  // ── Platform → users of the product ──────────────────────────────────────
  password_reset: {
    subject: 'Reset your password',
    heading: 'Reset your password',
    paragraphs: ['We received a request to reset the password for your account. Click the button below to choose a new one.'],
    button: { label: 'Reset password', url: '{{reset_url}}' },
    notes: ["This link expires in 1 hour. If you didn't request a password reset, you can ignore this email: your password won't change."],
    linkFallback: { label: "If the button doesn't work, paste this link into your browser:", url: '{{reset_url}}' },
  },
  welcome: {
    subject: 'Welcome! Your account is ready',
    heading: 'Welcome aboard',
    paragraphs: [
      'Your account and workspace are ready.',
      'Connect a channel, set up your AI agent and invite your team to start answering conversations.',
    ],
    button: { label: 'Open your workspace', url: '{{app_url}}' },
    notes: ["You're receiving this email because you just created an account."],
  },
  payment_failed: {
    subject: "We couldn't process your payment",
    heading: 'Payment failed',
    paragraphs: [
      "We couldn't charge {{amount}} for your subscription. Update your payment method to keep full access to your account.",
    ],
    button: { label: 'Update payment method', url: '{{billing_url}}' },
    notes: ["If you've already updated your payment method, you can ignore this email."],
  },
  payment_needs_review: {
    subject: 'A payment needs manual review',
    heading: 'Payment needs review',
    paragraphs: [
      'We received a payment of {{amount}} from {{payer_name}}, but the appointment could not be confirmed ({{reason}}).',
      'No automatic refund was made. Please review the payment and contact the customer.',
    ],
    button: { label: 'Review payment', url: '{{review_url}}' },
  },
  demo_ready: {
    subject: 'Your demo is ready!',
    heading: 'Your demo is ready',
    paragraphs: ['Your personalized demo ({{demo_type}}) is ready.'],
    button: { label: 'View my demo', url: '{{demo_url}}' },
    notes: ['This link expires in 7 days and can be used up to 3 times.'],
  },

  // ── Organization → its contacts ──────────────────────────────────────────
  appointment_confirmation_request: appointmentEmail({
    subject: 'Please confirm your appointment: {{appointment_title}}',
    paragraphs: ['You have an upcoming appointment. Please confirm it:'],
    button: { label: 'Confirm appointment', url: '{{confirm_url}}' },
    notes: ['You can also reschedule or cancel from the same link.'],
  }),
  appointment_confirmation_reminder: appointmentEmail({
    subject: 'Reminder: please confirm your appointment {{appointment_title}}',
    paragraphs: ["Your appointment is coming up and hasn't been confirmed yet. Please confirm it:"],
    button: { label: 'Confirm appointment', url: '{{confirm_url}}' },
    notes: ['You can also reschedule or cancel from the same link.'],
  }),
  appointment_confirmation_rescheduled: appointmentEmail({
    subject: 'Please confirm the new time: {{appointment_title}}',
    paragraphs: ['Your appointment has been moved. Please confirm the new time:'],
    button: { label: 'Confirm appointment', url: '{{confirm_url}}' },
    notes: ['You can also reschedule or cancel from the same link.'],
  }),
  appointment_confirmed: appointmentEmail({
    subject: 'Appointment confirmed: {{appointment_title}}',
    paragraphs: ['Your appointment is confirmed. Here are the details:'],
    button: JOIN_BUTTON,
    links: [MANAGE_LINK],
  }),
  appointment_rescheduled: appointmentEmail({
    subject: 'Your appointment has been rescheduled: {{appointment_title}}',
    paragraphs: ['Your appointment has been moved. Here are the new details:'],
    links: [MANAGE_LINK],
  }),
  appointment_cancelled: appointmentEmail({
    subject: 'Appointment cancelled: {{appointment_title}}',
    paragraphs: ['Your appointment has been cancelled:'],
  }),
  appointment_reminder: appointmentEmail({
    subject: 'Reminder: {{appointment_title}}',
    paragraphs: ['This is a reminder of your upcoming appointment:'],
    button: JOIN_BUTTON,
    links: [MANAGE_LINK],
  }),
  follow_up: {
    subject: '{{subject}}',
    heading: '{{organization_name}}',
    greeting: null, // the message is written in full by the step (or FOLLOW_UP_MESSAGE)
    paragraphs: ['{{message}}'],
    footer: '{{organization_name}}',
  },
  /** Sent by the AI agent (send_email tool). Subject and body are the agent's plain text. */
  agent_email: {
    subject: '{{subject}}',
    heading: '{{subject}}',
    greeting: null,
    paragraphs: ['{{message}}'],
  },
} satisfies Record<string, EmailTemplate>;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATES;

export const SMS_TEMPLATES = {
  appointment_confirmed:
    '{{organization_name}}: Hi {{user_name}}, your appointment "{{appointment_title}}" is confirmed for {{appointment_date}} at {{appointment_time}}.',
  appointment_rescheduled:
    '{{organization_name}}: Hi {{user_name}}, your appointment "{{appointment_title}}" has been moved to {{appointment_date}} at {{appointment_time}}.',
  appointment_cancelled:
    '{{organization_name}}: Hi {{user_name}}, your appointment "{{appointment_title}}" on {{appointment_date}} at {{appointment_time}} has been cancelled.',
  appointment_reminder:
    '{{organization_name}}: Hi {{user_name}}, this is a reminder of your appointment "{{appointment_title}}" on {{appointment_date}} at {{appointment_time}}.',
  appointment_confirmation_request:
    '{{organization_name}}: Hi {{user_name}}, please confirm your appointment "{{appointment_title}}" on {{appointment_date}} at {{appointment_time}}: {{confirm_url}}',
  /** Appended when the booking has a manage link. */
  manage_suffix: ' Reschedule or cancel: {{manage_url}}',
} as const;

export type SmsTemplateKey = keyof typeof SMS_TEMPLATES;

/** Default follow-up text (email, chat message or a call degraded to a message) when the step has none. */
export const FOLLOW_UP_MESSAGE =
  "Hi {{user_name}}, we're following up to see if there's anything we can help you with. - {{organization_name}}";

/** In-app notifications shown to the organization's users. */
export const NOTIFICATION_TEMPLATES = {
  new_appointment: 'New appointment: {{appointment_title}}',
  payment_needs_review: 'Payment needs review',
  new_contact: 'New contact: {{contact_name}}',
  new_contact_unnamed: 'New contact',
  new_message: 'New message from {{contact_name}}',
  incoming_call: 'Incoming call',
  incoming_call_detail: 'From {{phone}}',
  outgoing_call: 'Outgoing call',
  outgoing_call_detail: 'To {{phone}}',
  follow_up_due: 'Follow-up due: {{step_title}}',
  follow_up_due_detail: '{{contact_name}} — mark it done in the agenda when finished',
} as const;

/** Fallback when a contact has no name. */
export const UNNAMED_CONTACT = 'a contact';

/** Calendar invite (.ics) alarm text. */
export const ICS_ALARM_TEMPLATE = 'Reminder: {{appointment_title}}';
