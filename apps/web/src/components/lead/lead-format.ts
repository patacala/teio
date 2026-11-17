import type { Contact } from '@/services/contacts.service';
import { getInitials } from '@/lib/utils';

type LeadLike = Pick<Contact, 'first_name' | 'last_name' | 'email' | 'phone'>;

export function leadFullName(lead: LeadLike): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
}

/** Name when there is one, otherwise the best identifier we have. */
export function leadDisplayName(lead: LeadLike): string {
  return leadFullName(lead) || lead.email || lead.phone || 'Unnamed lead';
}

export function leadInitials(lead: LeadLike): string {
  return getInitials(leadDisplayName(lead));
}
