import type { BillingAccessLevel, BillingRestrictionReason } from '../enums';

export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_PERIODS = ['monthly', 'yearly'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';

export interface PlanLimits {
  conversations: number; // -1 = unlimited
  messages: number;
  ai_calls: number;
  agents: number;
  voice_minutes: number;
}

export type PlanLimitMetric = keyof PlanLimits;

/** Metrics counted per calendar month (UTC). */
export const METERED_METRICS = ['conversations', 'messages', 'ai_calls', 'voice_minutes'] as const;
export type MeteredMetric = (typeof METERED_METRICS)[number];

/** Every limit a plan can define; `agents` is the number of active team members. */
export const PLAN_LIMIT_METRICS = [...METERED_METRICS, 'agents'] as const satisfies readonly PlanLimitMetric[];

/** Partial limits; a missing metric falls back to the default. -1 = unlimited. */
export type PlanLimitOverrides = Partial<PlanLimits>;

export interface BillingPlan {
  id: string;
  name: string;
  price_monthly: number; // cents
  price_yearly: number; // cents
  currency: string;
  limits: PlanLimits;
  features: string[];
  sort_order: number;
  is_paid: boolean;
}

export interface BillingPaymentMethod {
  type: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_expired: boolean;
}

export interface BillingSubscription {
  id: string;
  organization_id: string;
  plan: BillingPlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  billing_period: BillingPeriod;
  current_period_start: string;
  current_period_end: string;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  past_due_since: string | null;
  payment_method: BillingPaymentMethod | null;
}

export interface UsageSummary {
  organization_id: string;
  period_start: string;
  period_end: string;
  conversations: number;
  messages: number;
  ai_calls: number;
  voice_minutes: number;
  agents: number;
}

/**
 * Single source of truth for what an organization may do right now. Computed
 * server-side from plan + subscription status + payment method + org state.
 */
export interface BillingAccess {
  level: BillingAccessLevel;
  /** Free-plan organization: full product access, labeled as a demo account. */
  is_demo: boolean;
  status: SubscriptionStatus;
  reasons: BillingRestrictionReason[];
  requires_action: boolean;
  is_paid_plan: boolean;
  has_valid_payment_method: boolean;
  grace_period_ends_at: string | null;
  plan_name: string;
  effective_plan_name: string;
  effective_limits: PlanLimits;
  effective_features: string[];
  /** Demo organization with limits customized by a platform admin. */
  has_custom_limits: boolean;
  /** When the demo ends; null when it has no end date (or the org is not a demo). */
  demo_ends_at: string | null;
}

export interface BillingOverview {
  subscription: BillingSubscription;
  usage: UsageSummary;
  limits: PlanLimits;
  access: BillingAccess;
  has_live_subscription: boolean;
}

export interface BillingInvoice {
  id: string;
  stripe_invoice_id: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: InvoiceStatus;
  invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface BillingRedirect {
  url: string;
}

/** Platform admin: limits every demo organization gets unless overridden. */
export interface DemoLimitDefaults {
  plan_id: string;
  limits: PlanLimits;
  /** Length of new demos in days; null = demos have no end date. */
  demo_duration_days: number | null;
  updated_at: string;
}

/** Platform admin: a demo organization with its usage and limits. */
export interface DemoOrganization {
  organization_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  usage: Record<PlanLimitMetric, number>;
  limit_overrides: PlanLimitOverrides;
  effective_limits: PlanLimits;
  limits_updated_at: string | null;
  /** null = no end date (free forever). */
  demo_ends_at: string | null;
  demo_period_updated_at: string | null;
}
