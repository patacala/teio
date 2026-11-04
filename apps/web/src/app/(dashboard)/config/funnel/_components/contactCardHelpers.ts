import { DollarSign, Landmark, Calendar, MapPin, Car, Tag, type LucideIcon } from 'lucide-react';
import type { Contact } from '@/services/contacts.service';

/** Matches the >=70 "hot" threshold already used elsewhere (contact-profile-panel.tsx). */
export const HOT_THRESHOLD = 70;

export function isHot(contact: Contact): boolean {
  return (contact.lead_score ?? 0) >= HOT_THRESHOLD;
}

/** custom_fields keys the system/AI writes for its own bookkeeping — not worth showing as "captured data". */
const HIDDEN_KEYS = new Set(['source', 'demo_type', 'note', 'noted_at', 'urgency_level']);

/** Present, non-empty custom_fields entries worth rendering, in insertion order. */
export function visibleCustomFields(contact: Contact): [string, string][] {
  const fields = (contact.custom_fields ?? {}) as Record<string, unknown>;
  return Object.entries(fields)
    .filter(([key, value]) => !HIDDEN_KEYS.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [key, String(value)]);
}

const ICON_RULES: [RegExp, LucideIcon][] = [
  [/budget|presupuesto/i, DollarSign],
  [/financ/i, Landmark],
  [/timeline|plazo|fecha/i, Calendar],
  [/ubicaci|location|city|ciudad/i, MapPin],
  [/servicio|service|vehic|car|producto/i, Car],
];

/** Best-guess icon for a custom_fields key — falls back to a generic tag. */
export function fieldIcon(key: string): LucideIcon {
  return ICON_RULES.find(([pattern]) => pattern.test(key))?.[1] ?? Tag;
}

export function prettifyKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Uses the org's configured capture-field label when one exists, else prettifies the raw key. */
export function fieldLabel(key: string, labels?: Record<string, string>): string {
  return labels?.[key] ?? prettifyKey(key);
}

const SENTIMENT_LABELS: Record<string, string> = {
  positive: 'Positive',
  positivo: 'Positive',
  negative: 'Negative',
  negativo: 'Negative',
  neutral: 'Neutral',
  neutro: 'Neutral',
};

export function prettifySentiment(value?: string): string {
  if (!value) return '';
  return SENTIMENT_LABELS[value.trim().toLowerCase()] ?? value;
}

export function digitsOnly(phone?: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function waLink(phone?: string): string | null {
  const digits = digitsOnly(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

export function initialsOf(contact: Contact): string {
  return (
    [contact.first_name?.[0], contact.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'
  );
}

export interface RecommendedAction {
  channel: 'call' | 'whatsapp' | 'email';
  title: string;
  description: string;
}

/**
 * Deterministic, client-only suggestion — no AI call. Based on signals we
 * already have: temperature, recency of last activity, buying intent, and
 * which contact channels actually exist.
 */
export function recommendedAction(contact: Contact): RecommendedAction | null {
  if (!contact.phone && !contact.email) return null;

  const hot = isHot(contact);
  const minsSinceActivity = contact.last_activity
    ? Math.floor((Date.now() - new Date(contact.last_activity).getTime()) / 60000)
    : null;
  const intent = contact.ai_insights?.intent?.toLowerCase() ?? '';
  const buying = /comprar|buying|purchase/.test(intent);

  if (hot && contact.phone && minsSinceActivity !== null && minsSinceActivity < 60) {
    return {
      channel: 'call',
      title: 'Call now',
      description: `Replied ${relativeTime(contact.last_activity!)} and showed strong intent${buying ? ' to buy' : ' to book'}.`,
    };
  }
  if (contact.email) {
    return {
      channel: 'email',
      title: 'Send information',
      description: 'May need more details before booking.',
    };
  }
  return {
    channel: contact.phone ? 'call' : 'whatsapp',
    title: 'Follow up',
    description: 'Continue the conversation to move the process forward.',
  };
}
