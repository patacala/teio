/// <reference types="jest" />
import { BillingRestrictionReason } from '@crm/shared';
import type { PlanLimits, SubscriptionStatus } from '@crm/shared';
import { resolveBillingAccess } from '../billing/billing-access.policy';
import type { BillingAccessInput } from '../billing/billing-access.policy';
import {
  buildInsight,
  cardExpiresBeforeRenewal,
  classifyOrganization,
  compareAttention,
  formatDuration,
  isAtRisk,
  leadAttention,
  leadName,
  monthlyRecurringRevenue,
  organizationAttention,
  riskFlags,
  usagePeak,
} from './organization-insights';
import type { DemoRequestFacts, OrganizationFacts, OrganizationInsight } from './organization-insights';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

const FREE = { name: 'free', price_monthly: 0, price_yearly: 0 };
const PRO = { name: 'professional', price_monthly: 14900, price_yearly: 149000 };
const DEMO_LIMITS: PlanLimits = { conversations: 100, messages: 1000, ai_calls: 10, agents: 2, voice_minutes: 0 };
const PRO_LIMITS: PlanLimits = { conversations: 10000, messages: 100000, ai_calls: 1000, agents: 20, voice_minutes: 600 };
const VALID_CARD = { exp_month: 12, exp_year: 2030 };

interface Scenario {
  plan?: { name: string; price_monthly: number; price_yearly: number };
  status?: SubscriptionStatus;
  active?: boolean;
  internal?: boolean;
  card?: { exp_month: number; exp_year: number } | null;
  periodEnd?: Date;
  pastDueSince?: Date | null;
  cancelAtPeriodEnd?: boolean;
  demoEndsAt?: Date | null;
  billingPeriod?: 'monthly' | 'yearly';
  usage?: Partial<OrganizationFacts['usage']>;
  createdAt?: Date;
  channels?: number;
  hasConversations?: boolean;
  owner?: string | null;
}

/** An organization classified by the real billing policy, exactly as the service does it. */
function insight(s: Scenario = {}): OrganizationInsight {
  const plan = s.plan ?? FREE;
  const paid = plan.price_monthly > 0 || plan.price_yearly > 0;
  const card = s.card === undefined ? (paid ? VALID_CARD : null) : s.card;
  const input: BillingAccessInput = {
    organizationActive: s.active ?? true,
    status: s.status ?? 'active',
    plan: { ...plan, limits: paid ? PRO_LIMITS : DEMO_LIMITS, features: paid ? ['analytics'] : [] },
    paymentMethod: card,
    currentPeriodEnd: s.periodEnd ?? at(20 * DAY),
    pastDueSince: s.pastDueSince ?? null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
    gracePeriodHours: 48,
    demoEndsAt: s.demoEndsAt === undefined ? at(10 * DAY) : s.demoEndsAt,
  };
  const access = resolveBillingAccess(input, NOW);
  const facts: OrganizationFacts = {
    id: 'org-1',
    name: 'Acme Dental',
    slug: 'acme-dental',
    is_active: s.active ?? true,
    is_internal: s.internal ?? false,
    created_at: s.createdAt ?? at(-40 * DAY),
    owner_email: s.owner === undefined ? 'olivia@acme.test' : s.owner,
    plan_id: 'plan-1',
    plan_name: plan.name,
    price_monthly: plan.price_monthly,
    price_yearly: plan.price_yearly,
    subscription_status: input.status,
    billing_period: s.billingPeriod ?? 'monthly',
    current_period_end: input.currentPeriodEnd,
    cancel_at_period_end: input.cancelAtPeriodEnd,
    payment_method_exp_month: card?.exp_month ?? null,
    payment_method_exp_year: card?.exp_year ?? null,
    canceled_at: null,
    usage: { conversations: 0, messages: 0, ai_calls: 0, voice_minutes: 0, agents: 1, ...s.usage },
    members: 1,
    channels: s.channels ?? 1,
    has_conversations: s.hasConversations ?? true,
    last_activity_at: null,
    first_paid_at: null,
    lifetime_revenue: 0,
  };
  return buildInsight(facts, access);
}

const kinds = (org: OrganizationInsight) => organizationAttention(org, NOW).map((item) => item.kind);

describe('classifyOrganization (via the billing access policy)', () => {
  it.each<[string, Scenario, string]>([
    ['a paid plan in good standing', { plan: PRO }, 'paying'],
    ['a paid plan inside the grace period', { plan: PRO, status: 'past_due', pastDueSince: at(-10 * HOUR) }, 'paying'],
    ['a paid plan after the grace period', { plan: PRO, status: 'past_due', pastDueSince: at(-3 * DAY) }, 'payment_failed'],
    ['an unpaid subscription', { plan: PRO, status: 'unpaid' }, 'payment_failed'],
    ['a cancelled paid subscription', { plan: PRO, status: 'canceled' }, 'churned'],
    ['a running demo', {}, 'demo'],
    ['a demo with no end date', { demoEndsAt: null }, 'demo'],
    ['a demo whose end date passed', { demoEndsAt: at(-DAY) }, 'demo_expired'],
    ['a deactivated organization', { plan: PRO, active: false }, 'suspended'],
    ['a deactivated demo', { active: false }, 'suspended'],
  ])('%s → %s', (_label, scenario, expected) => {
    expect(insight(scenario).state).toBe(expected);
  });

  it('never counts an inactive organization as paying, whatever its access says', () => {
    const org = insight({ plan: PRO });
    expect(classifyOrganization(org.access, false)).toBe('suspended');
  });
});

describe('monthlyRecurringRevenue', () => {
  it('uses the monthly price, or a twelfth of the yearly price for yearly billing', () => {
    expect(monthlyRecurringRevenue(PRO, 'monthly')).toBe(14900);
    expect(monthlyRecurringRevenue(PRO, 'yearly')).toBe(12417);
  });

  it('falls back to the price the plan has', () => {
    expect(monthlyRecurringRevenue({ price_monthly: 0, price_yearly: 120000 }, 'monthly')).toBe(10000);
    expect(monthlyRecurringRevenue({ price_monthly: 4900, price_yearly: 0 }, 'yearly')).toBe(4900);
    expect(monthlyRecurringRevenue(FREE, 'monthly')).toBe(0);
  });

  it('is what a paying (or recoverable) organization is worth, and zero otherwise', () => {
    expect(insight({ plan: PRO }).mrr).toBe(14900);
    expect(insight({ plan: PRO, billingPeriod: 'yearly' }).mrr).toBe(12417);
    expect(insight({ plan: PRO, status: 'unpaid' }).mrr).toBe(14900);
    expect(insight({ plan: PRO, status: 'canceled' }).mrr).toBe(0);
    expect(insight({ plan: PRO, active: false }).mrr).toBe(0);
    expect(insight().mrr).toBe(0);
  });
});

describe('usagePeak', () => {
  it('returns the metric closest to its limit, ignoring unlimited and excluded metrics', () => {
    const usage = { conversations: 50, messages: 900, ai_calls: 3, voice_minutes: 5, agents: 1 };
    const limits = { conversations: 100, messages: 1000, ai_calls: -1, voice_minutes: 0, agents: 2 };
    expect(usagePeak(usage, limits)).toEqual({ metric: 'messages', used: 900, limit: 1000, percent: 90 });
  });

  it('reports usage over the limit as more than 100%', () => {
    const usage = { conversations: 0, messages: 0, ai_calls: 15, voice_minutes: 0, agents: 0 };
    expect(usagePeak(usage, DEMO_LIMITS)).toMatchObject({ metric: 'ai_calls', percent: 150 });
  });

  it('is null when nothing is used', () => {
    expect(usagePeak({ conversations: 0, messages: 0, ai_calls: 0, voice_minutes: 0, agents: 0 }, DEMO_LIMITS)).toBeNull();
  });

  it('is not computed for blocked organizations (they have no limits left)', () => {
    expect(insight({ demoEndsAt: at(-DAY), usage: { messages: 900 } }).usage_peak).toBeNull();
  });
});

describe('revenue at risk', () => {
  it('flags past-due, scheduled cancellations, payment method problems and failed payments', () => {
    expect(riskFlags(insight({ plan: PRO, status: 'past_due', pastDueSince: at(-HOUR) }), NOW).past_due).toBe(true);
    expect(riskFlags(insight({ plan: PRO, cancelAtPeriodEnd: true }), NOW).cancel_scheduled).toBe(true);
    expect(riskFlags(insight({ plan: PRO, card: null }), NOW).payment_method_issue).toBe(true);
    expect(riskFlags(insight({ plan: PRO, status: 'unpaid' }), NOW).payment_failed).toBe(true);
  });

  it('does not flag healthy paying organizations, demos or churned ones', () => {
    expect(isAtRisk(riskFlags(insight({ plan: PRO }), NOW))).toBe(false);
    expect(isAtRisk(riskFlags(insight(), NOW))).toBe(false);
    expect(isAtRisk(riskFlags(insight({ plan: PRO, status: 'canceled' }), NOW))).toBe(false);
  });

  it('knows when the saved card stops working before the next renewal', () => {
    const renewsJuly20 = { plan: PRO, periodEnd: new Date('2026-07-20T00:00:00Z') };
    expect(cardExpiresBeforeRenewal(insight({ ...renewsJuly20, card: { exp_month: 6, exp_year: 2026 } }), NOW)).toBe(true);
    expect(cardExpiresBeforeRenewal(insight({ ...renewsJuly20, card: { exp_month: 7, exp_year: 2026 } }), NOW)).toBe(false);
    expect(cardExpiresBeforeRenewal(insight({ ...renewsJuly20, card: VALID_CARD }), NOW)).toBe(false);
  });
});

describe('organizationAttention', () => {
  it('a paid organization in its grace period is critical, with the time left', () => {
    const [item] = organizationAttention(insight({ plan: PRO, status: 'past_due', pastDueSince: at(-42 * HOUR) }), NOW);
    expect(item).toMatchObject({
      kind: 'grace_ending',
      urgency: 'critical',
      reason: 'Grace ends in 6h',
      amount: 14900,
      target: { type: 'organization', id: 'org-1', name: 'Acme Dental', slug: 'acme-dental', email: 'olivia@acme.test' },
    });
    expect(item.detail).toBe('Professional · $149/mo · olivia@acme.test');
    expect(item.at).toBe(at(6 * HOUR).toISOString());
  });

  it('a blocked paid organization is critical and says why', () => {
    const [item] = organizationAttention(insight({ plan: PRO, status: 'past_due', pastDueSince: at(-3 * DAY) }), NOW);
    expect(item).toMatchObject({ kind: 'payment_failed', urgency: 'critical', reason: 'Blocked: payment failed', amount: 14900 });
    expect(organizationAttention(insight({ plan: PRO, status: 'unpaid' }), NOW)[0].reason).toBe('Blocked: unpaid');
  });

  it('warns about scheduled cancellations and cards that will not pay the renewal', () => {
    const cancelling = organizationAttention(insight({ plan: PRO, cancelAtPeriodEnd: true, periodEnd: new Date('2026-06-30T00:00:00Z') }), NOW);
    expect(cancelling).toEqual([expect.objectContaining({ kind: 'cancel_scheduled', urgency: 'warning', reason: 'Cancels Jun 30' })]);

    const expiring = insight({ plan: PRO, card: { exp_month: 6, exp_year: 2026 }, periodEnd: new Date('2026-07-20T00:00:00Z') });
    expect(organizationAttention(expiring, NOW)).toEqual([expect.objectContaining({ kind: 'payment_method_issue', reason: 'Card expires 06/26' })]);
    expect(organizationAttention(insight({ plan: PRO, card: null }), NOW)[0].reason).toBe('No payment method');
  });

  it('flags paying organizations close to a limit as upgrade candidates', () => {
    const [item] = organizationAttention(insight({ plan: PRO, usage: { ai_calls: 950 } }), NOW);
    expect(item).toMatchObject({ kind: 'at_limit', urgency: 'warning', reason: '95% of AI calls' });
    expect(kinds(insight({ plan: PRO, usage: { ai_calls: 890 } }))).toEqual([]);
  });

  it('flags demos ending within 3 days only when they are really used', () => {
    const hot = insight({ demoEndsAt: at(2 * DAY + HOUR), usage: { messages: 920 } });
    expect(organizationAttention(hot, NOW)).toEqual([
      expect.objectContaining({ kind: 'hot_demo', reason: 'Demo ends in 2 days', detail: '92% of messages used · Demo · olivia@acme.test' }),
    ]);
    expect(kinds(insight({ demoEndsAt: at(2 * DAY), usage: { messages: 100 } }))).toEqual([]);
    expect(kinds(insight({ demoEndsAt: at(5 * DAY), usage: { messages: 920 } }))).toEqual([]);
  });

  it('does not count seats as demo engagement (one member is already half of 2 seats)', () => {
    const org = insight({ demoEndsAt: at(2 * DAY), usage: { agents: 2, messages: 10 } });
    expect(org.usage_peak).toMatchObject({ metric: 'agents', percent: 100 });
    expect(kinds(org)).toEqual([]);
  });

  it('flags demos with nothing set up after 3 days, until they are a month old', () => {
    const idle = { channels: 0, hasConversations: false };
    expect(organizationAttention(insight({ ...idle, createdAt: at(-5 * DAY) }), NOW)).toEqual([
      expect.objectContaining({ kind: 'not_activated', reason: 'No channel after 5 days' }),
    ]);
    expect(kinds(insight({ ...idle, createdAt: at(-2 * DAY) }))).toEqual([]);
    expect(kinds(insight({ ...idle, createdAt: at(-31 * DAY) }))).toEqual([]);
    expect(kinds(insight({ channels: 0, hasConversations: true, createdAt: at(-5 * DAY) }))).toEqual([]);
  });

  it('never reports internal organizations', () => {
    expect(organizationAttention(insight({ plan: PRO, status: 'unpaid', internal: true }), NOW)).toEqual([]);
  });

  it('leaves out the owner when the organization has none', () => {
    const [item] = organizationAttention(insight({ plan: PRO, status: 'unpaid', owner: null }), NOW);
    expect(item.detail).toBe('Professional · $149/mo');
  });

  it('orders critical first, then money at stake, then what is due first', () => {
    const item = (urgency: 'critical' | 'warning', amount: number | null, hours: number) =>
      ({ urgency, amount, at: at(hours * HOUR).toISOString() }) as Parameters<typeof compareAttention>[0];
    const sorted = [item('warning', 99999, 1), item('critical', null, 5), item('critical', 4900, 9), item('critical', 4900, 2)].sort(
      compareAttention,
    );
    expect(sorted.map((i) => [i.urgency, i.amount, i.at])).toEqual([
      ['critical', 4900, at(2 * HOUR).toISOString()],
      ['critical', 4900, at(9 * HOUR).toISOString()],
      ['critical', null, at(5 * HOUR).toISOString()],
      ['warning', 99999, at(HOUR).toISOString()],
    ]);
  });
});

describe('leadAttention', () => {
  const lead = (overrides: Partial<DemoRequestFacts> = {}): DemoRequestFacts => ({
    id: 'lead-1',
    status: 'processing',
    error_message: null,
    created_at: at(-2 * HOUR),
    demo_type: 'ai_voice',
    first_name: 'Lina',
    last_name: 'Park',
    email: 'lina@brightside.test',
    company: 'Brightside Legal',
    ...overrides,
  });

  it('reports failed demo generations with the error', () => {
    expect(leadAttention(lead({ status: 'failed', error_message: 'Website unreachable' }), NOW)).toMatchObject({
      kind: 'demo_request_failed',
      urgency: 'critical',
      reason: 'Demo generation failed',
      detail: 'AI voice demo · Brightside Legal · Website unreachable',
      target: { type: 'lead', id: 'lead-1', name: 'Lina Park', email: 'lina@brightside.test', company: 'Brightside Legal' },
    });
  });

  it('reports demos still generating after 30 minutes as stuck', () => {
    expect(leadAttention(lead(), NOW)).toMatchObject({ kind: 'demo_request_stuck', reason: 'Stuck for 2h' });
    expect(leadAttention(lead({ created_at: at(-10 * 60 * 1000) }), NOW)).toBeNull();
  });

  it('ignores ready demos and anything older than 14 days', () => {
    expect(leadAttention(lead({ status: 'ready' }), NOW)).toBeNull();
    expect(leadAttention(lead({ status: 'failed', created_at: at(-15 * DAY) }), NOW)).toBeNull();
  });

  it('names the lead by name, then email', () => {
    expect(leadName({ first_name: ' Lina ', last_name: null, email: 'x@y.z' })).toBe('Lina');
    expect(leadName({ first_name: null, last_name: null, email: 'x@y.z' })).toBe('x@y.z');
    expect(leadName({ first_name: null, last_name: null, email: null })).toBe('Unknown lead');
  });
});

describe('formatDuration', () => {
  it.each([
    [20 * 60 * 1000, 'less than 1h'],
    [6 * HOUR + 59 * 60 * 1000, '6h'],
    [DAY, '1 day'],
    [3 * DAY + 5 * HOUR, '3 days'],
  ])('%d ms → %s', (ms, text) => expect(formatDuration(ms)).toBe(text));
});

it('keeps the restriction reasons from the policy on the insight', () => {
  expect(insight({ plan: PRO, card: null }).access.reasons).toContain(BillingRestrictionReason.PAYMENT_METHOD_MISSING);
});
