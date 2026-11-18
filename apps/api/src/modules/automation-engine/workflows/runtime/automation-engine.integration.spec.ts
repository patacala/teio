/**
 * The automation engine end to end on a real PostgreSQL:
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @crm/api test automation-engine.integration
 * Skipped when TEST_DATABASE_URL is not set.
 */
import { randomUUID } from 'crypto';
import type { ConditionGroup } from '@crm/shared';
import { createAutomationHarness, type AutomationHarness } from '../../../../test-support/automation-harness';
import { chain, definition, edge, step } from '../../../../test-support/automation-fixtures';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
jest.setTimeout(120_000);

const hasTag = (tag: string): ConditionGroup => ({ any: [{ all: [{ field: 'contact.tags', operator: 'has_tag', value: tag }] }] });

describeDb('automation engine (PostgreSQL)', () => {
  let h: AutomationHarness;

  beforeAll(async () => {
    h = await createAutomationHarness(url!);
  });
  afterAll(async () => {
    await h?.close();
  });
  beforeEach(async () => {
    for (const list of Object.values(h.captured)) list.length = 0;
    h.chatChannel.value = 'whatsapp';
    h.failChat.times = 0;
    // Each test starts with no active automations from earlier tests.
    await h.ds.query(`UPDATE automation.automation_triggers SET is_active = false WHERE organization_id = $1`, [h.org]);
    await h.ds.query(`UPDATE automation.automation_schedules SET is_active = false WHERE organization_id = $1`, [h.org]);
  });

  const inbound = (contact: string, conversation: string | null, content = 'hola') =>
    h.emit('message.received', {
      contact_id: contact,
      conversation_id: conversation,
      channel: 'whatsapp',
      message: { id: randomUUID(), content, direction: 'inbound' },
    });
  const outbound = (contact: string, conversation: string, sender_type: string, automation_run_id: string | null = null) =>
    h.emit('message.send', {
      contact_id: contact,
      conversation_id: conversation,
      channel: 'whatsapp',
      direction: 'outbound',
      content: 'x',
      sender_type,
      automation_run_id,
    });

  it('an incoming message starts an automation that replies', async () => {
    const contact = await h.createContact();
    const conversation = await h.createConversation(contact);
    const automation = await h.publish(definition([{ key: 'message.received' }], chain(step('reply', 'send_message', { text: 'Hi {{contact.first_name}}!' }))));
    await inbound(contact, conversation);
    await h.drain();
    expect(h.captured.chat).toEqual([expect.objectContaining({ contact_id: contact, channel: 'whatsapp', content: 'Hi Ana!' })]);
    expect(h.captured.chat[0].metadata).toMatchObject({ automation_id: automation.id });
    const [run] = await h.runs(automation.id);
    expect(run).toMatchObject({ status: 'completed', contact_id: contact, conversation_id: conversation, trigger_key: 'message.received' });
    expect(await h.steps(run.id as string)).toEqual([
      expect.objectContaining({ step_no: 1, node_key: 'reply', status: 'completed', branch: 'next', output: expect.objectContaining({ sent: 1 }) }),
    ]);
  });

  it('branches on conditions', async () => {
    const vip = await h.createContact({ tags: ['vip'] });
    const regular = await h.createContact({ first_name: 'Luis' });
    const cond = step('c', 'condition', { condition: hasTag('VIP') });
    const automation = await h.publish(
      definition([{ key: 'contact.created' }], {
        nodes: [cond, step('yes', 'send_sms', { text: 'VIP welcome' }), step('no', 'send_sms', { text: 'Welcome' })],
        edges: [edge('c', 'yes', 'yes'), edge('c', 'no', 'no')],
      }),
    );
    await h.emit('contact.created', { contact_id: vip, source: 'manual' });
    await h.emit('contact.created', { contact_id: regular, source: 'manual' });
    await h.drain();
    expect(h.captured.sms.map((s) => s.text).sort()).toEqual(['VIP welcome', 'Welcome']);
    const runs = await h.runs(automation.id);
    const branches = await Promise.all(runs.map(async (r) => (await h.steps(r.id as string))[0].branch));
    expect(branches.sort()).toEqual(['no', 'yes']);
  });

  it('waits, then continues when the wait is over', async () => {
    const contact = await h.createContact();
    const automation = await h.publish(
      definition([{ key: 'contact.created' }], chain(step('w', 'wait', { mode: 'duration', duration: { amount: 2, unit: 'hours' } }), step('s', 'send_sms', { text: 'Two hours later' }))),
    );
    await h.emit('contact.created', { contact_id: contact });
    await h.drain();
    let [run] = await h.runs(automation.id);
    expect(run.status).toBe('waiting');
    const wait = new Date(run.resume_at as string).getTime() - Date.now();
    expect(wait).toBeGreaterThan(2 * 3_600_000 - 60_000);
    expect(h.captured.sms).toEqual([]);

    await h.fastForward(run.id as string);
    [run] = await h.runs(automation.id);
    expect(run.status).toBe('completed');
    expect(h.captured.sms.map((s) => s.text)).toEqual(['Two hours later']);
    expect((await h.steps(run.id as string)).map((s) => [s.node_key, s.status, s.branch])).toEqual([
      ['w', 'completed', 'next'],
      ['s', 'completed', 'next'],
    ]);
  });

  it('waits for an event: continues on "matched" when it happens, on "timeout" otherwise', async () => {
    const replied = await h.createContact();
    const silent = await h.createContact({ first_name: 'Luis' });
    const convReplied = await h.createConversation(replied);
    const automation = await h.publish(
      definition([{ key: 'contact.created' }], {
        nodes: [
          step('ask', 'send_sms', { text: 'Can we help?' }),
          step('wait', 'wait_for_event', { events: ['message.received'], timeout: { amount: 1, unit: 'days' } }),
          step('thanks', 'send_sms', { text: 'Thanks for replying' }),
          step('nudge', 'send_sms', { text: 'Still there?' }),
        ],
        edges: [edge('ask', 'wait'), edge('wait', 'thanks', 'matched'), edge('wait', 'nudge', 'timeout')],
      }),
    );
    await h.emit('contact.created', { contact_id: replied });
    await h.emit('contact.created', { contact_id: silent });
    await h.drain();
    const runs = await h.runs(automation.id);
    expect(runs.map((r) => r.status)).toEqual(['waiting', 'waiting']);

    await inbound(replied, convReplied, 'yes please');
    await h.drain();
    const silentRun = runs.find((r) => r.contact_id === silent)!;
    await h.fastForward(silentRun.id as string);

    expect(h.captured.sms.map((s) => s.text)).toEqual(['Can we help?', 'Can we help?', 'Thanks for replying', 'Still there?']);
    const repliedSteps = await h.steps(runs.find((r) => r.contact_id === replied)!.id as string);
    expect(repliedSteps[1]).toMatchObject({ node_key: 'wait', status: 'completed', branch: 'matched', output: expect.objectContaining({ resumed_by: 'message.received' }) });
    const silentSteps = await h.steps(silentRun.id as string);
    expect(silentSteps[1]).toMatchObject({ node_key: 'wait', branch: 'timeout' });
  });

  it('exits a run when an exit event happens, and the contact can enter again later', async () => {
    const contact = await h.createContact();
    const conversation = await h.createConversation(contact);
    const automation = await h.publish(
      definition(
        [{ key: 'message.sent', filters: { any: [{ all: [{ field: 'trigger.sender_type', operator: 'in', value: ['ai', 'agent'] }] }] } }],
        chain(step('w', 'wait', { mode: 'duration', duration: { amount: 1, unit: 'days' } }), step('f', 'send_message', { text: 'Following up' })),
        { exit_on: [{ trigger: 'message.received' }] },
      ),
    );
    await outbound(contact, conversation, 'ai');
    await h.drain();
    let runs = await h.runs(automation.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('waiting');

    await inbound(contact, conversation); // the contact replied: the follow-up stops
    runs = await h.runs(automation.id);
    expect(runs[0]).toMatchObject({ status: 'exited', exit_reason: 'Exited: message.received' });

    await outbound(contact, conversation, 'agent'); // a new outbound message arms it again
    await h.drain();
    runs = await h.runs(automation.id);
    expect(runs.map((r) => r.status)).toEqual(['exited', 'waiting']);
    expect(h.captured.chat).toEqual([]);
  });

  it("never restarts an automation with its own messages, and ignores other automations' messages unless asked", async () => {
    const contact = await h.createContact();
    const conversation = await h.createConversation(contact);
    const automation = await h.publish(definition([{ key: 'message.sent' }], chain(step('f', 'send_message', { text: 'Auto reply' }))));
    await outbound(contact, conversation, 'agent');
    await h.drain();
    const [run] = await h.runs(automation.id);
    expect(h.captured.chat).toHaveLength(1);

    // The automation's own message comes back as message.sent
    await outbound(contact, conversation, 'automation', run.id as string);
    await h.drain();
    expect(await h.runs(automation.id)).toHaveLength(1);

    // A message from another automation does not start it either (no sender filter)
    await outbound(contact, conversation, 'automation', randomUUID());
    await h.drain();
    expect(await h.runs(automation.id)).toHaveLength(1);
  });

  it('keeps one active run per contact, and "never" re-entry blocks a second pass', async () => {
    const contact = await h.createContact();
    const waiting = await h.publish(definition([{ key: 'contact.tag_added' }], chain(step('w', 'wait', { mode: 'duration', duration: { amount: 1, unit: 'days' } }))));
    await h.emit('contact.tag.added', { contact_id: contact, tag: 'a' });
    await h.emit('contact.tag.added', { contact_id: contact, tag: 'b' });
    await h.drain();
    expect(await h.runs(waiting.id)).toHaveLength(1);

    const once = await h.publish(definition([{ key: 'contact.tag_added' }], chain(step('s', 'send_sms', { text: 'once' })), { reentry: 'never' }));
    await h.emit('contact.tag.added', { contact_id: contact, tag: 'c' });
    await h.drain();
    await h.emit('contact.tag.added', { contact_id: contact, tag: 'd' });
    await h.drain();
    expect((await h.runs(once.id)).map((r) => r.status)).toEqual(['completed']);
    expect(h.captured.sms.map((s) => s.text)).toEqual(['once']);
  });

  it('handles a redelivered event once', async () => {
    const contact = await h.createContact();
    const automation = await h.publish(definition([{ key: 'contact.created' }], chain(step('s', 'send_sms', { text: 'hi' }))));
    const payload = { organization_id: h.org, event_id: randomUUID(), contact_id: contact };
    await h.consumer.handle('contact.created', payload);
    await h.consumer.handle('contact.created', payload);
    await h.drain();
    expect(await h.runs(automation.id)).toHaveLength(1);
    expect(h.captured.sms).toHaveLength(1);
  });

  it('skips opted-out contacts unless the automation says otherwise', async () => {
    const contact = await h.createContact({ tags: ['opt-out'] });
    const marketing = await h.publish(definition([{ key: 'contact.created' }], chain(step('s', 'send_sms', { text: 'promo' }))));
    const transactional = await h.publish(
      definition([{ key: 'contact.created' }], chain(step('s', 'send_sms', { text: 'your booking' })), { respect_opt_out: false }),
    );
    await h.emit('contact.created', { contact_id: contact });
    await h.drain();
    expect(await h.runs(marketing.id)).toHaveLength(0);
    expect(await h.runs(transactional.id)).toHaveLength(1);
    expect(h.captured.sms.map((s) => s.text)).toEqual(['your booking']);
  });

  it('retries a failed send later without sending twice', async () => {
    const contact = await h.createContact();
    const automation = await h.publish(definition([{ key: 'contact.created' }], chain(step('m', 'send_message', { text: 'Hello' }), step('s', 'send_sms', { text: 'after' }))));
    h.failChat.times = 1;
    await h.emit('contact.created', { contact_id: contact });
    await h.drain();
    let [run] = await h.runs(automation.id);
    expect(run).toMatchObject({ status: 'waiting', attempts: 1, last_error: 'provider down', current_node_key: 'm' });
    expect(h.captured.chat).toHaveLength(0);

    await h.fastForward(run.id as string);
    [run] = await h.runs(automation.id);
    expect(run.status).toBe('completed');
    expect(h.captured.chat.map((c) => c.content)).toEqual(['Hello']);
    const steps = await h.steps(run.id as string);
    expect(steps.map((s) => [s.node_key, s.status])).toEqual([
      ['m', 'completed'],
      ['s', 'completed'],
    ]);
    const [delivery] = (await h.ds.query(
      `SELECT d.status, COUNT(*)::int AS n FROM automation.automation_deliveries d JOIN automation.automation_run_steps s ON s.id = d.run_step_id
        WHERE s.run_id = $1 AND s.node_key = 'm' GROUP BY d.status`,
      [run.id],
    )) as Array<{ status: string; n: number }>;
    expect(delivery).toEqual({ status: 'sent', n: 1 });
  });

  it('takes the "failed" path when a step cannot succeed, or fails the run without one', async () => {
    const contact = await h.createContact();
    h.chatChannel.value = null; // the contact cannot be messaged
    const withFallback = await h.publish(
      definition([{ key: 'contact.created' }], {
        nodes: [step('m', 'send_message', { text: 'Hello' }), step('sms', 'send_sms', { text: 'Fallback by SMS' })],
        edges: [edge('m', 'sms', 'failed')],
      }),
    );
    const without = await h.publish(definition([{ key: 'contact.created' }], chain(step('m', 'send_message', { text: 'Hello' }))));
    await h.emit('contact.created', { contact_id: contact });
    await h.drain();
    const [a] = await h.runs(withFallback.id);
    expect(a.status).toBe('completed');
    expect((await h.steps(a.id as string)).map((s) => [s.node_key, s.status])).toEqual([
      ['m', 'failed'],
      ['sms', 'completed'],
    ]);
    expect(h.captured.sms.map((s) => s.text)).toEqual(['Fallback by SMS']);
    const [b] = await h.runs(without.id);
    expect(b).toMatchObject({ status: 'failed', last_error: 'The contact has no channel we can message' });
  });

  it('contact changes are visible to the next steps, and report their source', async () => {
    const contact = await h.createContact();
    const automation = await h.publish(
      definition([{ key: 'contact.created' }], {
        nodes: [
          step('tag', 'add_tag', { tag: 'welcomed' }),
          step('field', 'update_contact', { fields: [{ field: 'custom.source', value: 'automation {{organization.name}}' }] }),
          step('c', 'condition', { condition: hasTag('welcomed') }),
          step('yes', 'send_sms', { text: 'Tagged, source={{contact.custom.source}}' }),
        ],
        edges: [edge('tag', 'field'), edge('field', 'c'), edge('c', 'yes', 'yes')],
      }),
    );
    await h.emit('contact.created', { contact_id: contact });
    await h.drain();
    expect(h.captured.sms.map((s) => s.text)).toEqual(['Tagged, source=automation Clínica Sol']);
    const [row] = (await h.ds.query(`SELECT tags, custom_fields FROM clients.contacts WHERE id = $1`, [contact])) as Array<{ tags: string[]; custom_fields: Record<string, unknown> }>;
    expect(row.tags).toContain('welcomed');
    expect(row.custom_fields).toMatchObject({ source: 'automation Clínica Sol' });
    expect(h.captured.events).toContainEqual({ topic: 'contact.tag.added', data: expect.objectContaining({ contact_id: contact, tag: 'welcomed', source: 'automation' }) });
    expect((await h.runs(automation.id))[0].status).toBe('completed');
  });

  it('a "Create task" step can wait until a person finishes the task', async () => {
    const contact = await h.createContact();
    const automation = await h.publish(
      definition([{ key: 'contact.created' }], chain(step('t', 'create_task', { title: 'Call {{contact.first_name}}', wait_until_done: true }), step('s', 'send_sms', { text: 'Done' }))),
    );
    await h.emit('contact.created', { contact_id: contact });
    await h.drain();
    const [run] = await h.runs(automation.id);
    expect(run.status).toBe('waiting');
    expect(run.resume_at).toBeNull();
    const [task] = (await h.ds.query(`SELECT id, title, executor, run_id, node_key, status FROM scheduling.scheduled_actions WHERE run_id = $1`, [run.id])) as Array<Record<string, unknown>>;
    expect(task).toMatchObject({ title: 'Call Ana', executor: 'user', node_key: 't', status: 'pending' });

    await h.ds.query(`UPDATE scheduling.scheduled_actions SET status = 'awaiting_user' WHERE id = $1`, [task.id]);
    await h.tasks.complete(h.org, task.id as string, { completedBy: null });
    await h.drain();
    expect((await h.runs(automation.id))[0].status).toBe('completed');
    expect(h.captured.sms.map((s) => s.text)).toEqual(['Done']);
  });

  it('a scheduled automation runs once for the organization and messages every matching contact once, in batches', async () => {
    const vip: string[] = [];
    for (let i = 0; i < 250; i++) vip.push(await h.createContact({ first_name: `Vip${i}`, phone: `+1555${String(i).padStart(6, '0')}`, tags: ['vip-sched'] }));
    await h.createContact({ first_name: 'Other', tags: ['other'] });
    await h.createContact({ first_name: 'OptedOut', tags: ['vip-sched', 'opt-out'] });
    const automation = await h.publish(
      definition(
        [{ key: 'schedule', schedule: { frequency: 'daily', time: '09:00' } }],
        chain(step('s', 'send_sms', { recipients: { mode: 'filter', filter: hasTag('vip-sched') }, text: 'Hi {{contact.first_name}} from {{organization.name}}' })),
      ),
    );
    await h.ds.query(`UPDATE automation.automation_schedules SET next_run_at = NOW() - INTERVAL '1 minute' WHERE automation_id = $1`, [automation.id]);
    const fired = await Promise.all([h.schedules.fireDue(), h.schedules.fireDue()]);
    expect(fired[0] + fired[1]).toBe(1);

    await h.drain();
    const runs = await h.runs(automation.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ scope: 'organization', contact_id: null, status: 'completed' });
    expect(h.captured.sms).toHaveLength(250);
    expect(new Set(h.captured.sms.map((s) => s.to)).size).toBe(250);
    expect(h.captured.sms.find((s) => s.to === '+1555000007')?.text).toBe('Hi Vip7 from Clínica Sol');
    const [s] = await h.steps(runs[0].id as string);
    expect(s.output).toMatchObject({ sent: 250, skipped: 1, failed: 0 });

    const [schedule] = (await h.ds.query(`SELECT next_run_at, last_run_at FROM automation.automation_schedules WHERE automation_id = $1`, [automation.id])) as Array<{ next_run_at: Date }>;
    expect(new Date(schedule.next_run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('two workers claiming the same run execute it once', async () => {
    const contact = await h.createContact();
    const automation = await h.publish(definition([{ key: 'contact.created' }], chain(step('s', 'send_sms', { text: 'once' }))));
    const run = await h.runtime.start({
      organizationId: h.org,
      automationId: automation.id,
      versionId: automation.published_version_id!,
      scope: 'contact',
      contactId: contact,
      conversationId: null,
      triggerKey: 'manual',
      triggerEventId: null,
      context: { trigger: { key: 'manual', data: {} } },
    });
    await Promise.all([h.runtime.execute(run!.id), h.runtime.execute(run!.id), h.runtime.execute(run!.id)]);
    expect(h.captured.sms).toHaveLength(1);
  });

  it('a paused automation starts nothing; resuming it does', async () => {
    const contact = await h.createContact();
    const automation = await h.publish(definition([{ key: 'contact.tag_added' }], chain(step('s', 'send_sms', { text: 'tagged' }))));
    await h.automations.pause(h.org, automation.id);
    await h.emit('contact.tag.added', { contact_id: contact, tag: 'x' });
    await h.drain();
    expect(await h.runs(automation.id)).toHaveLength(0);
    await h.automations.resume(h.org, automation.id, null);
    await h.emit('contact.tag.added', { contact_id: contact, tag: 'y' });
    await h.drain();
    expect(await h.runs(automation.id)).toHaveLength(1);
  });

  it('hands the event to the AI agent with the payload the AI always received', async () => {
    const contact = await h.createContact();
    const conversation = await h.createConversation(contact);
    const agent = await h.createAiConnection();
    const ai = step('ai', 'send_to_ai');
    const cond = step('c', 'condition', { condition: { any: [{ all: [{ field: 'conversation.ai_active', operator: 'is_true' }] }] } });
    await h.publish(definition([{ key: 'message.received' }], { nodes: [cond, ai], edges: [edge('c', 'ai', 'yes')] }));
    await inbound(contact, conversation, 'Do you have availability tomorrow?');
    await h.drain();
    expect(h.captured.aiJobs).toEqual([
      {
        name: 'trigger',
        data: {
          event_type: 'message.received',
          organization_id: h.org,
          conversation_id: conversation,
          contact_id: contact,
          payload: { message: 'Do you have availability tomorrow?', channel: 'whatsapp' },
          agent_id: agent,
          automation_run_id: expect.any(String),
        },
        opts: expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 2000 } }),
      },
    ]);

    // A human took the conversation over: the condition stops the AI.
    await h.ds.query(`UPDATE conversations.conversations SET bot_active = false WHERE id = $1`, [conversation]);
    await inbound(contact, conversation, 'hello?');
    await h.drain();
    expect(h.captured.aiJobs).toHaveLength(1);
  });

  it('adds contacts manually to an automation with a manual trigger', async () => {
    const a = await h.createContact();
    const b = await h.createContact({ tags: ['opt-out'] });
    const automation = await h.publish(definition([{ key: 'manual' }], chain(step('s', 'send_sms', { text: 'manual' }))));
    const version = await h.ds.getRepository('AutomationVersionEntity').findOneByOrFail({ id: automation.published_version_id! });
    const result = await h.enrollment.enrollManually(automation, version as never, [a, b, a], null);
    expect(result.started).toHaveLength(1);
    expect(result.skipped).toEqual([b]);
    await h.drain();
    expect(h.captured.sms).toHaveLength(1);
  });
});
