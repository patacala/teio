export interface EventGroup {
  label: string;
  events: string[];
}

export function formatEventLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function groupEvents(eventTypes: string[]): EventGroup[] {
  const groups: Record<string, EventGroup> = {
    appointment: { label: 'Appointments', events: [] },
    contact: { label: 'Contacts', events: [] },
    messaging: { label: 'Messages and conversations', events: [] },
    voice: { label: 'Calls', events: [] },
    billing: { label: 'Billing', events: [] },
    platform: { label: 'Platform', events: [] },
    other: { label: 'Other', events: [] },
  };

  for (const et of eventTypes) {
    if (et.startsWith('appointment_')) groups.appointment.events.push(et);
    else if (et.startsWith('contact_')) groups.contact.events.push(et);
    else if (et.startsWith('message_') || et.startsWith('conversation_')) groups.messaging.events.push(et);
    else if (et.startsWith('voice_')) groups.voice.events.push(et);
    else if (et.startsWith('payment_') || et.startsWith('subscription_')) groups.billing.events.push(et);
    else if (['welcome', 'password_reset', 'team_member_invited', 'demo_ready', 'custom'].includes(et)) groups.platform.events.push(et);
    else groups.other.events.push(et);
  }

  return Object.values(groups).filter((g) => g.events.length > 0);
}
