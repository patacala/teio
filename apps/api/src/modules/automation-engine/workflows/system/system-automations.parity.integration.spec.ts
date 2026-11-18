/**
 * The installed system automations do what the hard-coded code did, checked
 * against the golden files recorded from it (test-support/golden):
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @crm/api test system-automations.parity
 * Skipped when TEST_DATABASE_URL is not set.
 */
import { randomUUID } from 'crypto';
import { createAutomationHarness, type AutomationHarness } from '../../../../test-support/automation-harness';
import { readGolden } from '../../../../test-support/golden';
import {
  BOOKING_SCENARIOS,
  SCENARIO_ORGANIZATION,
  decodeAttachment,
  type BookingScenario,
  type OutboundRecord,
} from '../../../../test-support/booking-scenarios';
import { AI_FIXTURE, type AiJobRecord } from '../../../../test-support/ai-job-scenarios';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
jest.setTimeout(180_000);

const TOPIC: Record<BookingScenario['event'], string> = {
  'appointment.confirmation_requested': 'appointment.confirmation.requested',
  'appointment.confirmed': 'appointment.confirmed',
  'appointment.rescheduled': 'appointment.rescheduled',
  'appointment.cancelled': 'appointment.cancelled',
  'appointment.reminder_due': 'appointment.reminder.due',
};

/** Replaces fixture ids by real ones everywhere in a JSON value. */
function remap<T>(value: T, ids: Record<string, string>): T {
  let json = JSON.stringify(value);
  for (const [from, to] of Object.entries(ids)) json = json.split(from).join(to);
  return JSON.parse(json) as T;
}

describeDb('system automations reproduce the hard-coded behaviour', () => {
  describe('booking messages (golden booking-messages.json)', () => {
    let h: AutomationHarness;
    beforeAll(async () => {
      h = await createAutomationHarness(url!);
      await h.ds.query(`UPDATE core.organizations SET name = $2 WHERE id = $1`, [h.org, SCENARIO_ORGANIZATION.name]);
      await h.installer.install(h.org);
    });
    afterAll(() => h?.close());

    const golden = readGolden<Record<string, OutboundRecord[]>>('booking-messages');

    it.each(BOOKING_SCENARIOS.map((s) => [s.name, s] as const))('%s', async (_name, scenario) => {
      h.captured.outbound.length = 0;
      const contactId = scenario.contact
        ? await h.createContact({
            first_name: scenario.contact.first_name ?? '',
            last_name: scenario.contact.last_name ?? null,
            email: scenario.contact.email,
            phone: scenario.contact.phone,
          })
        : randomUUID();
      const payload: Record<string, unknown> = { ...scenario.payload, organization_id: h.org, contact_id: contactId };
      if (scenario.creator) {
        const userId = randomUUID();
        await h.ds.query(`INSERT INTO core.users (id, organization_id, email, full_name, role) VALUES ($1, $2, $3, $4, 'admin')`, [
          userId,
          h.org,
          scenario.creator.email,
          scenario.creator.full_name,
        ]);
        payload.created_by = userId;
      }
      await h.emit(TOPIC[scenario.event], payload);
      await h.drain();

      const sent: OutboundRecord[] = h.captured.outbound.map((o) =>
        o.channel === 'email'
          ? {
              channel: 'email',
              to: String(o.message.to),
              subject: String(o.message.subject),
              html: String(o.message.html),
              attachments: ((o.message.attachments as Array<{ filename: string; content: string; contentType: string }>) ?? []).map(decodeAttachment),
            }
          : { channel: 'sms', to: String(o.message.to), text: String(o.message.text) },
      );
      expect(sent).toEqual(golden[scenario.name]);
    });
  });

  describe('AI agent routing (golden ai-agent-jobs.json)', () => {
    let h: AutomationHarness;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      h = await createAutomationHarness(url!);
      const contact = await h.createContact();
      const conversation = await h.createConversation(contact);
      const incoming = await h.createAiConnection({ name: 'ProSales', trigger_event: 'message.received' });
      // A dedicated call agent: the only way calls ever reached an agent.
      const callAgent = await h.createAiConnection({ name: 'Call follow-up', trigger_event: 'call.completed' });
      Object.assign(ids, {
        [AI_FIXTURE.organizationId]: h.org,
        [AI_FIXTURE.contactId]: contact,
        [AI_FIXTURE.conversationId]: conversation,
        incoming,
        callAgent,
      });
      await h.installer.install(h.org);
    });
    afterAll(() => h?.close());

    const golden = readGolden<Record<string, AiJobRecord>>('ai-agent-jobs');
    // Legacy enqueued a job for failed payments that no agent ever received (no routing fallback).
    const NEVER_DELIVERED = new Set(['payment failed']);

    it.each(Object.keys(golden))('%s', async (name) => {
      h.captured.aiJobs.length = 0;
      const record = remap(golden[name], ids);
      if (name === 'inbound whatsapp, human took over') {
        await h.ds.query(`UPDATE conversations.conversations SET bot_active = false WHERE id = $1`, [ids[AI_FIXTURE.conversationId]]);
      }
      for (const event of record.events) await h.emit(event.topic, event.data);
      await h.drain();
      if (name === 'inbound whatsapp, human took over') {
        await h.ds.query(`UPDATE conversations.conversations SET bot_active = true WHERE id = $1`, [ids[AI_FIXTURE.conversationId]]);
      }

      const expected = NEVER_DELIVERED.has(name) ? [] : record.jobs;
      const actual = h.captured.aiJobs.map((job) => {
        const { agent_id, automation_run_id, ...data } = job.data;
        const { jobId, ...opts } = job.opts;
        expect(typeof automation_run_id).toBe('string');
        expect(jobId).toEqual(expect.stringMatching(/^ai-/));
        expect(agent_id).toBe(name.startsWith('call') ? ids.callAgent : ids.incoming);
        return { name: job.name, data, opts };
      });
      expect(actual).toEqual(expected);
    });
  });

  describe('installing', () => {
    let h: AutomationHarness;
    beforeAll(async () => {
      h = await createAutomationHarness(url!);
    });
    afterAll(() => h?.close());

    it('is idempotent and reflects the organization setup', async () => {
      await h.createAiConnection({ name: 'ProSales', trigger_event: 'message.received', is_active: false });
      await h.installer.install(h.org);
      await h.installer.install(h.org);
      const rows = (await h.ds.query(
        `SELECT template_key, status, is_system FROM automation.automations WHERE organization_id = $1 ORDER BY template_key`,
        [h.org],
      )) as Array<{ template_key: string; status: string; is_system: boolean }>;
      expect(Object.fromEntries(rows.map((r) => [r.template_key, r.status]))).toEqual({
        ai_call_completed: 'paused',
        ai_incoming_message: 'paused', // routing was off: the AI did not answer
        ai_payment_update: 'paused',
        booking_cancelled: 'active',
        booking_confirmation_request: 'active',
        booking_confirmed: 'active',
        booking_reminder: 'active',
        booking_rescheduled: 'active',
        no_response_follow_up: 'active',
        opt_out_keywords: 'paused',
      });
      expect(rows.every((r) => r.is_system)).toBe(true);
      const [version] = (await h.ds.query(`SELECT settings->>'automations_installed' AS v FROM core.organizations WHERE id = $1`, [h.org])) as Array<{ v: string }>;
      expect(Number(version.v)).toBeGreaterThanOrEqual(1);
    });

    it('the follow-up starts 2h after our message, stops when the contact replies, and restarts with our next message', async () => {
      const contact = await h.createContact();
      const conversation = await h.createConversation(contact);
      const automationId = (await h.automations.list(h.org)).find((a) => a.template_key === 'no_response_follow_up')!.id;

      await h.emit('message.send', { contact_id: contact, conversation_id: conversation, channel: 'whatsapp', direction: 'outbound', sender_type: 'ai' });
      await h.drain();
      let [run] = await h.runs(automationId);
      expect(run.status).toBe('waiting');
      expect(Math.round((new Date(run.resume_at as string).getTime() - Date.now()) / 3_600_000)).toBe(2);
      const [tagged] = (await h.ds.query(`SELECT tags FROM clients.contacts WHERE id = $1`, [contact])) as Array<{ tags: string[] }>;
      expect(tagged.tags).toContain('follow-up');

      await h.fastForward(run.id as string);
      expect(h.captured.chat.map((c) => c.content)).toEqual([
        "Hi Ana García, we're following up to see if there's anything we can help you with. - Clínica Sol",
      ]);

      await h.emit('message.received', {
        contact_id: contact,
        conversation_id: conversation,
        channel: 'whatsapp',
        message: { id: randomUUID(), content: 'thanks', direction: 'inbound' },
      });
      [run] = await h.runs(automationId);
      expect(run.status).toBe('exited');

      // Not re-armed by email or by an automation's own message; re-armed by our next chat message.
      await h.emit('message.send', { contact_id: contact, conversation_id: conversation, channel: 'email', direction: 'outbound', sender_type: 'agent' });
      await h.emit('message.send', { contact_id: contact, conversation_id: conversation, channel: 'whatsapp', direction: 'outbound', sender_type: 'automation' });
      await h.drain();
      expect(await h.runs(automationId)).toHaveLength(1);
      await h.emit('message.send', { contact_id: contact, conversation_id: conversation, channel: 'whatsapp', direction: 'outbound', sender_type: 'agent' });
      await h.drain();
      expect((await h.runs(automationId)).map((r) => r.status)).toEqual(['exited', 'waiting']);
    });

    it('a booking also stops the follow-up (any booking, not only the AI ones)', async () => {
      const contact = await h.createContact();
      const conversation = await h.createConversation(contact);
      const automationId = (await h.automations.list(h.org)).find((a) => a.template_key === 'no_response_follow_up')!.id;
      await h.emit('message.send', { contact_id: contact, conversation_id: conversation, channel: 'whatsapp', direction: 'outbound', sender_type: 'agent' });
      await h.drain();
      await h.emit('appointment.created', { contact_id: contact, appointment_id: randomUUID(), origin: 'human', status: 'scheduled' });
      const runs = await h.runs(automationId);
      expect(runs.filter((r) => r.contact_id === contact).map((r) => r.status)).toEqual(['exited']);
    });
  });
});
