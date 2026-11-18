import { AgentTriggerProcessor } from './agent-trigger.processor';
import { readGolden } from '../../test-support/golden';
import { AI_FIXTURE as F } from '../../test-support/ai-job-scenarios';

/**
 * The contract with the external AI agent (ProSales): the HTTP request sent
 * for each job. `golden/ai-agent-requests.json` was recorded from the legacy
 * routing (agents picked by `trigger_event`); now that automations pick the
 * connection (`agent_id`), the requests must stay byte-identical.
 */

interface AgentRow {
  id: string;
  name: string;
  trigger_event: string;
  workflow_endpoint: string;
  auth_header_value: string | null;
  is_active: boolean;
}

const PROSALES: AgentRow = {
  id: 'ag000000-0000-4000-8000-000000000001',
  name: 'ProSales',
  trigger_event: 'message.received',
  workflow_endpoint: 'https://prosales.example.com/api/v1/crm/inbound',
  auth_header_value: 'ps_live_key',
  is_active: true,
};
const SECOND_INBOUND: AgentRow = {
  id: 'ag000000-0000-4000-8000-000000000002',
  name: 'Custom workflow',
  trigger_event: 'message.received',
  workflow_endpoint: 'https://hooks.example.com/inbound',
  auth_header_value: null,
  is_active: true,
};

interface Recorded {
  requests: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }>;
  logs: Array<{ agent_id: string; event: string }>;
}

async function processJob(
  job: Record<string, unknown>,
  opts: { agents: AgentRow[]; operational?: boolean; aiCallsAllowed?: boolean },
): Promise<Recorded> {
  const recorded: Recorded = { requests: [], logs: [] };
  const agentTriggerService = {
    findAgentById: jest.fn(async (id: string) => {
      const agent = opts.agents.find((a) => a.id === id);
      if (!agent) throw new Error('not found');
      return agent;
    }),
    log: jest.fn(async (_org: string, agentId: string, _conv: string | null, event: string) => {
      recorded.logs.push({ agent_id: agentId, event });
    }),
  };
  const processor = new AgentTriggerProcessor(
    agentTriggerService as never,
    { get: () => undefined } as never,
    {
      findUpcomingForContact: jest.fn(async () => [
        {
          id: F.appointmentId,
          calendar_id: 'cal-1',
          title: 'Initial consultation',
          starts_at: new Date('2026-03-23T15:00:00.000Z'),
          ends_at: new Date('2026-03-23T15:30:00.000Z'),
          timezone: 'America/Mexico_City',
          status: 'confirmed',
          location: null,
          meeting_url: null,
          notes: 'not sent to the AI',
        },
      ]),
    } as never,
    {
      findById: jest.fn(async () => ({
        id: F.contactId,
        first_name: 'Ana',
        last_name: 'García',
        email: 'ana@example.com',
        phone: '+5215550001',
        tags: ['vip'],
        custom_fields: { budget: 'not sent to the AI' },
      })),
    } as never,
    {
      findAll: jest.fn(async () => [
        { id: F.serviceId, name: 'Initial consultation', description: 'First visit', amount: 5000, is_active: true },
      ]),
    } as never,
    { getRaw: jest.fn(async () => ({ currency: 'mxn' })) } as never,
    {} as never,
    {
      isOperational: jest.fn(async () => opts.operational ?? true),
      checkLimit: jest.fn(async () => ({ allowed: opts.aiCallsAllowed ?? true, limit: 100, current: 100 })),
    } as never,
    { increment: jest.fn(async () => undefined) } as never,
  );

  const originalFetch = global.fetch;
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    recorded.requests.push({
      url: String(url),
      method: String(init?.method),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return { ok: true, status: 200, text: async () => '' } as Response;
  }) as typeof fetch;
  try {
    await (processor as unknown as { process(j: unknown): Promise<void> }).process({ data: job });
  } finally {
    global.fetch = originalFetch;
  }
  return recorded;
}

const inboundJob = {
  event_type: 'message.received',
  organization_id: F.organizationId,
  conversation_id: F.conversationId,
  contact_id: F.contactId,
  payload: { message: 'Hi, do you have availability tomorrow?', channel: 'whatsapp' },
};
const paymentJob = (eventType: string) => ({
  event_type: eventType,
  organization_id: F.organizationId,
  conversation_id: F.conversationId,
  contact_id: F.contactId,
  payload: { source: 'system', payment_status: eventType.split('.')[1], payment_id: F.paymentId, message: 'Payment update' },
});
const callJob = {
  event_type: 'call.completed',
  organization_id: F.organizationId,
  conversation_id: F.conversationId,
  contact_id: F.contactId,
  payload: { call_id: F.callId, duration_seconds: 184, summary: 'Asked to book next week.' },
};

describe('AI agent requests when an automation picks the connection (agent_id)', () => {
  const golden = () => readGolden<Record<string, Recorded>>('ai-agent-requests');

  it.each([
    ['inbound → ProSales', inboundJob],
    ['payment.received → falls back to the inbound agent', paymentJob('payment.received')],
    ['payment.expired → falls back to the inbound agent', paymentJob('payment.expired')],
    ['job without contact (no enrichment)', { ...inboundJob, contact_id: undefined }],
  ])('sends the same request as "%s"', async (name, job) => {
    const recorded = await processJob({ ...job, agent_id: PROSALES.id, automation_run_id: 'run-1' }, { agents: [PROSALES, SECOND_INBOUND] });
    expect(recorded.requests).toEqual(golden()[name].requests);
  });

  it('sends a call to the chosen connection even without a dedicated call agent', async () => {
    const recorded = await processJob({ ...callJob, agent_id: PROSALES.id }, { agents: [PROSALES] });
    expect(recorded.requests).toHaveLength(1);
    expect(recorded.requests[0]).toMatchObject({ url: PROSALES.workflow_endpoint, body: { event_type: 'call.completed', payload: callJob.payload } });
  });

  it('billing and AI call limits still apply', async () => {
    expect(golden()['inbound → billing restricted'].requests).toEqual([]);
    expect((await processJob({ ...inboundJob, agent_id: PROSALES.id }, { agents: [PROSALES], operational: false })).requests).toEqual([]);
    const limited = await processJob({ ...inboundJob, agent_id: PROSALES.id }, { agents: [PROSALES], aiCallsAllowed: false });
    expect(limited).toEqual(golden()['inbound → AI call limit reached']);
  });

  it('sends nothing for a job that names no connection', async () => {
    expect((await processJob(inboundJob, { agents: [PROSALES] })).requests).toEqual([]);
  });

  it('sends nothing when the chosen connection is disabled or belongs to no one', async () => {
    expect((await processJob({ ...inboundJob, agent_id: PROSALES.id }, { agents: [{ ...PROSALES, is_active: false }] })).requests).toEqual([]);
    expect((await processJob({ ...inboundJob, agent_id: 'missing' }, { agents: [PROSALES] })).requests).toEqual([]);
  });
});
