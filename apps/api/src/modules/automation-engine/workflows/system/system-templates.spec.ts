import { validateAutomation } from '../graph/graph-validator';
import { followUpGraph, systemTemplates } from './system-templates';

const setups = [
  { ai: { incomingActive: true, incomingAgentId: 'ag-1', paymentActive: true, paymentAgentId: 'ag-1', callActive: false, callAgentId: 'ag-1' } },
  { ai: { incomingActive: false, incomingAgentId: null, paymentActive: false, paymentAgentId: null, callActive: false, callAgentId: null } },
];

describe('system automation templates', () => {
  it.each(setups.map((s, i) => [i, s]))('are all valid (setup %i)', (_i, setup) => {
    for (const template of systemTemplates(setup)) {
      const result = validateAutomation(template.definition, { now: new Date('2026-03-20T12:00:00Z') });
      expect({ key: template.template_key, issues: result.issues }).toEqual({ key: template.template_key, issues: [] });
    }
  });

  it('have unique keys and follow the organization setup', () => {
    const templates = systemTemplates(setups[0]);
    expect(new Set(templates.map((t) => t.template_key)).size).toBe(templates.length);
    expect(Object.fromEntries(templates.map((t) => [t.template_key, t.active]))).toEqual({
      ai_incoming_message: true,
      ai_payment_update: true,
      ai_call_completed: false,
      booking_confirmation_request: true,
      booking_confirmed: true,
      booking_rescheduled: true,
      booking_cancelled: true,
      booking_reminder: true,
      no_response_follow_up: true,
      opt_out_keywords: false,
    });
  });

  it('builds the follow-up cadence as waits and touches (2h first, then a day apart)', () => {
    const g = followUpGraph();
    const chain = g.nodes.map((n) => (n.type === 'wait' ? `wait ${(n.config as { duration: { amount: number } }).duration.amount}h` : n.type));
    expect(chain).toEqual([
      'add_tag',
      'wait 2h', 'send_message', 'wait 24h', 'send_message', 'wait 24h', 'send_message',
      'wait 24h', 'call', 'wait 24h', 'send_message', 'wait 24h', 'send_message', 'wait 24h', 'send_message',
    ]);
    const touch5 = g.nodes.find((n) => n.key === 'touch_5')!;
    expect(touch5.config).toMatchObject({ channel_strategy: 'email_only' });
  });
});
