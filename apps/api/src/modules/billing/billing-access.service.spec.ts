/// <reference types="jest" />
import type { ConfigService } from '@nestjs/config';
import { BillingAccessService } from './billing-access.service';
import type { UsageTrackingService } from './usage-tracking.service';

const ORG = 'org-1';
const DEMO_PLAN = {
  id: 'plan-free', name: 'free', price_monthly: 0, price_yearly: 0,
  limits: { conversations: 100, messages: 1000, ai_calls: 10, agents: 2, voice_minutes: 0 }, features: [],
};

function build(options: { overrides?: Record<string, number>; usage?: Record<string, number>; activeUsers?: number } = {}) {
  const sub = {
    organization_id: ORG, plan: DEMO_PLAN, status: 'active', payment_method_id: null,
    current_period_end: new Date(Date.now() + 86_400_000), past_due_since: null, cancel_at_period_end: false,
    demo_limit_overrides: options.overrides ?? {},
  };
  const userRepo = { count: jest.fn(async () => options.activeUsers ?? 1) };
  const usage = {
    getCurrentUsage: jest.fn(async () => ({ conversations: 0, messages: 0, ai_calls: 0, voice_minutes: 0, ...options.usage })),
  };
  const service = new BillingAccessService(
    { findOne: async () => sub } as never,
    { findOne: async () => DEMO_PLAN } as never,
    { findOne: async () => ({ id: ORG, is_active: true }) } as never,
    userRepo as never,
    usage as unknown as UsageTrackingService,
    { get: (_k: string, d: unknown) => d } as unknown as ConfigService,
    undefined,
  );
  return { service, userRepo };
}

describe('BillingAccessService.checkLimit', () => {
  it('allows usage below the limit and reports it', async () => {
    const { service } = build({ usage: { ai_calls: 9 } });
    await expect(service.checkLimit(ORG, 'ai_calls')).resolves.toEqual({ allowed: true, metric: 'ai_calls', limit: 10, current: 9 });
  });

  it('denies once the limit would be exceeded', async () => {
    const { service } = build({ usage: { ai_calls: 10 } });
    await expect(service.checkLimit(ORG, 'ai_calls')).resolves.toMatchObject({ allowed: false, limit: 10, current: 10 });
  });

  it('accounts for the amount about to be consumed', async () => {
    const { service } = build({ usage: { messages: 999 } });
    await expect(service.checkLimit(ORG, 'messages', 2)).resolves.toMatchObject({ allowed: false });
  });

  it('applies the organization overrides set by a platform admin', async () => {
    const { service } = build({ overrides: { ai_calls: 500 }, usage: { ai_calls: 10 } });
    await expect(service.checkLimit(ORG, 'ai_calls')).resolves.toMatchObject({ allowed: true, limit: 500 });
  });

  it('never blocks unlimited metrics', async () => {
    const { service } = build({ overrides: { messages: -1 }, usage: { messages: 5_000_000 } });
    await expect(service.checkLimit(ORG, 'messages')).resolves.toMatchObject({ allowed: true, limit: -1 });
  });

  it('counts active team members for the agents limit', async () => {
    const { service, userRepo } = build({ activeUsers: 2 });
    await expect(service.checkLimit(ORG, 'agents')).resolves.toMatchObject({ allowed: false, limit: 2, current: 2 });
    expect(userRepo.count).toHaveBeenCalledWith({ where: { organization_id: ORG, is_active: true } });
  });

  it('treats a zero limit as not allowed', async () => {
    const { service } = build();
    await expect(service.checkLimit(ORG, 'voice_minutes')).resolves.toMatchObject({ allowed: false, limit: 0 });
  });
});
