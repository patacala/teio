/// <reference types="jest" />
import { BillingAccessLevel, BillingRestrictionReason as R, PlanFeature } from '@crm/shared';
import {
  resolveBillingAccess,
  hasFeature,
  isOperational,
  isPaymentMethodExpired,
  limitFor,
  resolveDemoEndsAt,
  type BillingAccessInput,
} from './billing-access.policy';

const NOW = new Date('2026-06-15T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DEMO = {
  name: 'free',
  price_monthly: 0,
  price_yearly: 0,
  limits: { conversations: 100, messages: 1000, ai_calls: 10, agents: 2, voice_minutes: 0 },
  features: ['basic_inbox', 'contacts'],
};
const STARTER = {
  name: 'starter',
  price_monthly: 4900,
  price_yearly: 49000,
  limits: { conversations: 1000, messages: 10000, ai_calls: 100, agents: 5, voice_minutes: 60 },
  features: ['basic_inbox', 'contacts', 'ai_responses', 'analytics'],
};
const VALID_CARD = { exp_month: 12, exp_year: 2030 };

function input(overrides: Partial<BillingAccessInput> = {}): BillingAccessInput {
  return {
    organizationActive: true,
    status: 'active',
    plan: STARTER,
    paymentMethod: VALID_CARD,
    currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
    pastDueSince: null,
    cancelAtPeriodEnd: false,
    gracePeriodHours: 48,
    ...overrides,
  };
}

describe('resolveBillingAccess', () => {
  describe('demo accounts (free plan)', () => {
    it('get full access to every feature, labeled as demo, without a payment method', () => {
      const access = resolveBillingAccess(input({ plan: DEMO, paymentMethod: null }), NOW);
      expect(access).toMatchObject({
        level: BillingAccessLevel.FULL,
        is_demo: true,
        is_paid_plan: false,
        reasons: [],
        requires_action: false,
        effective_features: [PlanFeature.ALL],
      });
      expect(hasFeature(access, PlanFeature.VOICE_CALLS)).toBe(true);
      expect(hasFeature(access, PlanFeature.AUTOMATION)).toBe(true);
    });

    it('keep the demo plan limits from the database', () => {
      const access = resolveBillingAccess(input({ plan: DEMO }), NOW);
      expect(access.effective_limits).toEqual(DEMO.limits);
    });

    it('use the limits a platform admin set for the organization, per metric', () => {
      const access = resolveBillingAccess(
        input({ plan: DEMO, demoLimitOverrides: { ai_calls: 500, messages: -1 } }),
        NOW,
      );
      expect(access.effective_limits).toEqual({ ...DEMO.limits, ai_calls: 500, messages: -1 });
      expect(access.has_custom_limits).toBe(true);
    });

    it('ignore invalid override values', () => {
      const access = resolveBillingAccess(
        input({ plan: DEMO, demoLimitOverrides: { ai_calls: -5, messages: 2.5, conversations: 'x' as unknown as number } }),
        NOW,
      );
      expect(access.effective_limits).toEqual(DEMO.limits);
      expect(access.has_custom_limits).toBe(false);
    });

    describe('demo period', () => {
      const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * HOUR);

      it('keeps full access while the demo lasts and reports when it ends', () => {
        const access = resolveBillingAccess(input({ plan: DEMO, demoEndsAt: at(5 * 24) }), NOW);
        expect(access).toMatchObject({ level: BillingAccessLevel.FULL, is_demo: true, reasons: [] });
        expect(access.demo_ends_at).toBe(at(5 * 24).toISOString());
      });

      it('warns during the last 3 days', () => {
        const access = resolveBillingAccess(input({ plan: DEMO, demoEndsAt: at(72) }), NOW);
        expect(access.level).toBe(BillingAccessLevel.FULL);
        expect(access.reasons).toEqual([R.DEMO_ENDING_SOON]);
        expect(access.requires_action).toBe(true);
      });

      it('blocks everything once the demo has ended, until a plan is chosen', () => {
        const access = resolveBillingAccess(input({ plan: DEMO, demoEndsAt: at(0) }), NOW);
        expect(access).toMatchObject({ level: BillingAccessLevel.BLOCKED, is_demo: true, reasons: [R.DEMO_EXPIRED] });
        expect(access.effective_features).toEqual([]);
        expect(isOperational(access)).toBe(false);
      });

      it('never ends without an end date (free forever), with no payment required', () => {
        const access = resolveBillingAccess(input({ plan: DEMO, paymentMethod: null, demoEndsAt: null }), new Date('2099-01-01'));
        expect(access).toMatchObject({ level: BillingAccessLevel.FULL, is_demo: true, reasons: [], demo_ends_at: null });
      });

      it('does not apply to paid plans', () => {
        const access = resolveBillingAccess(input({ demoEndsAt: at(-100) }), NOW);
        expect(access).toMatchObject({ level: BillingAccessLevel.FULL, demo_ends_at: null });
      });
    });

    it('are still suspended when the organization is deactivated', () => {
      const access = resolveBillingAccess(input({ plan: DEMO, organizationActive: false }), NOW);
      expect(access.level).toBe(BillingAccessLevel.SUSPENDED);
      expect(access.is_demo).toBe(false);
    });
  });

  describe('paid plans that are paid', () => {
    it('get full access limited to the features of their plan', () => {
      const access = resolveBillingAccess(input(), NOW);
      expect(access).toMatchObject({ level: BillingAccessLevel.FULL, is_demo: false, reasons: [] });
      expect(hasFeature(access, PlanFeature.AI_RESPONSES)).toBe(true);
      expect(hasFeature(access, PlanFeature.VOICE_CALLS)).toBe(false);
      expect(access.effective_limits.voice_minutes).toBe(60);
    });

    it('keep access during a trial and are asked for a payment method', () => {
      const access = resolveBillingAccess(input({ status: 'trialing', paymentMethod: null }), NOW);
      expect(access.level).toBe(BillingAccessLevel.FULL);
      expect(access.reasons).toEqual([R.PAYMENT_METHOD_MISSING]);
      expect(access.requires_action).toBe(true);
    });

    it('are not affected by demo overrides left over from their demo', () => {
      const access = resolveBillingAccess(input({ demoLimitOverrides: { ai_calls: 999999 } }), NOW);
      expect(access.effective_limits).toEqual(STARTER.limits);
      expect(access.has_custom_limits).toBe(false);
    });

    it('report a scheduled cancellation without requiring action', () => {
      const access = resolveBillingAccess(input({ cancelAtPeriodEnd: true }), NOW);
      expect(access.level).toBe(BillingAccessLevel.FULL);
      expect(access.reasons).toEqual([R.CANCELLATION_SCHEDULED]);
      expect(access.requires_action).toBe(false);
    });
  });

  describe('payment method', () => {
    it('missing: warns while the paid period lasts', () => {
      const access = resolveBillingAccess(input({ paymentMethod: null }), NOW);
      expect(access.level).toBe(BillingAccessLevel.FULL);
      expect(access.reasons).toEqual([R.PAYMENT_METHOD_MISSING]);
    });

    it('missing: blocks once the paid period is over', () => {
      const access = resolveBillingAccess(
        input({ paymentMethod: null, currentPeriodEnd: new Date(NOW.getTime() - HOUR) }),
        NOW,
      );
      expect(access.level).toBe(BillingAccessLevel.BLOCKED);
    });

    it('expired card counts as not valid', () => {
      const access = resolveBillingAccess(input({ paymentMethod: { exp_month: 5, exp_year: 2026 } }), NOW);
      expect(access.has_valid_payment_method).toBe(false);
      expect(access.reasons).toEqual([R.PAYMENT_METHOD_EXPIRED]);
    });
  });

  describe('failed payment: 48 hour grace period', () => {
    it('keeps full access for 48 hours and reports when they end', () => {
      const since = new Date(NOW.getTime() - 47 * HOUR);
      const access = resolveBillingAccess(input({ status: 'past_due', pastDueSince: since }), NOW);
      expect(access.level).toBe(BillingAccessLevel.FULL);
      expect(access.reasons).toEqual([R.PAYMENT_PAST_DUE]);
      expect(access.grace_period_ends_at).toBe(new Date(since.getTime() + 48 * HOUR).toISOString());
      expect(access.requires_action).toBe(true);
    });

    it('blocks everything once 48 hours pass without a payment', () => {
      const access = resolveBillingAccess(
        input({ status: 'past_due', pastDueSince: new Date(NOW.getTime() - 48 * HOUR) }),
        NOW,
      );
      expect(access.level).toBe(BillingAccessLevel.BLOCKED);
      expect(access.reasons).toEqual([R.PAYMENT_PAST_DUE, R.GRACE_PERIOD_EXPIRED]);
      expect(access.effective_features).toEqual([]);
      expect(isOperational(access)).toBe(false);
    });

    it('uses the configured grace period', () => {
      const access = resolveBillingAccess(
        input({ status: 'past_due', pastDueSince: new Date(NOW.getTime() - 2 * HOUR), gracePeriodHours: 1 }),
        NOW,
      );
      expect(access.level).toBe(BillingAccessLevel.BLOCKED);
    });
  });

  it.each([
    ['unpaid', R.SUBSCRIPTION_UNPAID],
    ['incomplete', R.SUBSCRIPTION_INCOMPLETE],
    ['incomplete_expired', R.SUBSCRIPTION_INCOMPLETE],
    ['paused', R.SUBSCRIPTION_PAUSED],
    ['canceled', R.SUBSCRIPTION_CANCELED],
  ] as const)('blocks a paid plan that is %s until a payment is made', (status, reason) => {
    const access = resolveBillingAccess(input({ status }), NOW);
    expect(access.level).toBe(BillingAccessLevel.BLOCKED);
    expect(access.reasons).toContain(reason);
    expect(access.requires_action).toBe(true);
    expect(access.effective_features).toEqual([]);
    expect(access.effective_limits.messages).toBe(0);
  });

  it('suspends deactivated organizations regardless of billing', () => {
    const access = resolveBillingAccess(input({ organizationActive: false }), NOW);
    expect(access.level).toBe(BillingAccessLevel.SUSPENDED);
    expect(access.reasons).toEqual([R.ORGANIZATION_INACTIVE]);
  });
});

describe('feature and limit helpers', () => {
  it("treats the 'all' feature as every feature", () => {
    const access = resolveBillingAccess(input({ plan: { ...STARTER, features: ['all'] } }), NOW);
    expect(hasFeature(access, PlanFeature.AUTOMATION)).toBe(true);
  });

  it('never grants features to a blocked org, even with "all"', () => {
    const access = resolveBillingAccess(input({ status: 'unpaid', plan: { ...STARTER, features: ['all'] } }), NOW);
    expect(hasFeature(access, PlanFeature.CONTACTS)).toBe(false);
  });

  it('returns -1 for unlimited metrics and fills missing ones with 0', () => {
    const access = resolveBillingAccess(input({ plan: { ...STARTER, limits: { messages: -1 } } }), NOW);
    expect(limitFor(access, 'messages')).toBe(-1);
    expect(limitFor(access, 'voice_minutes')).toBe(0);
  });
});

describe('resolveDemoEndsAt', () => {
  const created = new Date('2026-06-01T00:00:00Z');

  it("uses the organization's stored end date, including no end date", () => {
    expect(resolveDemoEndsAt({ demo_ends_at: new Date('2026-07-01T00:00:00Z') }, created, 7)).toEqual(new Date('2026-07-01T00:00:00Z'));
    expect(resolveDemoEndsAt({ demo_ends_at: null }, created, 7)).toBeNull();
  });

  it('starts the demo at signup when the organization has no billing row yet', () => {
    expect(resolveDemoEndsAt(null, created, 7)).toEqual(new Date('2026-06-08T00:00:00Z'));
  });

  it('has no end when demos are configured without one', () => {
    expect(resolveDemoEndsAt(null, created, null)).toBeNull();
  });
});

describe('isPaymentMethodExpired', () => {
  it('considers a card valid through the end of its expiry month', () => {
    expect(isPaymentMethodExpired({ exp_month: 6, exp_year: 2026 }, NOW)).toBe(false);
    expect(isPaymentMethodExpired({ exp_month: 5, exp_year: 2026 }, NOW)).toBe(true);
  });

  it('never expires methods without an expiry (e.g. bank debits)', () => {
    expect(isPaymentMethodExpired({ exp_month: null, exp_year: null }, NOW)).toBe(false);
  });
});
