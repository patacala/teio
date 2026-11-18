import type { ContactEntity } from '../../../client-management/contact.entity';
import { formatAmount, formatDateLong, formatTimeShort } from '../../../../infrastructure/messaging/format';
import { contactView } from './contact-view';

/**
 * Everything a step's conditions and `{{variables}}` can read:
 *   contact.*, organization.*, conversation.*, trigger.* (the event's fields),
 *   and per event kind message.*, appointment.*, payment.*, call.*.
 * Flat `user_name` / `organization_name` are kept for platform templates.
 */
export type RunVars = Record<string, unknown>;

/** Used only when the organization row cannot be read (platform emails did the same). */
export const DEFAULT_ORGANIZATION_NAME = 'Our team';

export interface RunVarsInput {
  organization: { id: string; name?: string | null } | null;
  contact: Parameters<typeof contactView>[0] | ContactEntity | null;
  conversation: { id: string; channel: string; status?: string | null; bot_active?: boolean | null } | null;
  triggerKey: string;
  triggerData: Record<string, unknown>;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

function appointmentVars(d: Record<string, unknown>): Record<string, unknown> {
  const tz = text(d.timezone) || 'UTC';
  const startsAt = text(d.starts_at);
  const endsAt = text(d.ends_at);
  return {
    title: text(d.title),
    date: startsAt ? formatDateLong(startsAt, tz) : '',
    time: startsAt ? formatTimeShort(startsAt, tz) : '',
    end_time: endsAt ? formatTimeShort(endsAt, tz) : '',
    timezone: tz,
    location: text(d.location),
    meeting_url: text(d.meeting_url),
    confirm_url: text(d.confirm_url),
    confirm_url_sms: text(d.confirm_url_sms),
    manage_url: text(d.manage_url),
    manage_url_sms: text(d.manage_url_sms),
    status: text(d.status),
    description: text(d.description),
    starts_at: startsAt,
    ends_at: endsAt,
    id: text(d.appointment_id),
  };
}

export function buildRunVars(input: RunVarsInput): RunVars {
  const contact = input.contact ? contactView(input.contact as Parameters<typeof contactView>[0]) : null;
  const organizationName = input.organization?.name || DEFAULT_ORGANIZATION_NAME;
  const d = input.triggerData ?? {};
  const key = input.triggerKey;

  const scope: RunVars = {
    contact,
    organization: { id: input.organization?.id ?? null, name: organizationName },
    conversation: input.conversation
      ? {
          id: input.conversation.id,
          channel: input.conversation.channel,
          status: input.conversation.status ?? null,
          ai_active: input.conversation.bot_active !== false,
        }
      : null,
    trigger: d,
    user_name: contact?.full_name ?? '',
    organization_name: organizationName,
  };

  if (key.startsWith('message.')) scope.message = { content: text(d.content), channel: text(d.channel) };
  if (key.startsWith('appointment.')) scope.appointment = appointmentVars(d);
  if (key.startsWith('payment.')) {
    scope.payment = {
      id: text(d.payment_id),
      amount: formatAmount(d.amount as number, d.currency as string),
      currency: text(d.currency).toUpperCase(),
      service_name: text(d.service_name),
      message: text(d.message),
    };
  }
  if (key === 'call.completed') scope.call = { summary: text(d.summary), duration_seconds: text(d.duration_seconds) };
  return scope;
}

/** The same scope, about another contact (a recipient of a per-contact message). */
export function withContact(scope: RunVars, contact: Parameters<typeof contactView>[0]): RunVars {
  const view = contactView(contact);
  return { ...scope, contact: view, user_name: view.full_name };
}
