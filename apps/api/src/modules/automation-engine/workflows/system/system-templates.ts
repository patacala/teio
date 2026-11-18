import {
  DEFAULT_AUTOMATION_SETTINGS,
  type AutomationCategory,
  type AutomationDefinition,
  type AutomationEdge,
  type AutomationNode,
  type AutomationSettings,
  type ConditionGroup,
  type EmailContent,
  type NodeConfigMap,
  type NodeHandle,
  type NodeType,
} from '@crm/shared';
import { DEFAULT_OPT_OUT_KEYWORDS } from './opt-out-keywords';

/**
 * Automations the platform installs in every organization. They reproduce
 * what used to be hard-coded (booking messages, AI routing, the no-response
 * follow-up) so switching to automations changes nothing for the contact —
 * the golden files under test-support/golden prove it — while letting each
 * organization edit, pause or extend them.
 */
export interface SystemTemplate {
  template_key: string;
  name: string;
  description: string;
  category: AutomationCategory;
  definition: AutomationDefinition;
  /** Whether it starts active for this organization (derived from its current setup). */
  active: boolean;
}

// ── Small graph builder ────────────────────────────────────────────────────

class GraphBuilder {
  readonly nodes: AutomationNode[] = [];
  readonly edges: AutomationEdge[] = [];

  add<T extends NodeType>(key: string, type: T, config: NodeConfigMap[T], label?: string): string {
    this.nodes.push({ key, type, config, ...(label ? { label } : {}) } as AutomationNode);
    return key;
  }

  link(source: string, target: string, handle: NodeHandle = 'next'): void {
    this.edges.push(handle === 'next' ? { source, target } : { source, target, sourceHandle: handle });
  }

  graph() {
    return { nodes: this.nodes, edges: this.edges };
  }
}

const rule = (field: string, operator: string, value?: unknown): ConditionGroup =>
  ({ any: [{ all: [{ field, operator, ...(value !== undefined ? { value } : {}) }] }] }) as ConditionGroup;
const RUN_CONTACT = { mode: 'run_contact' as const };
const settings = (patch: Partial<AutomationSettings>): AutomationSettings => ({ ...DEFAULT_AUTOMATION_SETTINGS, ...patch });

/** Booking messages are about the contact's own appointment: always sent, never blocking each other. */
const BOOKING_SETTINGS = settings({ respect_opt_out: false, allow_parallel_runs: true });

// ── Booking messages (were AppointmentEmailConsumer) ──────────────────────

const GREETING = 'Hi {{contact.full_name|there}},';
const APPOINTMENT_DETAILS: EmailContent['details'] = [
  { label: 'Appointment', value: '{{appointment.title}}' },
  { label: 'Date', value: '{{appointment.date}}' },
  { label: 'Time', value: '{{appointment.time}} – {{appointment.end_time}} ({{appointment.timezone}})' },
  { label: 'Location', value: '{{appointment.location}}' },
];
const MANAGE_LINK = { label: 'Reschedule or cancel', url: '{{appointment.manage_url}}' };
const JOIN_BUTTON = { label: 'Join meeting', url: '{{appointment.meeting_url}}' };
const CONFIRM_BUTTON = { label: 'Confirm appointment', url: '{{appointment.confirm_url}}' };
const CONFIRM_NOTE = 'You can also reschedule or cancel from the same link.';

const appointmentEmail = (e: Omit<EmailContent, 'heading' | 'details' | 'footer' | 'greeting'>): EmailContent => ({
  heading: '{{organization.name}}',
  greeting: GREETING,
  details: APPOINTMENT_DETAILS,
  footer: '{{organization.name}}',
  ...e,
});

const EMAILS = {
  confirmation_request: appointmentEmail({
    subject: 'Please confirm your appointment: {{appointment.title}}',
    paragraphs: ['You have an upcoming appointment. Please confirm it:'],
    button: CONFIRM_BUTTON,
    notes: [CONFIRM_NOTE],
  }),
  confirmation_reminder: appointmentEmail({
    subject: 'Reminder: please confirm your appointment {{appointment.title}}',
    paragraphs: ["Your appointment is coming up and hasn't been confirmed yet. Please confirm it:"],
    button: CONFIRM_BUTTON,
    notes: [CONFIRM_NOTE],
  }),
  confirmation_rescheduled: appointmentEmail({
    subject: 'Please confirm the new time: {{appointment.title}}',
    paragraphs: ['Your appointment has been moved. Please confirm the new time:'],
    button: CONFIRM_BUTTON,
    notes: [CONFIRM_NOTE],
  }),
  confirmed: appointmentEmail({
    subject: 'Appointment confirmed: {{appointment.title}}',
    paragraphs: ['Your appointment is confirmed. Here are the details:'],
    button: JOIN_BUTTON,
    links: [MANAGE_LINK],
  }),
  rescheduled: appointmentEmail({
    subject: 'Your appointment has been rescheduled: {{appointment.title}}',
    paragraphs: ['Your appointment has been moved. Here are the new details:'],
    links: [MANAGE_LINK],
  }),
  cancelled: appointmentEmail({
    subject: 'Appointment cancelled: {{appointment.title}}',
    paragraphs: ['Your appointment has been cancelled:'],
  }),
  reminder: appointmentEmail({
    subject: 'Reminder: {{appointment.title}}',
    paragraphs: ['This is a reminder of your upcoming appointment:'],
    button: JOIN_BUTTON,
    links: [MANAGE_LINK],
  }),
};

const SMS_PREFIX = '{{organization.name}}: Hi {{contact.full_name|there}}, ';
const MANAGE_SUFFIX = '{{#if appointment.manage_url_sms}} Reschedule or cancel: {{appointment.manage_url_sms}}{{/if}}';
const SMS = {
  confirmation_request: `${SMS_PREFIX}please confirm your appointment "{{appointment.title}}" on {{appointment.date}} at {{appointment.time}}: {{appointment.confirm_url_sms}}`,
  confirmed: `${SMS_PREFIX}your appointment "{{appointment.title}}" is confirmed for {{appointment.date}} at {{appointment.time}}.${MANAGE_SUFFIX}`,
  rescheduled: `${SMS_PREFIX}your appointment "{{appointment.title}}" has been moved to {{appointment.date}} at {{appointment.time}}.${MANAGE_SUFFIX}`,
  cancelled: `${SMS_PREFIX}your appointment "{{appointment.title}}" on {{appointment.date}} at {{appointment.time}} has been cancelled.`,
  reminder: `${SMS_PREFIX}this is a reminder of your appointment "{{appointment.title}}" on {{appointment.date}} at {{appointment.time}}.`,
};

const HAS_EMAIL = rule('contact.email', 'is_not_empty');
const HAS_PHONE = rule('contact.phone', 'is_not_empty');

type Email = keyof typeof EMAILS;

/**
 * "Email when the contact has an email; SMS only when they don't" — how
 * confirmation requests and reminders reach the contact.
 */
function emailElseSms(g: GraphBuilder, prefix: string, email: Email, sms: string, invite: 'none' | 'request' | 'cancel' = 'none'): string {
  const hasEmail = g.add(`${prefix}_has_email`, 'condition', { condition: HAS_EMAIL }, 'Has an email?');
  g.link(hasEmail, g.add(`${prefix}_email`, 'send_email', { recipients: RUN_CONTACT, email: EMAILS[email], calendar_invite: invite }), 'yes');
  const hasPhone = g.add(`${prefix}_has_phone`, 'condition', { condition: HAS_PHONE }, 'Has a phone?');
  g.link(hasEmail, hasPhone, 'no');
  g.link(hasPhone, g.add(`${prefix}_sms`, 'send_sms', { recipients: RUN_CONTACT, text: sms }), 'yes');
  return hasEmail;
}

/** "Email if they have one, and SMS if they have a phone" — confirmations, changes, cancellations. */
function emailAndSms(g: GraphBuilder, prefix: string, email: Email, sms: string, invite: 'none' | 'request' | 'cancel'): string {
  const hasEmail = g.add(`${prefix}_has_email`, 'condition', { condition: HAS_EMAIL }, 'Has an email?');
  const send = g.add(`${prefix}_email`, 'send_email', { recipients: RUN_CONTACT, email: EMAILS[email], calendar_invite: invite });
  g.link(hasEmail, send, 'yes');
  const phoneAfterEmail = g.add(`${prefix}_has_phone`, 'condition', { condition: HAS_PHONE }, 'Has a phone?');
  g.link(send, phoneAfterEmail);
  g.link(phoneAfterEmail, g.add(`${prefix}_sms`, 'send_sms', { recipients: RUN_CONTACT, text: sms }), 'yes');
  const phoneOnly = g.add(`${prefix}_has_phone_only`, 'condition', { condition: HAS_PHONE }, 'Has a phone?');
  g.link(hasEmail, phoneOnly, 'no');
  g.link(phoneOnly, g.add(`${prefix}_sms_only`, 'send_sms', { recipients: RUN_CONTACT, text: sms }), 'yes');
  return hasEmail;
}

function bookingTemplates(): SystemTemplate[] {
  // Confirmation requests: the rescheduled variant wins over the reminder one.
  const request = new GraphBuilder();
  const isRescheduled = request.add('is_rescheduled', 'condition', { condition: rule('trigger.rescheduled', 'is_true') }, 'After a reschedule?');
  request.link(isRescheduled, emailElseSms(request, 'rescheduled', 'confirmation_rescheduled', SMS.confirmation_request), 'yes');
  const isReminder = request.add('is_reminder', 'condition', { condition: rule('trigger.reminder', 'is_true') }, 'Is a reminder?');
  request.link(isRescheduled, isReminder, 'no');
  request.link(isReminder, emailElseSms(request, 'reminder', 'confirmation_reminder', SMS.confirmation_request), 'yes');
  request.link(isReminder, emailElseSms(request, 'request', 'confirmation_request', SMS.confirmation_request), 'no');

  const confirmed = new GraphBuilder();
  emailAndSms(confirmed, 'confirmed', 'confirmed', SMS.confirmed, 'request');

  // A booking still awaiting confirmation gets the confirmation request instead.
  const rescheduled = new GraphBuilder();
  const awaiting = rescheduled.add('awaiting_confirmation', 'condition', { condition: rule('trigger.status', 'equals', 'scheduled') }, 'Still awaiting confirmation?');
  rescheduled.link(awaiting, rescheduled.add('covered', 'end', { reason: 'The confirmation request tells the contact' }), 'yes');
  rescheduled.link(awaiting, emailAndSms(rescheduled, 'rescheduled', 'rescheduled', SMS.rescheduled, 'request'), 'no');

  const cancelled = new GraphBuilder();
  emailAndSms(cancelled, 'cancelled', 'cancelled', SMS.cancelled, 'cancel');

  // Unconfirmed bookings are asked to confirm; confirmed ones get a reminder.
  const reminder = new GraphBuilder();
  const needsConfirmation = reminder.add('needs_confirmation', 'condition', { condition: rule('trigger.needs_confirmation', 'is_true') }, 'Still awaiting confirmation?');
  reminder.link(needsConfirmation, emailElseSms(reminder, 'confirm', 'confirmation_reminder', SMS.confirmation_request), 'yes');
  reminder.link(needsConfirmation, emailElseSms(reminder, 'remind', 'reminder', SMS.reminder), 'no');

  const booking = (template_key: string, name: string, description: string, trigger: string, g: GraphBuilder): SystemTemplate => ({
    template_key,
    name,
    description,
    category: 'booking',
    active: true,
    definition: { triggers: [{ key: trigger as never }], graph: g.graph(), settings: BOOKING_SETTINGS },
  });

  return [
    booking('booking_confirmation_request', 'Booking: ask to confirm', 'Asks the contact to confirm a booking — after booking, as a reminder, or after it was moved.', 'appointment.confirmation_requested', request),
    booking('booking_confirmed', 'Booking: confirmed', 'Sends the confirmation with a calendar invite.', 'appointment.confirmed', confirmed),
    booking('booking_rescheduled', 'Booking: rescheduled', 'Tells the contact their appointment moved, with an updated invite.', 'appointment.rescheduled', rescheduled),
    booking('booking_cancelled', 'Booking: cancelled', 'Tells the contact their appointment was cancelled and removes it from their calendar.', 'appointment.cancelled', cancelled),
    booking('booking_reminder', 'Booking: reminder', 'Reminds the contact before the appointment (times are set per calendar).', 'appointment.reminder_due', reminder),
  ];
}

// ── AI agent routing (was: every inbound message / payment / call) ─────────

export interface AiSetup {
  /** The organization had an active agent for incoming messages. */
  incomingActive: boolean;
  incomingAgentId: string | null;
  /** Payments reached an agent (dedicated, or the incoming one). */
  paymentActive: boolean;
  paymentAgentId: string | null;
  /** Calls reached a dedicated call agent. */
  callActive: boolean;
  callAgentId: string | null;
}

const AI_SETTINGS = settings({ respect_opt_out: false, allow_parallel_runs: true });

function aiTemplates(ai: AiSetup): SystemTemplate[] {
  const incoming = new GraphBuilder();
  const aiActive = incoming.add('ai_active', 'condition', { condition: rule('conversation.ai_active', 'is_true') }, 'AI answering this conversation?');
  incoming.link(aiActive, incoming.add('send_to_ai', 'send_to_ai', { agent_id: ai.incomingAgentId }), 'yes');

  const payment = new GraphBuilder();
  payment.add('send_to_ai', 'send_to_ai', { agent_id: ai.paymentAgentId });

  const call = new GraphBuilder();
  call.add('send_to_ai', 'send_to_ai', { agent_id: ai.callAgentId });

  return [
    {
      template_key: 'ai_incoming_message',
      name: 'AI agent: answer incoming messages',
      description: 'Sends every incoming message, on every channel, to the AI agent — unless a team member took the conversation over.',
      category: 'ai',
      active: ai.incomingActive,
      definition: { triggers: [{ key: 'message.received' }], graph: incoming.graph(), settings: AI_SETTINGS },
    },
    {
      template_key: 'ai_payment_update',
      name: 'AI agent: payment updates',
      description: 'Tells the AI agent when a payment link is paid or expires, so it can continue the conversation.',
      category: 'ai',
      active: ai.paymentActive,
      definition: {
        triggers: [{ key: 'payment.completed' }, { key: 'payment.expired' }],
        graph: payment.graph(),
        settings: AI_SETTINGS,
      },
    },
    {
      template_key: 'ai_call_completed',
      name: 'AI agent: after a call',
      description: 'Sends the summary of a finished call to the AI agent.',
      category: 'ai',
      active: ai.callActive,
      definition: { triggers: [{ key: 'call.completed' }], graph: call.graph(), settings: AI_SETTINGS },
    },
  ];
}

// ── Follow-ups ─────────────────────────────────────────────────────────────

/** First touch: 2 hours after our last message; the next ones a day apart (business hours). */
export const FIRST_FOLLOW_UP_HOURS = 2;
export const FOLLOW_UP_TEXT = "Hi {{contact.full_name|there}}, we're following up to see if there's anything we can help you with. - {{organization.name}}";
const CHAT_CHANNELS = ['whatsapp', 'sms', 'webchat', 'facebook', 'instagram'];

type FollowUpTouch = { kind: 'message'; channel: NodeConfigMap['send_message']['channel_strategy'] } | { kind: 'call' };

/** The default no-response cadence: seven touches. */
export const FOLLOW_UP_TOUCHES: FollowUpTouch[] = [
  { kind: 'message', channel: 'auto' },
  { kind: 'message', channel: 'auto' },
  { kind: 'message', channel: 'auto' },
  { kind: 'call' },
  { kind: 'message', channel: 'email_only' },
  { kind: 'message', channel: 'auto' },
  { kind: 'message', channel: 'auto' },
];

/** The cadence as a chain of waits and touches. */
export function followUpGraph(touches: FollowUpTouch[] = FOLLOW_UP_TOUCHES): GraphBuilder {
  const g = new GraphBuilder();
  let previous = g.add('tag', 'add_tag', { tag: 'follow-up' }, 'Mark as in follow-up');
  touches.forEach((t, i) => {
    const n = i + 1;
    const hours = i === 0 ? FIRST_FOLLOW_UP_HOURS : 24;
    // Day-long waits land in business hours; shorter ones keep their exact time.
    const wait = g.add(`wait_${n}`, 'wait', { mode: 'duration', duration: { amount: hours, unit: 'hours' }, business_hours: hours >= 24 }, `Wait before touch ${n}`);
    g.link(previous, wait);
    const touch =
      t.kind === 'call'
        ? g.add(`touch_${n}`, 'call', { fallback_text: FOLLOW_UP_TEXT }, `Touch ${n}: call`)
        : g.add(`touch_${n}`, 'send_message', { recipients: RUN_CONTACT, channel_strategy: t.channel, text: FOLLOW_UP_TEXT }, `Touch ${n}: message`);
    g.link(wait, touch);
    previous = touch;
  });
  return g;
}

/**
 * The no-response follow-up: starts when the AI, a team member or an
 * integration writes to the contact on a chat channel, and ends as soon as
 * the contact replies or books — a later message starts it again.
 */
export function followUpTemplate(): SystemTemplate {
  return {
    template_key: 'no_response_follow_up',
    name: 'Follow-up when the contact stops replying',
    description: 'After we message a contact on a chat channel, follows up if they do not reply. Stops when they reply or book.',
    category: 'follow_up',
    active: true,
    definition: {
      triggers: [
        {
          key: 'message.sent',
          filters: {
            any: [
              {
                all: [
                  { field: 'trigger.sender_type', operator: 'in', value: ['ai', 'agent', 'api'] },
                  { field: 'trigger.channel', operator: 'in', value: CHAT_CHANNELS },
                ],
              },
            ],
          },
        },
      ],
      graph: followUpGraph().graph(),
      settings: settings({
        exit_on: [{ trigger: 'message.received' }, { trigger: 'appointment.created' }],
        respect_opt_out: true,
      }),
    },
  };
}

/** Available but off: tag contacts who write a stop word (organizations turn it on). */
export function optOutTemplate(): SystemTemplate {
  const g = new GraphBuilder();
  g.add('tag', 'add_tag', { tag: 'opt-out' }, 'Mark as opted out');
  return {
    template_key: 'opt_out_keywords',
    name: 'Opt-out when the contact writes a stop word',
    description: 'Tags the contact "opt-out" (no more marketing automations) when their message contains a stop word.',
    category: 'messaging',
    active: false,
    definition: {
      triggers: [{ key: 'message.received', filters: rule('trigger.content', 'matches_keywords', DEFAULT_OPT_OUT_KEYWORDS) }],
      graph: g.graph(),
      settings: settings({ respect_opt_out: false, allow_parallel_runs: true }),
    },
  };
}

export interface SystemSetup {
  ai: AiSetup;
}

export function systemTemplates(setup: SystemSetup): SystemTemplate[] {
  return [...aiTemplates(setup.ai), ...bookingTemplates(), followUpTemplate(), optOutTemplate()];
}
