import type { BillingRestrictionReason, DemoRequestStatus, DemoType } from '../enums';
import type { BillingPeriod, PlanLimitMetric, SubscriptionStatus } from './billing.types';
import type { PaginatedResponse } from '../dtos/pagination.dto';

/**
 * Platform (super admin) dashboard. Every amount is in cents, USD. Internal
 * organizations (`is_internal`) are left out of every metric.
 */

export const PLATFORM_RANGES = ['7d', '30d', '90d'] as const;
export type PlatformRange = (typeof PLATFORM_RANGES)[number];

/**
 * Where an organization stands commercially, derived from the same billing
 * policy that grants or blocks access, so the dashboard never disagrees with it.
 */
export const PLATFORM_ORGANIZATION_STATES = [
  'paying',
  'payment_failed',
  'churned',
  'demo',
  'demo_expired',
  'suspended',
] as const;
export type PlatformOrganizationState = (typeof PLATFORM_ORGANIZATION_STATES)[number];

/** Organization table filters: a state, or one of these views. */
export const PLATFORM_ORGANIZATION_FILTERS = ['all', ...PLATFORM_ORGANIZATION_STATES, 'ending_soon', 'internal'] as const;
export type PlatformOrganizationFilter = (typeof PLATFORM_ORGANIZATION_FILTERS)[number];

export const PLATFORM_ORGANIZATION_SORTS = ['mrr', 'created', 'activity', 'demo_end'] as const;
export type PlatformOrganizationSort = (typeof PLATFORM_ORGANIZATION_SORTS)[number];

export interface PlatformPeriod {
  from: string;
  to: string;
  days: number;
  previous_from: string;
  previous_to: string;
}

export interface PlatformRevenueAtRisk {
  /** MRR of every organization below (cents). */
  amount: number;
  organizations: number;
  past_due: number;
  cancel_scheduled: number;
  payment_method_issue: number;
  /** Paid organizations already blocked by a failed payment (recoverable). */
  payment_failed: number;
}

export interface PlatformMoneyKpis {
  mrr: number;
  /** MRR at the end of last month (snapshot); null before the first snapshot. */
  mrr_last_month: number | null;
  arr: number;
  paying_organizations: number;
  average_revenue_per_organization: number;
  cash_collected: number;
  cash_collected_previous: number;
  outstanding: number;
  outstanding_invoices: number;
  at_risk: PlatformRevenueAtRisk;
  /** Organizations whose first payment landed in the period. */
  new_paying: number;
  /** Paid organizations whose subscription ended in the period. */
  churned: number;
}

export interface PlatformGrowthKpis {
  leads: {
    total: number;
    previous: number;
    demo_requests: number;
    signups: number;
  };
  demos: {
    active: number;
    ending_7d: number;
    /** Demos with no end date. */
    no_end_date: number;
  };
  /** Demos decided in the period: paid for the first time vs ended unpaid. */
  conversion: {
    /** Percentage (0–100) of decided demos that paid; null when none was decided. */
    rate: number | null;
    converted: number;
    expired_unpaid: number;
  };
}

export const PLATFORM_LEAD_FUNNEL_STEPS = ['form_started', 'submitted', 'ready', 'opened', 'signed_up', 'paid'] as const;
export type PlatformLeadFunnelStepKey = (typeof PLATFORM_LEAD_FUNNEL_STEPS)[number];

export interface PlatformLeadFunnelStep {
  key: PlatformLeadFunnelStepKey;
  count: number;
}

export interface PlatformSignupSummary {
  signups: number;
  /** Connected a channel or had a first conversation. */
  activated: number;
  paid: number;
}

export interface PlatformRevenueMonth {
  /** "2026-06" */
  month: string;
  collected: number;
  /** MRR at the end of the month; the current month is live. null = no snapshot. */
  mrr: number | null;
}

export interface PlatformOverview {
  period: PlatformPeriod;
  currency: 'usd';
  money: PlatformMoneyKpis;
  growth: PlatformGrowthKpis;
  lead_funnel: PlatformLeadFunnelStep[];
  signups: PlatformSignupSummary;
  revenue_by_month: PlatformRevenueMonth[];
  generated_at: string;
}

// ── Needs attention ───────────────────────────────────────────────────────

export const PLATFORM_ATTENTION_KINDS = [
  'grace_ending',
  'payment_failed',
  'demo_request_failed',
  'demo_request_stuck',
  'hot_demo',
  'cancel_scheduled',
  'payment_method_issue',
  'at_limit',
  'not_activated',
] as const;
export type PlatformAttentionKind = (typeof PLATFORM_ATTENTION_KINDS)[number];

export type PlatformAttentionUrgency = 'critical' | 'warning';

export type PlatformAttentionTarget =
  | { type: 'organization'; id: string; name: string; slug: string; /** Owner (or first admin). */ email: string | null }
  | { type: 'lead'; id: string; name: string; email: string | null; company: string | null };

export interface PlatformAttentionItem {
  id: string;
  kind: PlatformAttentionKind;
  urgency: PlatformAttentionUrgency;
  target: PlatformAttentionTarget;
  /** Short badge, e.g. "Grace ends in 6h". */
  reason: string;
  /** One line of context, e.g. "Professional · $149/mo · owner@acme.com". */
  detail: string;
  /** MRR at stake (cents), when money is involved. */
  amount: number | null;
  /** When the issue started or is due. */
  at: string;
}

export interface PlatformAttention {
  items: PlatformAttentionItem[];
  counts: { critical: number; warning: number };
}

// ── Leads ─────────────────────────────────────────────────────────────────

export const PLATFORM_LEAD_SOURCES = ['all', 'demo_request', 'signup'] as const;
export type PlatformLeadSourceFilter = (typeof PLATFORM_LEAD_SOURCES)[number];
export type PlatformLeadSource = Exclude<PlatformLeadSourceFilter, 'all'>;

export interface PlatformLeadOrganization {
  id: string;
  name: string;
  state: PlatformOrganizationState;
}

export interface PlatformLead {
  id: string;
  source: PlatformLeadSource;
  name: string;
  email: string | null;
  company: string | null;
  created_at: string;
  demo_type: DemoType | null;
  demo_status: DemoRequestStatus | null;
  /** How many times the demo link was opened (demo requests only). */
  demo_opens: number | null;
  /** The signup's organization, or the organization a demo lead signed up with (matched by email). */
  organization: PlatformLeadOrganization | null;
}

// ── Organizations ─────────────────────────────────────────────────────────

export interface PlatformUsagePeak {
  metric: PlanLimitMetric;
  used: number;
  limit: number;
  percent: number;
}

export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  owner_email: string | null;
  created_at: string;
  is_active: boolean;
  is_internal: boolean;
  state: PlatformOrganizationState;
  reasons: BillingRestrictionReason[];
  plan_name: string;
  subscription_status: SubscriptionStatus;
  billing_period: BillingPeriod;
  /** Current MRR (paying) or the MRR a blocked paid organization would bring back. */
  mrr: number;
  demo_ends_at: string | null;
  renews_at: string | null;
  usage_peak: PlatformUsagePeak | null;
  members: number;
  channels: number;
  last_activity_at: string | null;
  lifetime_revenue: number;
}

export type PlatformOrganizationCounts = Record<PlatformOrganizationFilter, number>;

export interface PlatformOrganizationsPage extends PaginatedResponse<PlatformOrganizationRow> {
  counts: PlatformOrganizationCounts;
}
