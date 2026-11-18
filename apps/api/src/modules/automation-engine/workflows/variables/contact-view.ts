import type { ContactEntity } from '../../../client-management/contact.entity';

/**
 * A contact as conditions and templates see it (`contact.*`).
 *
 * `channels` is where the contact can be reached: every channel identifier
 * they have, plus sms/voice with a phone and email with an email address.
 * audience-sql.compiler.ts computes the same thing in SQL — keep both in step.
 */
export interface ContactView {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  tags: string[];
  stage: string | null;
  lead_score: number;
  handled_by: string | null;
  assigned_to: string | null;
  status: string | null;
  channels: string[];
  custom: Record<string, unknown>;
  created_at: string | null;
  last_contacted_at: string | null;
}

type ContactLike = Pick<ContactEntity, 'id'> &
  Partial<
    Pick<
      ContactEntity,
      | 'first_name'
      | 'last_name'
      | 'email'
      | 'phone'
      | 'tags'
      | 'lead_stage'
      | 'lead_score'
      | 'handled_by'
      | 'assigned_to'
      | 'status'
      | 'channel_ids'
      | 'custom_fields'
      | 'created_at'
      | 'last_contacted_at'
    >
  >;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function reachableChannels(contact: Pick<ContactLike, 'channel_ids' | 'phone' | 'email'>): string[] {
  const channels = new Set<string>();
  for (const [channel, id] of Object.entries(contact.channel_ids ?? {})) {
    if (id) channels.add(channel);
  }
  if (contact.phone) {
    channels.add('sms');
    channels.add('voice');
  }
  if (contact.email) channels.add('email');
  return [...channels].sort();
}

export function contactView(contact: ContactLike): ContactView {
  const first = contact.first_name ?? '';
  const last = contact.last_name ?? '';
  return {
    id: contact.id,
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(' '),
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    tags: contact.tags ?? [],
    stage: contact.lead_stage ?? null,
    lead_score: contact.lead_score ?? 0,
    handled_by: contact.handled_by ?? null,
    assigned_to: contact.assigned_to ?? null,
    status: contact.status ?? null,
    channels: reachableChannels(contact),
    custom: (contact.custom_fields as Record<string, unknown>) ?? {},
    created_at: iso(contact.created_at),
    last_contacted_at: iso(contact.last_contacted_at),
  };
}
