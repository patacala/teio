import { BillingAccessLevel, BillingRestrictionReason } from '@crm/shared';
import type { BillingInvoice, BillingOverview, BillingPlan, DemoLimitDefaults, DemoOrganization } from '@crm/shared';
import { billingAccess, billingOverview, blockedAccess, DEMO_LIMITS, DEMO_PLAN, paidAccess } from '@/test/fixtures/billing';

/** The plans seeded by packages/database/schemas/013_billing.sql. */
const plan = (id: string, name: string, monthly: number, limits: BillingPlan['limits'], features: string[], sort_order: number): BillingPlan => ({
  id, name, price_monthly: monthly, price_yearly: monthly * 10, currency: 'usd', limits, features, sort_order, is_paid: monthly > 0,
});
export const STARTER = plan('plan-starter', 'starter', 4900, { conversations: 1000, messages: 10000, ai_calls: 100, agents: 5, voice_minutes: 60 }, ['basic_inbox', 'contacts', 'ai_responses', 'analytics'], 1);
export const PROFESSIONAL = plan('plan-pro', 'professional', 14900, { conversations: 10000, messages: 100000, ai_calls: 1000, agents: 20, voice_minutes: 600 }, ['basic_inbox', 'contacts', 'ai_responses', 'analytics', 'voice_calls', 'automation'], 2);
export const ENTERPRISE = plan('plan-enterprise', 'enterprise', 49900, { conversations: -1, messages: -1, ai_calls: -1, agents: -1, voice_minutes: -1 }, ['all'], 3);
export const PLANS: BillingPlan[] = [DEMO_PLAN, STARTER, PROFESSIONAL, ENTERPRISE];

/** A Professional-plan overview; usage is measured against the plan's own limits. */
const professional = (options: Parameters<typeof billingOverview>[0]): BillingOverview => ({
  ...billingOverview({ plan: PROFESSIONAL, ...options }),
  limits: PROFESSIONAL.limits,
});

export const VISA = { type: 'card', brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030, is_expired: false };

export const INVOICES: BillingInvoice[] = [
  ['inv-3', '2026-06-01T00:00:00.000Z', 'paid'],
  ['inv-2', '2026-05-01T00:00:00.000Z', 'paid'],
  ['inv-1', '2026-04-01T00:00:00.000Z', 'void'],
].map(([id, created_at, status]) => ({
  id,
  stripe_invoice_id: `in_${id}`,
  amount_due: 14900,
  amount_paid: status === 'paid' ? 14900 : 0,
  currency: 'usd',
  status: status as BillingInvoice['status'],
  invoice_url: `https://invoice.stripe.test/${id}`,
  invoice_pdf: `https://invoice.stripe.test/${id}.pdf`,
  period_start: created_at,
  period_end: created_at,
  paid_at: status === 'paid' ? created_at : null,
  created_at,
}));

export const PAID = professional({ live: true, sub: { payment_method: VISA } });

export const PAST_DUE = professional({
  live: true,
  sub: { status: 'past_due', past_due_since: '2026-06-14T12:00:00.000Z', payment_method: { ...VISA, exp_year: 2026, exp_month: 5, is_expired: true } },
  access: paidAccess({
    status: 'past_due',
    requires_action: true,
    has_valid_payment_method: false,
    reasons: [BillingRestrictionReason.PAYMENT_PAST_DUE, BillingRestrictionReason.PAYMENT_METHOD_EXPIRED],
    grace_period_ends_at: '2026-06-16T12:00:00.000Z',
  }),
});

export const BLOCKED = professional({
  live: true,
  sub: { status: 'unpaid', payment_method: VISA },
  access: blockedAccess(BillingRestrictionReason.SUBSCRIPTION_UNPAID),
});

export const CANCELED = professional({
  sub: { status: 'canceled' },
  access: blockedAccess(BillingRestrictionReason.SUBSCRIPTION_CANCELED, { status: 'canceled' }),
});

export const DEMO_DEFAULTS: DemoLimitDefaults = { plan_id: 'plan-free', limits: DEMO_LIMITS, demo_duration_days: 7, updated_at: '2026-06-01T00:00:00.000Z' };

function demoOrg(
  index: number,
  name: string,
  usage: DemoOrganization['usage'],
  overrides: DemoOrganization['limit_overrides'],
  demoEndsAt: string | null,
  isActive = true,
): DemoOrganization {
  return {
    organization_id: `0e6f2f3c-1c58-4c4f-9b2a-3d7c2b8f9a1${index}`,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    is_active: isActive,
    created_at: `2026-0${3 + index}-02T10:00:00.000Z`,
    usage,
    limit_overrides: overrides,
    effective_limits: { ...DEMO_LIMITS, ...overrides },
    limits_updated_at: Object.keys(overrides).length ? '2026-06-10T10:00:00.000Z' : null,
    demo_ends_at: demoEndsAt,
    demo_period_updated_at: demoEndsAt === null ? '2026-06-12T09:00:00.000Z' : null,
  };
}

export const DEMO_ORGS: DemoOrganization[] = [
  demoOrg(0, 'Acme Dental', { conversations: 12, messages: 850, ai_calls: 10, voice_minutes: 0, agents: 2 }, {}, '2026-06-20T12:00:00.000Z'),
  demoOrg(1, 'Brightside Legal', { conversations: 40, messages: 310, ai_calls: 120, voice_minutes: 0, agents: 3 }, { ai_calls: 500, agents: 5 }, null),
  demoOrg(2, 'Cedar Clinic', { conversations: 0, messages: 0, ai_calls: 0, voice_minutes: 0, agents: 1 }, { messages: -1 }, '2026-06-10T00:00:00.000Z', false),
];

/** Demo accounts at fixed points of their demo (the tests run at 2026-06-15 12:00 UTC). */
export const DEMO_5_DAYS_LEFT = billingAccess({ demo_ends_at: '2026-06-20T12:00:00.000Z' });
export const DEMO_ENDING_SOON = billingAccess({
  demo_ends_at: '2026-06-17T12:00:00.000Z',
  requires_action: true,
  reasons: [BillingRestrictionReason.DEMO_ENDING_SOON],
});
export const DEMO_ENDED = billingAccess({
  level: BillingAccessLevel.BLOCKED,
  demo_ends_at: '2026-06-12T12:00:00.000Z',
  requires_action: true,
  reasons: [BillingRestrictionReason.DEMO_EXPIRED],
  effective_plan_name: 'none',
  effective_features: [],
});
