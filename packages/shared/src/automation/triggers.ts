import { CHANNEL_OPTIONS, SENDER_TYPE_OPTIONS, type AutomationFieldDef, type VariableGroup } from './fields';

/**
 * What can start an automation. One catalog for the engine (which topic feeds
 * which trigger, what a filter may reference) and the builder (labels,
 * pickers, variables).
 */
export type TriggerKey =
  | 'message.received'
  | 'message.sent'
  | 'conversation.opened'
  | 'conversation.closed'
  | 'contact.created'
  | 'contact.tag_added'
  | 'contact.tag_removed'
  | 'contact.stage_changed'
  | 'appointment.created'
  | 'appointment.confirmed'
  | 'appointment.rescheduled'
  | 'appointment.cancelled'
  | 'appointment.completed'
  | 'appointment.no_show'
  | 'appointment.confirmation_requested'
  | 'appointment.reminder_due'
  | 'payment.completed'
  | 'payment.expired'
  | 'payment.failed'
  | 'call.completed'
  | 'schedule'
  | 'manual';

export type TriggerCategory =
  | 'messages'
  | 'conversations'
  | 'contacts'
  | 'appointments'
  | 'payments'
  | 'calls'
  | 'time'
  | 'manual';

/**
 * `contact`: each start is about one contact (event and manual triggers).
 * `organization`: one run for the whole organization (schedules); its steps
 * pick their recipients.
 */
export type TriggerScope = 'contact' | 'organization';

export interface TriggerCatalogEntry {
  key: TriggerKey;
  label: string;
  description: string;
  category: TriggerCategory;
  scope: TriggerScope;
  /** RabbitMQ topic the trigger listens to (event triggers only). */
  topic?: string;
  /** `trigger.*` fields usable in filters, conditions and as `{{trigger.x}}`. */
  fields: AutomationFieldDef[];
  /** Variable groups available to the steps of a run started by this trigger. */
  variableGroups: VariableGroup[];
}

const CHANNEL_FIELD: AutomationFieldDef = { path: 'trigger.channel', label: 'Channel', type: 'enum', options: CHANNEL_OPTIONS };

const APPOINTMENT_FIELDS: AutomationFieldDef[] = [
  { path: 'trigger.calendar_id', label: 'Calendar', type: 'enum', picker: 'calendar' },
  { path: 'trigger.title', label: 'Appointment title', type: 'string' },
  {
    path: 'trigger.status',
    label: 'Appointment status',
    type: 'enum',
    options: [
      { value: 'scheduled', label: 'Awaiting confirmation' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'held', label: 'Held (awaiting payment)' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'completed', label: 'Completed' },
      { value: 'no_show', label: 'No-show' },
    ],
  },
  {
    path: 'trigger.origin',
    label: 'Booked by',
    type: 'enum',
    options: [
      { value: 'human', label: 'Team member' },
      { value: 'ai', label: 'AI agent' },
      { value: 'webhook', label: 'Integration / booking page' },
    ],
  },
];

const CONTACT_RUN: VariableGroup[] = ['contact', 'organization'];
const CONVERSATION_RUN: VariableGroup[] = ['contact', 'organization', 'conversation'];

export const TRIGGER_CATALOG: TriggerCatalogEntry[] = [
  // ── Messages ──────────────────────────────────────────────────────────
  {
    key: 'message.received',
    label: 'Message received',
    description: 'A contact sends a message on any channel.',
    category: 'messages',
    scope: 'contact',
    topic: 'message.received',
    fields: [CHANNEL_FIELD, { path: 'trigger.content', label: 'Message text', type: 'text' }],
    variableGroups: [...CONVERSATION_RUN, 'message'],
  },
  {
    key: 'message.sent',
    label: 'Message sent',
    description: 'A message is sent to a contact — by the AI, a team member, an integration or an automation.',
    category: 'messages',
    scope: 'contact',
    topic: 'message.send',
    fields: [
      CHANNEL_FIELD,
      { path: 'trigger.sender_type', label: 'Sent by', type: 'enum', options: SENDER_TYPE_OPTIONS, picker: 'sender_type' },
      { path: 'trigger.content', label: 'Message text', type: 'text' },
    ],
    variableGroups: [...CONVERSATION_RUN, 'message'],
  },

  // ── Conversations ─────────────────────────────────────────────────────
  {
    key: 'conversation.opened',
    label: 'Conversation started',
    description: 'A new conversation starts, by the contact writing in or by the business reaching out.',
    category: 'conversations',
    scope: 'contact',
    topic: 'conversation.opened',
    fields: [
      CHANNEL_FIELD,
      {
        path: 'trigger.opened_by',
        label: 'Started by',
        type: 'enum',
        options: [
          { value: 'contact', label: 'The contact' },
          { value: 'business', label: 'The business' },
        ],
      },
    ],
    variableGroups: CONVERSATION_RUN,
  },
  {
    key: 'conversation.closed',
    label: 'Conversation resolved',
    description: 'A conversation is marked as resolved.',
    category: 'conversations',
    scope: 'contact',
    topic: 'conversation.closed',
    fields: [CHANNEL_FIELD],
    variableGroups: CONVERSATION_RUN,
  },

  // ── Contacts ──────────────────────────────────────────────────────────
  {
    key: 'contact.created',
    label: 'Contact created',
    description: 'A new contact is added — from a first message or call, by a team member, or through the API.',
    category: 'contacts',
    scope: 'contact',
    topic: 'contact.created',
    fields: [
      {
        path: 'trigger.source',
        label: 'Created from',
        type: 'enum',
        options: [
          { value: 'channel', label: 'A first message or call' },
          { value: 'manual', label: 'A team member' },
          { value: 'api', label: 'The API or the AI agent' },
        ],
      },
      CHANNEL_FIELD,
    ],
    variableGroups: CONTACT_RUN,
  },
  {
    key: 'contact.tag_added',
    label: 'Tag added',
    description: 'A tag is added to a contact.',
    category: 'contacts',
    scope: 'contact',
    topic: 'contact.tag.added',
    fields: [{ path: 'trigger.tag', label: 'Tag', type: 'string', picker: 'tag' }],
    variableGroups: CONTACT_RUN,
  },
  {
    key: 'contact.tag_removed',
    label: 'Tag removed',
    description: 'A tag is removed from a contact.',
    category: 'contacts',
    scope: 'contact',
    topic: 'contact.tag.removed',
    fields: [{ path: 'trigger.tag', label: 'Tag', type: 'string', picker: 'tag' }],
    variableGroups: CONTACT_RUN,
  },
  {
    key: 'contact.stage_changed',
    label: 'Funnel stage changed',
    description: 'A contact moves to another funnel stage.',
    category: 'contacts',
    scope: 'contact',
    topic: 'contact.stage.changed',
    fields: [
      { path: 'trigger.from_stage_id', label: 'From stage', type: 'enum', picker: 'stage' },
      { path: 'trigger.to_stage_id', label: 'To stage', type: 'enum', picker: 'stage' },
    ],
    variableGroups: CONTACT_RUN,
  },

  // ── Appointments ──────────────────────────────────────────────────────
  {
    key: 'appointment.created',
    label: 'Appointment booked',
    description: 'An appointment is booked.',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.created',
    fields: APPOINTMENT_FIELDS,
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },
  {
    key: 'appointment.confirmation_requested',
    label: 'Appointment needs confirmation',
    description: 'The contact must confirm an appointment: after booking, as a reminder, or after it was moved.',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.confirmation.requested',
    fields: [
      ...APPOINTMENT_FIELDS,
      { path: 'trigger.reminder', label: 'Is a reminder', type: 'boolean' },
      { path: 'trigger.rescheduled', label: 'After a reschedule', type: 'boolean' },
    ],
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },
  {
    key: 'appointment.confirmed',
    label: 'Appointment confirmed',
    description: 'An appointment is confirmed.',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.confirmed',
    fields: APPOINTMENT_FIELDS,
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },
  {
    key: 'appointment.rescheduled',
    label: 'Appointment rescheduled',
    description: 'An appointment moves to another time.',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.rescheduled',
    fields: APPOINTMENT_FIELDS,
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },
  {
    key: 'appointment.cancelled',
    label: 'Appointment cancelled',
    description: 'An appointment is cancelled.',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.cancelled',
    fields: APPOINTMENT_FIELDS,
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },
  {
    key: 'appointment.completed',
    label: 'Appointment completed',
    description: 'An appointment is marked as completed.',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.completed',
    fields: APPOINTMENT_FIELDS,
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },
  {
    key: 'appointment.no_show',
    label: 'Appointment no-show',
    description: 'The contact did not show up to an appointment.',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.no_show',
    fields: APPOINTMENT_FIELDS,
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },
  {
    key: 'appointment.reminder_due',
    label: 'Appointment reminder due',
    description: 'An appointment is coming up (reminder times are set per calendar).',
    category: 'appointments',
    scope: 'contact',
    topic: 'appointment.reminder.due',
    fields: [
      ...APPOINTMENT_FIELDS,
      { path: 'trigger.offset_minutes', label: 'Minutes before the appointment', type: 'number' },
      { path: 'trigger.needs_confirmation', label: 'Still awaiting confirmation', type: 'boolean' },
    ],
    variableGroups: [...CONTACT_RUN, 'appointment'],
  },

  // ── Payments ──────────────────────────────────────────────────────────
  {
    key: 'payment.completed',
    label: 'Payment received',
    description: 'A contact pays a payment link.',
    category: 'payments',
    scope: 'contact',
    topic: 'payment.completed',
    fields: [
      { path: 'trigger.service_id', label: 'Service', type: 'enum', picker: 'service' },
      { path: 'trigger.amount', label: 'Amount (cents)', type: 'number' },
      { path: 'trigger.appointment_confirmed', label: 'Appointment confirmed by the payment', type: 'boolean' },
      { path: 'trigger.needs_attention', label: 'Needs review by the team', type: 'boolean' },
    ],
    variableGroups: [...CONVERSATION_RUN, 'payment'],
  },
  {
    key: 'payment.expired',
    label: 'Payment link expired',
    description: 'A payment link expires without being paid.',
    category: 'payments',
    scope: 'contact',
    topic: 'payment.expired',
    fields: [{ path: 'trigger.service_id', label: 'Service', type: 'enum', picker: 'service' }],
    variableGroups: [...CONVERSATION_RUN, 'payment'],
  },
  {
    key: 'payment.failed',
    label: 'Payment failed',
    description: 'A delayed payment method fails.',
    category: 'payments',
    scope: 'contact',
    topic: 'payment.expired',
    fields: [{ path: 'trigger.service_id', label: 'Service', type: 'enum', picker: 'service' }],
    variableGroups: [...CONVERSATION_RUN, 'payment'],
  },

  // ── Calls ─────────────────────────────────────────────────────────────
  {
    key: 'call.completed',
    label: 'Call ended',
    description: 'A voice call ends (fires again when the call analysis arrives).',
    category: 'calls',
    scope: 'contact',
    topic: 'call.completed',
    fields: [{ path: 'trigger.duration_seconds', label: 'Duration (seconds)', type: 'number' }],
    variableGroups: [...CONVERSATION_RUN, 'call'],
  },

  // ── Time and manual ───────────────────────────────────────────────────
  {
    key: 'schedule',
    label: 'On a schedule',
    description: 'Runs once for the whole organization at the times you set. Its steps choose who receives messages.',
    category: 'time',
    scope: 'organization',
    fields: [],
    variableGroups: ['organization'],
  },
  {
    key: 'manual',
    label: 'Added manually',
    description: 'A team member adds contacts to the automation (from the contact or an appointment).',
    category: 'manual',
    scope: 'contact',
    fields: [],
    variableGroups: CONTACT_RUN,
  },
];

export function findTrigger(key: string): TriggerCatalogEntry | undefined {
  return TRIGGER_CATALOG.find((t) => t.key === key);
}
