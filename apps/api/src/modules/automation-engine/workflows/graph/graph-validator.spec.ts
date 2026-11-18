import { validateAutomation } from './graph-validator';
import { chain, definition, edge, step } from '../../../../test-support/automation-fixtures';

const NOW = new Date('2026-03-20T12:00:00Z');
const inbound = [{ key: 'message.received' as const }];
const weekly = [{ key: 'schedule' as const, schedule: { frequency: 'weekly' as const, time: '09:00', days_of_week: [1] } }];
const msg = (key: string, text = 'Hi {{contact.first_name|there}}') => step(key, 'send_message', { text });
const messages = (def: Parameters<typeof validateAutomation>[0], ctx = {}) =>
  validateAutomation(def, { now: NOW, hasAiConnection: true, ...ctx }).issues.map((i) => (i.node_key ? `${i.node_key}: ${i.message}` : i.message));

describe('automation validation', () => {
  it('accepts a valid automation', () => {
    const def = definition(inbound, chain(msg('a'), step('w', 'wait'), step('ai', 'send_to_ai')));
    expect(messages(def)).toEqual([]);
  });

  it('needs a trigger and steps', () => {
    expect(messages(definition([], { nodes: [], edges: [] }))).toEqual([
      'Add a trigger: what starts this automation?',
      'Add at least one step',
    ]);
  });

  it('rejects loops, merges, orphans and bad paths', () => {
    const loop = definition(inbound, { nodes: [msg('a'), msg('b')], edges: [edge('a', 'b'), edge('b', 'a')] });
    expect(messages(loop)).toContain('The steps form a loop');

    const cond = step('c', 'condition', { condition: { any: [{ all: [{ field: 'contact.tags', operator: 'has_tag', value: 'vip' }] }] } });
    const merge = definition(inbound, { nodes: [cond, msg('y'), msg('n'), msg('end')], edges: [edge('c', 'y', 'yes'), edge('c', 'n', 'no'), edge('y', 'end'), edge('n', 'end')] });
    expect(messages(merge)).toContain('end: Two paths lead to this step (paths cannot merge)');

    const orphan = definition(inbound, { nodes: [msg('a'), msg('b')], edges: [] });
    expect(messages(orphan)).toContain('b: Every step must be connected to the flow');

    const badHandle = definition(inbound, { nodes: [msg('a'), msg('b'), msg('c')], edges: [edge('a', 'b', 'yes'), edge('a', 'c', 'yes')] });
    expect(messages(badHandle)).toEqual(expect.arrayContaining(['a: "Send message" has no "yes" path', 'a: The "yes" path of this step goes to two steps']));
  });

  it('allows an empty branch (that path simply ends)', () => {
    const cond = step('c', 'condition', { condition: { any: [{ all: [{ field: 'trigger.channel', operator: 'equals', value: 'whatsapp' }] }] } });
    expect(messages(definition(inbound, { nodes: [cond, msg('y')], edges: [edge('c', 'y', 'yes')] }))).toEqual([]);
  });

  it('validates schedules', () => {
    expect(messages(definition([{ key: 'schedule', schedule: { frequency: 'once', time: '09:00', date: '2026-01-01' } }], chain(step('n', 'notify_team', { title: 'x' }))))).toContain(
      'The date and time are in the past',
    );
    expect(messages(definition([{ key: 'schedule', schedule: { frequency: 'weekly', time: '09:00', days_of_week: [] } }], chain(step('n', 'notify_team', { title: 'x' }))))).toContain(
      'Pick at least one day of the week',
    );
    expect(messages(definition([...weekly, { key: 'manual' }], chain(step('n', 'notify_team', { title: 'x' }))))).toContain(
      'A scheduled automation cannot have other triggers',
    );
  });

  it('keeps contact steps out of scheduled (organization) automations', () => {
    const def = definition(weekly, chain(step('t', 'add_tag', { tag: 'x' }), msg('m')));
    expect(messages(def)).toEqual(
      expect.arrayContaining([
        't: "Add tag" needs a contact: it cannot be used in a scheduled automation',
        'm: A scheduled automation has no contact: choose who receives it',
        'm: {{contact.first_name}} is not available for this trigger',
      ]),
    );
  });

  it('personalises a scheduled message for each contact it is sent to', () => {
    const filter = { any: [{ all: [{ field: 'contact.tags', operator: 'has_tag' as const, value: 'vip' }] }] };
    const def = definition(weekly, chain(step('m', 'send_sms', { recipients: { mode: 'filter', filter }, text: 'Hi {{contact.first_name}}, news from {{organization.name}}' })));
    expect(messages(def)).toEqual([]);
  });

  it('rejects recipient filters the database cannot run, and empty ones', () => {
    const def = definition(weekly, chain(step('m', 'send_sms', { recipients: { mode: 'filter', filter: { any: [{ all: [{ field: 'trigger.channel', operator: 'equals', value: 'sms' }] }] } }, text: 'x' })));
    expect(messages(def)).toContain('m: "trigger.channel" cannot be used to choose recipients');
    const empty = definition(weekly, chain(step('m', 'send_sms', { recipients: { mode: 'filter', filter: { any: [] } }, text: 'x' })));
    expect(messages(empty)).toContain('m: Add a condition to choose the contacts (or pick "everyone" explicitly)');
  });

  it('checks variables and condition fields against the triggers', () => {
    const def = definition(
      [{ key: 'contact.created' }],
      chain(
        msg('m', 'Your appointment {{appointment.date}} — {{contact.custom.budget}} {{trigger.source}} {{bogus}}'),
        step('c', 'condition', { condition: { any: [{ all: [{ field: 'trigger.channel', operator: 'equals', value: 'x' }, { field: 'conversation.ai_active', operator: 'is_true' }] }] } }),
      ),
    );
    expect(messages(def)).toEqual([
      'm: {{appointment.date}} is not available for this trigger',
      'm: {{bogus}} is not available for this trigger',
      'c: "conversation.ai_active" cannot be used here',
    ]);
  });

  it('needs a conversation to turn the AI on/off, and an appointment for invites', () => {
    const ai = definition([{ key: 'contact.tag_added' }], chain(step('s', 'set_ai', { active: false })));
    expect(messages(ai)).toEqual(['s: "Turn AI on/off" needs a conversation: use a message, conversation, payment or call trigger']);

    const invite = definition(inbound, chain(step('e', 'send_email', { email: { subject: 'x', heading: 'x', paragraphs: ['x'] }, calendar_invite: 'request' })));
    expect(messages(invite)).toEqual(['e: A calendar invite needs an appointment trigger']);

    const ok = definition([{ key: 'appointment.confirmed' }], chain(step('e', 'send_email', { email: { subject: '{{appointment.title}}', heading: 'x', paragraphs: ['x'] }, calendar_invite: 'request' })));
    expect(messages(ok)).toEqual([]);
  });

  it('checks organization data: AI connection, stages, users', () => {
    const def = definition(
      inbound,
      chain(step('ai', 'send_to_ai'), step('s', 'move_stage', { stage_id: 'gone' }), step('n', 'notify_team', { title: 'x', in_app: false, email_to: { user_ids: ['u-gone'] } })),
    );
    expect(messages(def, { hasAiConnection: false, stageIds: new Set(['stage-1']), userIds: new Set(['u-1']) })).toEqual([
      'ai: Connect an AI agent first (Settings → AI Agent)',
      's: This stage no longer exists',
      'n: A selected team member no longer exists',
    ]);
  });

  it('checks required step settings', () => {
    const def = definition(inbound, {
      nodes: [
        step('m', 'send_message', { text: '  ' }),
        step('w', 'wait', { mode: 'duration', duration: { amount: 0, unit: 'days' } }),
        step('f', 'wait_for_event', { events: ['schedule' as never], timeout: { amount: 0, unit: 'days' } }),
        step('c', 'condition', { condition: { any: [{ all: [] }] } }),
        step('t', 'add_tag', { tag: '' }),
        step('u', 'update_contact', { fields: [{ field: 'lead_stage', value: 'x' }] }),
      ],
      edges: [edge('m', 'w'), edge('w', 'f'), edge('f', 'c', 'matched'), edge('c', 't', 'yes'), edge('t', 'u')],
    });
    expect(messages(def)).toEqual([
      'm: Message text is required',
      'w: Set how long to wait',
      'f: Cannot wait for "schedule"',
      'f: Set how long to wait before giving up',
      'c: Add at least one condition',
      't: Tag is required',
      'u: Choose a contact field',
    ]);
  });

  it('validates exit rules and trigger filters', () => {
    const def = definition(
      [{ key: 'message.sent', filters: { any: [{ all: [{ field: 'trigger.sender_type', operator: 'in', value: ['ai', 'agent'] }] }] } }],
      chain(msg('m')),
      { exit_on: [{ trigger: 'message.received' }, { trigger: 'nope' as never }] },
    );
    expect(messages(def)).toEqual(['Unknown exit event "nope"']);
  });
});
