import { BillingRestrictionReason, DemoRequestStatus, DemoType, PLATFORM_ORGANIZATION_FILTERS } from '@crm/shared';
import type {
  PaginatedResponse,
  PlatformAttention,
  PlatformAttentionItem,
  PlatformLead,
  PlatformOrganizationCounts,
  PlatformOrganizationRow,
  PlatformOrganizationsPage,
  PlatformOverview,
} from '@crm/shared';

/**
 * A small platform, the same one the API integration test seeds: two paying
 * organizations (one past due), one blocked, one churned, three demos.
 * Dates are relative to 2026-06-15 (the visual tests' fixed "now").
 */

export const ACME_ID = '0e6f2f3c-1c58-4c4f-9b2a-3d7c2b8f9a10';
export const CEDAR_ID = '5b2d8a61-7c3e-4a9f-8e21-6f4b3c2d1e09';

export function platformOverview(overrides: Partial<PlatformOverview> = {}): PlatformOverview {
  return {
    period: {
      from: '2026-05-16T12:00:00.000Z',
      to: '2026-06-15T12:00:00.000Z',
      days: 30,
      previous_from: '2026-04-16T12:00:00.000Z',
      previous_to: '2026-05-16T12:00:00.000Z',
    },
    currency: 'usd',
    money: {
      mrr: 1898300,
      mrr_last_month: 1490000,
      arr: 22779600,
      paying_organizations: 42,
      average_revenue_per_organization: 45198,
      cash_collected: 1724000,
      cash_collected_previous: 1539000,
      outstanding: 149000,
      outstanding_invoices: 3,
      at_risk: { amount: 1898300 - 1490000, organizations: 4, past_due: 1, cancel_scheduled: 1, payment_method_issue: 1, payment_failed: 1 },
      new_paying: 5,
      churned: 1,
    },
    growth: {
      leads: { total: 38, previous: 34, demo_requests: 29, signups: 9 },
      demos: { active: 17, ending_7d: 4, no_end_date: 2 },
      conversion: { rate: 33, converted: 5, expired_unpaid: 10 },
    },
    lead_funnel: [
      { key: 'form_started', count: 64 },
      { key: 'submitted', count: 29 },
      { key: 'ready', count: 26 },
      { key: 'opened', count: 18 },
      { key: 'signed_up', count: 7 },
      { key: 'paid', count: 2 },
    ],
    signups: { signups: 9, activated: 6, paid: 1 },
    revenue_by_month: [
      ['2025-07', 610000, null], ['2025-08', 720000, null], ['2025-09', 805000, null], ['2025-10', 910000, null],
      ['2025-11', 980000, null], ['2025-12', 1050000, null], ['2026-01', 1110000, 1120000], ['2026-02', 1180000, 1210000],
      ['2026-03', 1290000, 1330000], ['2026-04', 1370000, 1420000], ['2026-05', 1539000, 1490000], ['2026-06', 1724000, 1898300],
    ].map(([month, collected, mrr]) => ({ month: month as string, collected: collected as number, mrr: mrr as number | null })),
    generated_at: '2026-06-15T12:00:00.000Z',
    ...overrides,
  };
}

function attentionItem(item: Partial<PlatformAttentionItem> & Pick<PlatformAttentionItem, 'kind' | 'target' | 'reason'>): PlatformAttentionItem {
  return {
    id: `${item.kind}:${item.target.id}`,
    urgency: 'warning',
    detail: '',
    amount: null,
    at: '2026-06-15T12:00:00.000Z',
    ...item,
  };
}

export const ATTENTION_ITEMS: PlatformAttentionItem[] = [
  attentionItem({
    kind: 'payment_failed', urgency: 'critical', reason: 'Blocked: unpaid', amount: 14900,
    target: { type: 'organization', id: CEDAR_ID, name: 'Cedar Clinic', slug: 'cedar-clinic', email: 'owner@cedar.test' },
    detail: 'Professional · $149/mo · owner@cedar.test',
  }),
  attentionItem({
    kind: 'grace_ending', urgency: 'critical', reason: 'Grace ends in 1 day', amount: 4083,
    target: { type: 'organization', id: 'org-beacon', name: 'Beacon Law', slug: 'beacon-law', email: null },
    detail: 'Starter · $40.83/mo',
  }),
  attentionItem({
    kind: 'demo_request_failed', urgency: 'critical', reason: 'Demo generation failed',
    target: { type: 'lead', id: 'lead-nora', name: 'Nora Quinn', email: 'nora@north.test', company: 'Northwind' },
    detail: 'AI voice demo · Northwind · Website unreachable',
  }),
  attentionItem({
    kind: 'hot_demo', reason: 'Demo ends in 2 days',
    target: { type: 'organization', id: 'org-echo', name: 'Echo Studio', slug: 'echo-studio', email: 'lina@echo.test' },
    detail: '92% of messages used · Demo · lina@echo.test',
  }),
  attentionItem({
    kind: 'not_activated', reason: 'No channel after 4 days',
    target: { type: 'organization', id: 'org-gale', name: 'Gale Realty', slug: 'gale-realty', email: 'hi@gale.test' },
    detail: 'Signed up Jun 11 · Demo · hi@gale.test',
  }),
];

export function platformAttention(items: PlatformAttentionItem[] = ATTENTION_ITEMS): PlatformAttention {
  return {
    items,
    counts: {
      critical: items.filter((item) => item.urgency === 'critical').length,
      warning: items.filter((item) => item.urgency === 'warning').length,
    },
  };
}

function lead(overrides: Partial<PlatformLead> & Pick<PlatformLead, 'id' | 'source' | 'name'>): PlatformLead {
  return {
    email: null,
    company: null,
    created_at: '2026-06-14T09:00:00.000Z',
    demo_type: null,
    demo_status: null,
    demo_opens: null,
    organization: null,
    ...overrides,
  };
}

export const LEADS: PlatformLead[] = [
  lead({ id: 'lead-omar', source: 'demo_request', name: 'Omar Diaz', email: 'omar@orbit.test', company: 'Orbit', demo_type: DemoType.CRM, demo_status: DemoRequestStatus.PROCESSING, demo_opens: 0, created_at: '2026-06-15T10:00:00.000Z' }),
  lead({ id: 'lead-nora', source: 'demo_request', name: 'Nora Quinn', email: 'nora@north.test', company: 'Northwind', demo_type: DemoType.AI_VOICE, demo_status: DemoRequestStatus.FAILED, demo_opens: 0, created_at: '2026-06-14T11:00:00.000Z' }),
  lead({
    id: 'lead-lina', source: 'demo_request', name: 'Lina Park', email: 'lina@echo.test', company: 'Echo Studio', demo_type: DemoType.LIVE_CHAT,
    demo_status: DemoRequestStatus.READY, demo_opens: 2, created_at: '2026-06-12T11:00:00.000Z',
    organization: { id: 'org-echo', name: 'Echo Studio', state: 'demo' },
  }),
  lead({ id: 'org-gale', source: 'signup', name: 'Gale Realty', email: 'hi@gale.test', created_at: '2026-06-11T08:00:00.000Z', organization: { id: 'org-gale', name: 'Gale Realty', state: 'demo' } }),
  lead({
    id: 'lead-mark', source: 'demo_request', name: 'Mark Ruiz', email: 'mark@acme.test', company: 'Acme Dental', demo_type: DemoType.LIVE_CHAT,
    demo_status: DemoRequestStatus.READY, demo_opens: 0, created_at: '2026-06-05T11:00:00.000Z',
    organization: { id: ACME_ID, name: 'Acme Dental', state: 'paying' },
  }),
];

export function paginated<T>(items: T[], total = items.length, page = 1, limit = 10): PaginatedResponse<T> {
  const total_pages = Math.max(1, Math.ceil(total / limit));
  return { items, meta: { total, page, limit, total_pages, has_next: page < total_pages, has_prev: page > 1 } };
}

function organization(overrides: Partial<PlatformOrganizationRow> & Pick<PlatformOrganizationRow, 'id' | 'name' | 'state'>): PlatformOrganizationRow {
  return {
    slug: overrides.name.toLowerCase().replace(/\W+/g, '-'),
    owner_email: null,
    created_at: '2025-05-01T10:00:00.000Z',
    is_active: true,
    is_internal: false,
    reasons: [],
    plan_name: 'free',
    subscription_status: 'active',
    billing_period: 'monthly',
    mrr: 0,
    demo_ends_at: null,
    renews_at: null,
    usage_peak: null,
    members: 1,
    channels: 1,
    last_activity_at: '2026-06-15T09:00:00.000Z',
    lifetime_revenue: 0,
    ...overrides,
  };
}

export const ORGANIZATIONS: PlatformOrganizationRow[] = [
  organization({
    id: ACME_ID, name: 'Acme Dental', state: 'paying', owner_email: 'mark@acme.test', plan_name: 'professional', mrr: 14900,
    renews_at: '2026-07-05T00:00:00.000Z', members: 4, channels: 2, lifetime_revenue: 178800,
    usage_peak: { metric: 'ai_calls', used: 950, limit: 1000, percent: 95 },
  }),
  organization({
    id: CEDAR_ID, name: 'Cedar Clinic', state: 'payment_failed', owner_email: 'owner@cedar.test', plan_name: 'professional', mrr: 14900,
    subscription_status: 'unpaid', reasons: [BillingRestrictionReason.SUBSCRIPTION_UNPAID], renews_at: '2026-06-10T00:00:00.000Z',
    last_activity_at: '2026-06-09T09:00:00.000Z', lifetime_revenue: 44700,
  }),
  organization({
    id: 'org-beacon', name: 'Beacon Law', state: 'paying', plan_name: 'starter', mrr: 4083, billing_period: 'yearly',
    subscription_status: 'past_due', reasons: [BillingRestrictionReason.PAYMENT_PAST_DUE], renews_at: '2026-06-20T00:00:00.000Z',
    lifetime_revenue: 49000, channels: 0, last_activity_at: null,
  }),
  organization({
    id: 'org-echo', name: 'Echo Studio', state: 'demo', owner_email: 'lina@echo.test', demo_ends_at: '2026-06-17T13:00:00.000Z',
    usage_peak: { metric: 'messages', used: 920, limit: 1000, percent: 92 }, created_at: '2026-06-10T10:00:00.000Z',
  }),
  organization({
    id: 'org-fjord', name: 'Fjord Fitness', state: 'demo_expired', demo_ends_at: '2026-06-12T10:00:00.000Z', created_at: '2026-05-26T10:00:00.000Z',
  }),
];

export function platformOrganizations(
  items: PlatformOrganizationRow[] = ORGANIZATIONS,
  counts: Partial<PlatformOrganizationCounts> = {},
): PlatformOrganizationsPage {
  const base = Object.fromEntries(PLATFORM_ORGANIZATION_FILTERS.map((filter) => [filter, 0])) as PlatformOrganizationCounts;
  return {
    ...paginated(items, items.length, 1, 10),
    counts: { ...base, all: 57, paying: 42, payment_failed: 1, churned: 3, demo: 17, demo_expired: 10, suspended: 1, ending_soon: 4, internal: 2, ...counts },
  };
}
