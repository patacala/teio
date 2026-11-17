import type { Contact } from '@/services/contacts.service';

type LeadLike = Pick<Contact, 'phone' | 'channel_ids'>;

/**
 * Channels a lead can actually be reached on — must mirror
 * OutboundDispatchProcessor's per-channel identifier checks (apps/api), or
 * the UI would offer a channel the backend immediately fails to dispatch on.
 */
export function reachableChannels(lead: LeadLike): string[] {
  const channels: string[] = [];
  if (lead.phone) channels.push('sms');
  if (lead.channel_ids?.whatsapp) channels.push('whatsapp');
  if (lead.channel_ids?.instagram) channels.push('instagram');
  if (lead.channel_ids?.facebook) channels.push('facebook');
  return channels;
}
