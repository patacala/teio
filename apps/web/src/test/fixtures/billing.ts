import { BillingAccessLevel, BillingRestrictionReason } from '@crm/shared';
import type { BillingAccess, BillingOverview, BillingPlan } from '@crm/shared';

export const DEMO_LIMITS = { conversations: 100, messages: 1000, ai_calls: 10, agents: 2, voice_minutes: 0 };

export const DEMO_PLAN: BillingPlan = {
  id: 'plan-free', name: 'free', price_monthly: 0, price_yearly: 0, currency: 'usd',
  limits: DEMO_LIMITS, features: ['basic_inbox', 'contacts'], sort_order: 0, is_paid: false,
};

export const PRO_PLAN: BillingPlan = {
  id: 'plan-pro', name: 'professional', price_monthly: 14900, price_yearly: 149000, currency: 'usd',
  limits: { ...DEMO_LIMITS, voice_minutes: 600 }, features: ['ai_responses', 'voice_calls'], sort_order: 2, is_paid: true,
};

/** Defaults to a demo organization in good standing. */
export function billingAccess(overrides: Partial<BillingAccess> = {}): BillingAccess {
  return {
    level: BillingAccessLevel.FULL, is_demo: true, status: 'active', reasons: [], requires_action: false,
    is_paid_plan: false, has_valid_payment_method: false, grace_period_ends_at: null,
    plan_name: 'free', effective_plan_name: 'free', effective_limits: DEMO_LIMITS, effective_features: ['all'],
    has_custom_limits: false,
    demo_ends_at: null,
    ...overrides,
  };
}

export function paidAccess(overrides: Partial<BillingAccess> = {}): BillingAccess {
  return billingAccess({
    is_demo: false, is_paid_plan: true, has_valid_payment_method: true, plan_name: 'professional',
    effective_plan_name: 'professional', effective_features: PRO_PLAN.features, ...overrides,
  });
}

export function blockedAccess(reason = BillingRestrictionReason.SUBSCRIPTION_UNPAID, overrides: Partial<BillingAccess> = {}): BillingAccess {
  return paidAccess({
    level: BillingAccessLevel.BLOCKED, status: 'unpaid', reasons: [reason], requires_action: true,
    effective_plan_name: 'none', effective_features: [], ...overrides,
  });
}

export function billingOverview(
  overrides: { plan?: BillingPlan; access?: BillingAccess; live?: boolean; sub?: Partial<BillingOverview['subscription']> } = {},
): BillingOverview {
  const plan = overrides.plan ?? DEMO_PLAN;
  return {
    subscription: {
      id: 'sub-row', organization_id: 'org-1', plan, stripe_customer_id: overrides.live ? 'cus_1' : null,
      stripe_subscription_id: overrides.live ? 'sub_1' : null, status: 'active', billing_period: 'monthly',
      current_period_start: '2026-06-01T00:00:00Z', current_period_end: '2026-07-01T00:00:00Z',
      trial_end: null, cancel_at_period_end: false, past_due_since: null, payment_method: null,
      ...overrides.sub,
    },
    usage: { organization_id: 'org-1', period_start: '', period_end: '', conversations: 12, messages: 340, ai_calls: 2, voice_minutes: 0, agents: 1 },
    limits: DEMO_LIMITS,
    access: overrides.access ?? (plan.is_paid ? paidAccess() : billingAccess()),
    has_live_subscription: overrides.live ?? false,
  };
}
