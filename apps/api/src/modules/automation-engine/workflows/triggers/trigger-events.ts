import type { EventTriggerKey } from '@crm/shared';
import { RABBITMQ_QUEUES } from '../../../../infrastructure/rabbitmq/rabbitmq.constants';

/**
 * A published domain event, as automations see it: which trigger it is, who
 * it is about, and its `trigger.*` data. `raw` keeps the original payload
 * (without routing fields) — the "Send to AI agent" step forwards it as is.
 */
export interface TriggerEvent {
  key: EventTriggerKey;
  organizationId: string;
  contactId: string | null;
  conversationId: string | null;
  eventId: string | null;
  data: Record<string, unknown>;
  raw: Record<string, unknown>;
}

type Payload = Record<string, unknown>;
type Normalizer = (p: Payload) => Array<Omit<TriggerEvent, 'organizationId' | 'eventId' | 'raw'>>;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function pick(p: Payload, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

const APPOINTMENT_KEYS = [
  'appointment_id',
  'calendar_id',
  'title',
  'status',
  'origin',
  'starts_at',
  'ends_at',
  'timezone',
  'location',
  'meeting_url',
  'description',
  'created_by',
  'sequence',
  'cancel_reason',
  'payment_id',
  'confirm_url',
  'confirm_url_sms',
  'manage_url',
  'manage_url_sms',
  'reminder',
  'rescheduled',
  'reminder_id',
  'offset_minutes',
];

function appointment(key: EventTriggerKey): Normalizer {
  return (p) => {
    const data = pick(p, APPOINTMENT_KEYS);
    // The reminder asks to confirm only when both confirm links came with it.
    if (key === 'appointment.reminder_due') data.needs_confirmation = !!str(p.confirm_url) && !!str(p.confirm_url_sms);
    if (key === 'appointment.confirmation_requested') {
      data.reminder = !!p.reminder;
      data.rescheduled = !!p.rescheduled;
    }
    return [{ key, contactId: str(p.contact_id), conversationId: str(p.conversation_id), data }];
  };
}

const NORMALIZERS: Record<string, Normalizer> = {
  [RABBITMQ_QUEUES.MESSAGE_RECEIVED]: (p) => {
    const message = (p.message ?? {}) as Payload;
    if (message.direction !== 'inbound') return [];
    return [
      {
        key: 'message.received',
        contactId: str(p.contact_id),
        conversationId: str(p.conversation_id),
        data: { channel: p.channel, content: message.content ?? '', message_id: message.id ?? null },
      },
    ];
  },
  [RABBITMQ_QUEUES.MESSAGE_SEND]: (p) => {
    if ((p.direction ?? 'outbound') !== 'outbound') return [];
    return [
      {
        key: 'message.sent',
        contactId: str(p.contact_id),
        conversationId: str(p.conversation_id),
        data: {
          channel: p.channel,
          content: p.content ?? '',
          sender_type: p.sender_type ?? 'agent',
          message_id: p.message_id ?? null,
          automation_run_id: p.automation_run_id ?? null,
        },
      },
    ];
  },
  [RABBITMQ_QUEUES.CONVERSATION_OPENED]: (p) => [
    {
      key: 'conversation.opened',
      contactId: str(p.contact_id),
      conversationId: str(p.conversation_id),
      data: { channel: p.channel, opened_by: p.opened_by ?? 'business' },
    },
  ],
  [RABBITMQ_QUEUES.CONVERSATION_CLOSED]: (p) => [
    { key: 'conversation.closed', contactId: str(p.contact_id), conversationId: str(p.conversation_id), data: { channel: p.channel } },
  ],
  [RABBITMQ_QUEUES.CONTACT_CREATED]: (p) => [
    {
      key: 'contact.created',
      contactId: str(p.contact_id),
      conversationId: null,
      data: { source: p.source ?? 'manual', channel: p.channel ?? null },
    },
  ],
  [RABBITMQ_QUEUES.CONTACT_TAG_ADDED]: (p) => [
    { key: 'contact.tag_added', contactId: str(p.contact_id), conversationId: null, data: { tag: p.tag, source: p.source ?? null } },
  ],
  [RABBITMQ_QUEUES.CONTACT_TAG_REMOVED]: (p) => [
    { key: 'contact.tag_removed', contactId: str(p.contact_id), conversationId: null, data: { tag: p.tag, source: p.source ?? null } },
  ],
  [RABBITMQ_QUEUES.CONTACT_STAGE_CHANGED]: (p) => [
    {
      key: 'contact.stage_changed',
      contactId: str(p.contact_id),
      conversationId: null,
      data: { from_stage_id: p.from_stage_id ?? null, to_stage_id: p.to_stage_id ?? null },
    },
  ],
  [RABBITMQ_QUEUES.APPOINTMENT_CREATED]: appointment('appointment.created'),
  [RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED]: appointment('appointment.confirmed'),
  [RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED]: appointment('appointment.rescheduled'),
  [RABBITMQ_QUEUES.APPOINTMENT_CANCELLED]: appointment('appointment.cancelled'),
  [RABBITMQ_QUEUES.APPOINTMENT_COMPLETED]: appointment('appointment.completed'),
  [RABBITMQ_QUEUES.APPOINTMENT_NO_SHOW]: appointment('appointment.no_show'),
  [RABBITMQ_QUEUES.APPOINTMENT_CONFIRMATION_REQUESTED]: appointment('appointment.confirmation_requested'),
  [RABBITMQ_QUEUES.APPOINTMENT_REMINDER_DUE]: appointment('appointment.reminder_due'),
  [RABBITMQ_QUEUES.PAYMENT_COMPLETED]: (p) => [
    {
      key: 'payment.completed',
      contactId: str(p.contact_id),
      conversationId: str(p.conversation_id),
      data: pick(p, [
        'payment_id', 'service_id', 'service_name', 'amount', 'currency', 'appointment_id',
        'appointment_confirmed', 'needs_attention', 'message', 'payment_status',
      ]),
    },
  ],
  // Expired and failed checkouts share one topic; payment_status tells them apart.
  [RABBITMQ_QUEUES.PAYMENT_EXPIRED]: (p) => [
    {
      key: p.payment_status === 'failed' ? 'payment.failed' : 'payment.expired',
      contactId: str(p.contact_id),
      conversationId: str(p.conversation_id),
      data: pick(p, ['payment_id', 'service_id', 'service_name', 'amount', 'currency', 'appointment_id', 'message', 'payment_status']),
    },
  ],
  [RABBITMQ_QUEUES.CALL_COMPLETED]: (p) => {
    const call = (p.call ?? {}) as Payload;
    return [
      {
        key: 'call.completed',
        contactId: str(p.contact_id),
        conversationId: str(p.conversation_id),
        data: {
          call_id: call.id ?? null,
          duration_seconds: call.duration_seconds ?? null,
          summary: call.summary ?? null,
          phone_from: call.phone_from ?? null,
          phone_to: call.phone_to ?? null,
        },
      },
    ];
  },
};

/** Topics automations listen to. */
export const TRIGGER_TOPICS = Object.keys(NORMALIZERS);

/** The trigger events a published payload stands for (none when it is not about a contact). */
export function normalizeEvent(topic: string, payload: Payload): TriggerEvent[] {
  const normalize = NORMALIZERS[topic];
  const organizationId = str(payload?.organization_id);
  if (!normalize || !organizationId) return [];
  const { organization_id: _org, event_id, ...raw } = payload;
  return normalize(payload)
    .filter((e) => !!e.contactId)
    .map((e) => ({ ...e, organizationId, eventId: str(event_id), raw }));
}
