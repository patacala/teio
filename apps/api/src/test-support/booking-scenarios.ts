/**
 * Every booking message situation the contact can be in, as inputs.
 *
 * Recorded once from the legacy AppointmentEmailConsumer into
 * `golden/booking-messages.json`; the booking automations that replace it
 * replay the same inputs and must produce the same emails and SMS.
 */

export type BookingEvent =
  | 'appointment.confirmation_requested'
  | 'appointment.confirmed'
  | 'appointment.rescheduled'
  | 'appointment.cancelled'
  | 'appointment.reminder_due';

export interface BookingScenarioContact {
  first_name: string | null;
  last_name?: string | null;
  email: string | null;
  phone: string | null;
}

export interface BookingScenario {
  name: string;
  event: BookingEvent;
  contact: BookingScenarioContact | null;
  /** The user who created the booking, when the invite organizer must be them. */
  creator?: { full_name: string; email: string };
  payload: Record<string, unknown>;
}

export const SCENARIO_ORGANIZATION = { id: 'org-1', name: 'Clínica Sol' };

const CONTACTS = {
  emailOnly: { first_name: 'Ana', last_name: 'García', email: 'ana@example.com', phone: null },
  phoneOnly: { first_name: 'Ana', last_name: null, email: null, phone: '+5215550001' },
  both: { first_name: 'Ana', last_name: 'García', email: 'ana@example.com', phone: '+5215550001' },
  unnamed: { first_name: null, last_name: null, email: 'anon@example.com', phone: '+5215550002' },
  unreachable: { first_name: 'Ana', last_name: null, email: null, phone: null },
} satisfies Record<string, BookingScenarioContact>;

const BASE = {
  organization_id: SCENARIO_ORGANIZATION.id,
  appointment_id: 'a0000000-0000-4000-8000-000000000001',
  contact_id: 'c0000000-0000-4000-8000-000000000001',
  conversation_id: null,
  calendar_id: 'ca000000-0000-4000-8000-000000000001',
  title: 'Initial consultation',
  starts_at: '2026-03-23T15:00:00.000Z',
  ends_at: '2026-03-23T15:30:00.000Z',
  timezone: 'America/Mexico_City',
  origin: 'human',
  status: 'confirmed',
  sequence: 2,
  location: null,
  meeting_url: null,
  created_by: null,
  description: null,
};

const EXTRAS = {
  location: 'Main office, 2nd floor',
  meeting_url: 'https://meet.example.com/abc',
  manage_url: 'https://api.example.com/manage?token=m',
  manage_url_sms: 'https://api.example.com/m/abc',
};

const CONFIRM = {
  confirm_url: 'https://api.example.com/confirm?token=e',
  confirm_url_sms: 'https://api.example.com/confirm?token=e&c=s',
};

export const BOOKING_SCENARIOS: BookingScenario[] = [
  // ── Confirmation requests ──────────────────────────────────────────────
  ...(['emailOnly', 'phoneOnly', 'both', 'unreachable'] as const).map((c) => ({
    name: `confirmation request / ${c}`,
    event: 'appointment.confirmation_requested' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, status: 'scheduled', ...CONFIRM, manage_url: EXTRAS.manage_url, manage_url_sms: EXTRAS.manage_url_sms, reminder: false, rescheduled: false },
  })),
  ...(['emailOnly', 'phoneOnly'] as const).map((c) => ({
    name: `confirmation request (reminder) / ${c}`,
    event: 'appointment.confirmation_requested' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, status: 'scheduled', ...CONFIRM, reminder: true, rescheduled: false },
  })),
  ...(['both', 'phoneOnly'] as const).map((c) => ({
    name: `confirmation request (rescheduled) / ${c}`,
    event: 'appointment.confirmation_requested' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, status: 'scheduled', ...CONFIRM, reminder: false, rescheduled: true },
  })),

  // ── Confirmed ──────────────────────────────────────────────────────────
  ...(['emailOnly', 'phoneOnly', 'both', 'unnamed', 'unreachable'] as const).map((c) => ({
    name: `confirmed with location, meeting and manage link / ${c}`,
    event: 'appointment.confirmed' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, ...EXTRAS },
  })),
  {
    name: 'confirmed without location, meeting or manage link / both',
    event: 'appointment.confirmed',
    contact: CONTACTS.both,
    payload: { ...BASE, manage_url: null, manage_url_sms: null },
  },
  {
    name: 'confirmed, created by a team member (invite organizer) / emailOnly',
    event: 'appointment.confirmed',
    contact: CONTACTS.emailOnly,
    creator: { full_name: 'Dr. Luis Pérez', email: 'luis@clinicasol.example.com' },
    payload: { ...BASE, ...EXTRAS, created_by: 'u0000000-0000-4000-8000-000000000001' },
  },
  {
    name: 'confirmed, title with HTML / emailOnly',
    event: 'appointment.confirmed',
    contact: CONTACTS.emailOnly,
    payload: { ...BASE, ...EXTRAS, title: 'Consulta <b>VIP</b> & más', description: 'Bring your ID, please' },
  },

  // ── Rescheduled ────────────────────────────────────────────────────────
  ...(['emailOnly', 'phoneOnly', 'both'] as const).map((c) => ({
    name: `rescheduled (confirmed) / ${c}`,
    event: 'appointment.rescheduled' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, ...EXTRAS, sequence: 3 },
  })),
  {
    name: 'rescheduled, still awaiting confirmation / both',
    event: 'appointment.rescheduled',
    contact: CONTACTS.both,
    payload: { ...BASE, ...EXTRAS, status: 'scheduled', sequence: 3 },
  },

  // ── Cancelled ──────────────────────────────────────────────────────────
  ...(['emailOnly', 'phoneOnly', 'both', 'unnamed'] as const).map((c) => ({
    name: `cancelled / ${c}`,
    event: 'appointment.cancelled' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, ...EXTRAS, status: 'cancelled', sequence: 4 },
  })),

  // ── Reminders ──────────────────────────────────────────────────────────
  ...(['emailOnly', 'phoneOnly', 'both'] as const).map((c) => ({
    name: `reminder, confirmed booking / ${c}`,
    event: 'appointment.reminder_due' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, ...EXTRAS, reminder_id: 'r0000000-0000-4000-8000-000000000001', offset_minutes: 1440, confirm_url: null, confirm_url_sms: null },
  })),
  ...(['emailOnly', 'phoneOnly', 'both'] as const).map((c) => ({
    name: `reminder, unconfirmed booking / ${c}`,
    event: 'appointment.reminder_due' as const,
    contact: CONTACTS[c],
    payload: { ...BASE, ...EXTRAS, status: 'scheduled', reminder_id: 'r0000000-0000-4000-8000-000000000002', offset_minutes: 120, ...CONFIRM },
  })),
];

/** What the contact received, in the order it was sent. */
export type OutboundRecord =
  | {
      channel: 'email';
      to: string;
      subject: string;
      html: string;
      attachments: Array<{ filename: string; contentType: string; content: string }>;
    }
  | { channel: 'sms'; to: string; text: string };

/** DTSTAMP is the send time; everything else in the invite is deterministic. */
export function normalizeIcs(text: string): string {
  return text.replace(/DTSTAMP:\d{8}T\d{6}Z/g, 'DTSTAMP:<now>');
}

export function decodeAttachment(a: { filename: string; content: string; contentType: string }) {
  return {
    filename: a.filename,
    contentType: a.contentType,
    content: normalizeIcs(Buffer.from(a.content, 'base64').toString('utf8')),
  };
}
