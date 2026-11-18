import { TRIGGER_CATALOG } from '@crm/shared';
import { TRIGGER_TOPICS, normalizeEvent } from './trigger-events';
import { readGolden } from '../../../../test-support/golden';
import type { AiJobRecord } from '../../../../test-support/ai-job-scenarios';

describe('trigger events', () => {
  it('every event trigger in the catalog has a normalizer for its topic', () => {
    const missing = TRIGGER_CATALOG.filter((t) => t.topic && !TRIGGER_TOPICS.includes(t.topic)).map((t) => t.key);
    expect(missing).toEqual([]);
  });

  it('only inbound messages are "message received", only outbound ones "message sent"', () => {
    const base = { organization_id: 'org', contact_id: 'c1', conversation_id: 'cv', channel: 'whatsapp' };
    expect(normalizeEvent('message.received', { ...base, message: { direction: 'inbound', content: 'hola', id: 'm1' } })).toEqual([
      expect.objectContaining({ key: 'message.received', contactId: 'c1', conversationId: 'cv', data: { channel: 'whatsapp', content: 'hola', message_id: 'm1' } }),
    ]);
    expect(normalizeEvent('message.received', { ...base, message: { direction: 'outbound', content: 'x' } })).toEqual([]);
    expect(normalizeEvent('message.send', { ...base, direction: 'inbound' })).toEqual([]);
    expect(normalizeEvent('message.send', { ...base, direction: 'outbound', content: 'hi', sender_type: 'ai' })[0]).toMatchObject({
      key: 'message.sent',
      data: { sender_type: 'ai', content: 'hi' },
    });
  });

  it('splits expired and failed payments, and keeps the raw payload for the AI', () => {
    const payload = { organization_id: 'org', event_id: 'e1', contact_id: 'c1', conversation_id: 'cv', payment_id: 'p1', message: 'expired', payment_status: 'expired' };
    const [expired] = normalizeEvent('payment.expired', payload);
    expect(expired).toMatchObject({ key: 'payment.expired', eventId: 'e1', organizationId: 'org' });
    expect(expired.raw).toEqual({ contact_id: 'c1', conversation_id: 'cv', payment_id: 'p1', message: 'expired', payment_status: 'expired' });
    expect(normalizeEvent('payment.expired', { ...payload, payment_status: 'failed' })[0].key).toBe('payment.failed');
  });

  it('flags reminders still awaiting confirmation', () => {
    const reminder = { organization_id: 'org', contact_id: 'c1', appointment_id: 'a1', offset_minutes: 120, confirm_url: 'https://x', confirm_url_sms: 'https://x/s' };
    expect(normalizeEvent('appointment.reminder.due', reminder)[0].data).toMatchObject({ needs_confirmation: true, offset_minutes: 120 });
    expect(normalizeEvent('appointment.reminder.due', { ...reminder, confirm_url: null })[0].data.needs_confirmation).toBe(false);
  });

  it('ignores events that are not about a contact, or without an organization', () => {
    expect(normalizeEvent('call.completed', { organization_id: 'org', contact_id: null, call: { id: 'x' } })).toEqual([]);
    expect(normalizeEvent('contact.created', { contact_id: 'c1' })).toEqual([]);
    expect(normalizeEvent('unknown.topic', { organization_id: 'org', contact_id: 'c1' })).toEqual([]);
  });

  it('normalizes every event the legacy AI sources published (golden file)', () => {
    const golden = readGolden<Record<string, AiJobRecord>>('ai-agent-jobs');
    for (const record of Object.values(golden)) {
      for (const event of record.events) {
        const normalized = normalizeEvent(event.topic, event.data);
        const inboundEcho = event.topic === 'message.received' && (event.data.message as { direction?: string }).direction !== 'inbound';
        expect(normalized).toHaveLength(inboundEcho ? 0 : 1);
      }
    }
  });
});
