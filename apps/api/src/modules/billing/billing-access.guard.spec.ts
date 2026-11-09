/// <reference types="jest" />
import { ExecutionContext, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingAccessLevel, PlanFeature } from '@crm/shared';
import type { BillingAccess } from '@crm/shared';
import { Public } from '../../common/decorators/public.decorator';
import { BillingAccessGuard } from './billing-access.guard';
import { CheckPlanLimit, RequiresPlanFeature, SkipBillingCheck } from './billing-access.decorators';
import type { BillingAccessService } from './billing-access.service';

class DemoController {
  plain() {}
  @Public() open() {}
  @SkipBillingCheck() billing() {}
  @RequiresPlanFeature(PlanFeature.VOICE_CALLS) call() {}
  @CheckPlanLimit('messages') send() {}
}

function access(overrides: Partial<BillingAccess> = {}): BillingAccess {
  return {
    level: BillingAccessLevel.FULL,
    is_demo: false,
    status: 'active',
    reasons: [],
    requires_action: false,
    is_paid_plan: true,
    has_valid_payment_method: true,
    grace_period_ends_at: null,
    plan_name: 'professional',
    effective_plan_name: 'professional',
    effective_limits: { conversations: 10, messages: 100, ai_calls: 10, agents: 2, voice_minutes: 0 },
    effective_features: ['voice_calls'],
    has_custom_limits: false,
    demo_ends_at: null,
    ...overrides,
  };
}

function ctx(
  handler: keyof DemoController,
  req: Record<string, unknown> = {},
  type = 'http',
): ExecutionContext {
  const request = {
    method: 'POST',
    tenant: { organization_id: 'org-1', user_id: 'u1', role: 'agent' },
    user: { id: 'u1', is_platform_admin: false },
    ...req,
  };
  return {
    getType: () => type,
    getHandler: () => DemoController.prototype[handler],
    getClass: () => DemoController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function rejection(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (err) {
    return err as HttpException;
  }
  throw new Error('expected the guard to reject');
}

describe('BillingAccessGuard', () => {
  let current: BillingAccess;
  let usage: Record<string, number>;
  let getAccess: jest.Mock;
  let guard: BillingAccessGuard;

  beforeEach(() => {
    current = access();
    usage = { conversations: 0, messages: 0, ai_calls: 0, voice_minutes: 0 };
    getAccess = jest.fn(async () => current);
    const checkLimit = jest.fn(async (_org: string, metric: 'messages') => {
      const limit = current.effective_limits[metric];
      const used = usage[metric];
      return { allowed: limit === -1 || used + 1 <= limit, metric, limit, current: used };
    });
    guard = new BillingAccessGuard(new Reflector(), { getAccess, checkLimit } as unknown as BillingAccessService);
  });

  it('allows requests for an org in good standing', async () => {
    await expect(guard.canActivate(ctx('plain'))).resolves.toBe(true);
    expect(getAccess).toHaveBeenCalledWith('org-1');
  });

  it.each([
    ['public routes', ctx('open')],
    ['@SkipBillingCheck routes', ctx('billing')],
    ['requests without tenant', ctx('plain', { tenant: undefined })],
    ['platform admins', ctx('plain', { user: { is_platform_admin: true } })],
    ['non-HTTP contexts (RMQ consumers)', ctx('plain', {}, 'rpc')],
  ])('does not evaluate billing for %s', async (_label, context) => {
    current = access({ level: BillingAccessLevel.SUSPENDED });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getAccess).not.toHaveBeenCalled();
  });

  it('rejects every request of a suspended org with 403', async () => {
    current = access({ level: BillingAccessLevel.SUSPENDED });
    const err = await rejection(guard.canActivate(ctx('plain', { method: 'GET' })));
    expect(err).toBeInstanceOf(ForbiddenException);
  });

  describe('blocked org (paid plan without payment)', () => {
    beforeEach(() => {
      current = access({ level: BillingAccessLevel.BLOCKED, status: 'unpaid', effective_features: [] });
    });

    it.each(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s with 402', async (method) => {
      const err = await rejection(guard.canActivate(ctx('plain', { method })));
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(err.getResponse()).toMatchObject({
        errors: { code: 'BILLING_BLOCKED', access_level: 'blocked', status: 'unpaid' },
      });
    });

    it('still lets billing endpoints through so the org can pay', async () => {
      await expect(guard.canActivate(ctx('billing'))).resolves.toBe(true);
    });
  });

  describe('demo org', () => {
    it('may use premium features', async () => {
      current = access({ is_demo: true, is_paid_plan: false, effective_features: ['all'] });
      await expect(guard.canActivate(ctx('call'))).resolves.toBe(true);
    });
  });

  describe('plan features', () => {
    it('allows a feature included in the effective plan', async () => {
      await expect(guard.canActivate(ctx('call'))).resolves.toBe(true);
    });

    it('rejects a feature missing from the effective plan with 402', async () => {
      current = access({ effective_features: ['contacts'] });
      const err = await rejection(guard.canActivate(ctx('call')));
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(err.getResponse()).toMatchObject({
        errors: { code: 'PLAN_FEATURE_UNAVAILABLE', feature: 'voice_calls' },
      });
    });
  });

  describe('usage limits', () => {
    it('allows usage below the effective limit', async () => {
      usage.messages = 99;
      await expect(guard.canActivate(ctx('send'))).resolves.toBe(true);
    });

    it('rejects once usage reaches the effective limit', async () => {
      usage.messages = 100;
      const err = await rejection(guard.canActivate(ctx('send')));
      expect(err.getResponse()).toMatchObject({
        message: 'You have reached your limit of 100 messages this month. Upgrade your plan to continue.',
        errors: { code: 'PLAN_LIMIT_REACHED', metric: 'messages', limit: 100, current: 100 },
      });
    });

    it('never blocks unlimited (-1) metrics', async () => {
      current = access({ effective_limits: { ...access().effective_limits, messages: -1 } });
      usage.messages = 1_000_000;
      await expect(guard.canActivate(ctx('send'))).resolves.toBe(true);
    });
  });
});
