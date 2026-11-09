/// <reference types="jest" />
import type { DataSource, InsertEvent } from 'typeorm';
import { UsageMeteringSubscriber } from './usage-metering.subscriber';
import { UsageTrackingService } from './usage-tracking.service';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { MessageEntity } from '../conversation-management/message.entity';
import { CallsService } from '../voice/calls.service';
import { AgentTriggerProcessor } from '../ai-automation/agent-trigger.processor';
import { ActionExecutionService } from '../automation-engine/action-execution.service';

const ORG = 'org-1';

/** Minimal in-memory Redis with the commands UsageTrackingService uses. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    exists: jest.fn(async (k: string) => (store.has(k) ? 1 : 0)),
    set: jest.fn(async (k: string, v: string, ..._args: unknown[]) => {
      if (store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
    incrby: jest.fn(async (k: string, d: number) => {
      const v = Number(store.get(k) ?? 0) + d;
      store.set(k, String(v));
      return v;
    }),
    expire: jest.fn(async () => 1),
    pipeline: () => {
      const keys: string[] = [];
      const p = {
        get: (k: string) => { keys.push(k); return p; },
        exec: async () => keys.map((k) => [null, store.get(k) ?? null]),
      };
      return p;
    },
  };
}

function usageService(stored: Record<string, number> | null = null) {
  const redis = fakeRedis();
  const repo = { findOne: jest.fn(async () => stored), query: jest.fn(async () => undefined) };
  return { service: new UsageTrackingService(repo as never, redis as never), redis, repo };
}

describe('UsageTrackingService', () => {
  const JUNE = new Date('2026-06-15T12:00:00Z');

  it('counts per metric and month', async () => {
    const { service } = usageService();
    await service.increment(ORG, 'messages', 1, JUNE);
    await service.increment(ORG, 'messages', 2, JUNE);
    await expect(service.getCurrentUsage(ORG, JUNE)).resolves.toMatchObject({ messages: 3, conversations: 0 });
    await expect(service.getCurrentUsage(ORG, new Date('2026-07-01T00:00:00Z'))).resolves.toMatchObject({ messages: 0 });
  });

  it('continues from the stored month total when Redis lost the counter', async () => {
    const { service } = usageService({ messages: 40 } as never);
    await service.increment(ORG, 'messages', 1, JUNE);
    await expect(service.getCurrentUsage(ORG, JUNE)).resolves.toMatchObject({ messages: 41 });
  });

  it('reads the stored month total when Redis has nothing', async () => {
    const { service } = usageService({ conversations: 7, messages: 0, ai_calls: 3, voice_minutes: 12 } as never);
    await expect(service.getCurrentUsage(ORG, JUNE)).resolves.toEqual({ conversations: 7, messages: 0, ai_calls: 3, voice_minutes: 12 });
  });

  it('persists with an upsert that never lowers the stored value', async () => {
    const { service, repo } = usageService();
    await service.increment(ORG, 'ai_calls', 1, JUNE);
    await new Promise((r) => setImmediate(r));
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('GREATEST(billing.usage.ai_calls, EXCLUDED.ai_calls)'),
      [ORG, new Date('2026-06-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'), 1],
    );
  });

  it('counts a deduplicated event only once', async () => {
    const { service } = usageService();
    await expect(service.incrementOnce(ORG, 'voice_minutes', 3, 'call:1', JUNE)).resolves.toBe(true);
    await expect(service.incrementOnce(ORG, 'voice_minutes', 3, 'call:1', JUNE)).resolves.toBe(false);
    await expect(service.getCurrentUsage(ORG, JUNE)).resolves.toMatchObject({ voice_minutes: 3 });
  });
});

describe('UsageMeteringSubscriber', () => {
  function setup() {
    const usage = { increment: jest.fn(async () => undefined) };
    const dataSource = { subscribers: [] as unknown[] };
    const subscriber = new UsageMeteringSubscriber(dataSource as unknown as DataSource, usage as never);
    const insert = (target: unknown, entity: object) =>
      subscriber.afterInsert({ metadata: { target }, entity } as unknown as InsertEvent<unknown>);
    return { usage, dataSource, subscriber, insert };
  }

  it('registers itself with the data source', () => {
    const { dataSource, subscriber } = setup();
    expect(dataSource.subscribers).toContain(subscriber);
  });

  it('counts new conversations', () => {
    const { usage, insert } = setup();
    insert(ConversationEntity, { organization_id: ORG });
    expect(usage.increment).toHaveBeenCalledWith(ORG, 'conversations');
  });

  it.each(['inbound', 'outbound'])('counts %s messages', (direction) => {
    const { usage, insert } = setup();
    insert(MessageEntity, { organization_id: ORG, type: 'text', direction });
    expect(usage.increment).toHaveBeenCalledWith(ORG, 'messages');
  });

  it('does not count voice call summaries (billed as minutes) or other entities', () => {
    const { usage, insert } = setup();
    insert(MessageEntity, { organization_id: ORG, type: 'system', channel: 'voice' });
    insert(class Other {}, { organization_id: ORG });
    expect(usage.increment).not.toHaveBeenCalled();
  });
});

describe('voice minutes', () => {
  const meter = (usage: object, call: object) =>
    (CallsService.prototype as unknown as { meterVoiceMinutes(c: object): void }).meterVoiceMinutes.call(
      { usageTracking: usage, logger: { warn: jest.fn() } },
      call,
    );

  it('bills a completed call once, rounded up to whole minutes', () => {
    const usage = { incrementOnce: jest.fn(async () => true) };
    meter(usage, { id: 'call-1', organization_id: ORG, status: 'completed', duration_seconds: 61 });
    expect(usage.incrementOnce).toHaveBeenCalledWith(ORG, 'voice_minutes', 2, 'call:call-1');
  });

  it.each([
    ['in progress', { status: 'in_progress', duration_seconds: 30 }],
    ['without duration', { status: 'completed', duration_seconds: null }],
  ])('ignores calls %s', (_label, call) => {
    const usage = { incrementOnce: jest.fn() };
    meter(usage, { id: 'c', organization_id: ORG, ...call });
    expect(usage.incrementOnce).not.toHaveBeenCalled();
  });
});

describe('AI calls', () => {
  const agent = { id: 'agent-1', workflow_endpoint: 'https://workflow.test/hook', auth_header_value: null };

  function setup(allowed: boolean) {
    const triggers = {
      findAgentsForEvent: jest.fn(async () => [agent]),
      log: jest.fn(async () => undefined),
    };
    const billingAccess = {
      isOperational: jest.fn(async () => true),
      checkLimit: jest.fn(async () => ({ allowed, metric: 'ai_calls', limit: 10, current: allowed ? 3 : 10 })),
    };
    const usage = { increment: jest.fn(async () => undefined) };
    const processor = new AgentTriggerProcessor(
      triggers as never, {} as never, undefined as never, undefined as never, undefined as never,
      undefined as never, {} as never, billingAccess as never, usage as never,
    );
    const run = () =>
      (processor as unknown as { process(job: object): Promise<void> }).process({
        data: { event_type: 'message.received', organization_id: ORG, conversation_id: 'conv-1', payload: {} },
      });
    return { triggers, usage, run };
  }

  afterEach(() => jest.restoreAllMocks());

  it('counts one AI call per successful workflow invocation', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { usage, run } = setup(true);
    await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usage.increment).toHaveBeenCalledWith(ORG, 'ai_calls');
  });

  it('does not count a failed invocation', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    const { usage, run } = setup(true);
    await run();
    expect(usage.increment).not.toHaveBeenCalled();
  });

  it('skips the AI and logs why once the monthly limit is reached', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { triggers, usage, run } = setup(false);
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usage.increment).not.toHaveBeenCalled();
    expect(triggers.log).toHaveBeenCalledWith(ORG, 'agent-1', 'conv-1', 'usage_limit_reached', expect.objectContaining({ metric: 'ai_calls', limit: 10 }));
  });
});

describe('automated actions', () => {
  function setup(action: string, allowed: boolean) {
    const appt = { id: 'appt-1', organization_id: ORG, contact_id: 'c1', status: 'processing', action, sequence_id: null };
    const appointments = {
      repo: { findOne: jest.fn(async () => appt) },
      markFailed: jest.fn(async () => 'failed'),
    };
    const billingAccess = {
      isOperational: jest.fn(async () => true),
      checkLimit: jest.fn(async (_o: string, metric: string) => ({ allowed, metric, limit: 5, current: 5 })),
    };
    const service = new ActionExecutionService(
      appointments as never, { advanceOrComplete: jest.fn() } as never, { resolve: jest.fn(async () => null) } as never,
      { findOne: jest.fn(async () => ({ id: 'c1' })) } as never, { findOne: jest.fn(async () => ({ id: ORG })) } as never,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, billingAccess as never,
    );
    return { service, appointments, billingAccess };
  }

  it.each([
    ['send_message', 'messages'],
    ['send_email', 'messages'],
    ['call', 'voice_minutes'],
  ])('fails %s when the %s limit is reached', async (action, metric) => {
    const { service, appointments, billingAccess } = setup(action, false);
    await service.execute('appt-1');
    expect(billingAccess.checkLimit).toHaveBeenCalledWith(ORG, metric);
    expect(appointments.markFailed).toHaveBeenCalledWith(ORG, 'appt-1', expect.stringContaining('limit reached (5)'));
  });

  it('does not apply usage limits to unmetered actions', async () => {
    const { service, billingAccess } = setup('create_task', false);
    await service.execute('appt-1').catch(() => undefined);
    expect(billingAccess.checkLimit).not.toHaveBeenCalled();
  });
});
