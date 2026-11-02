export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
export type BillingPeriod = 'monthly' | 'yearly';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';

export interface PlanLimits {
  conversations: number; // -1 = unlimited
  messages: number;
  ai_calls: number;
  agents: number;
  voice_minutes: number;
}

export type PlanLimitMetric = keyof PlanLimits;

export interface BillingPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  limits: PlanLimits;
  features: string[];
  sort_order: number;
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
}

export interface UsageSummary {
  organization_id: string;
  period_start: string;
  period_end: string;
  conversations: number;
  messages: number;
  ai_calls: number;
  voice_minutes: number;
}

export interface BillingOverview {
  subscription: BillingSubscription;
  usage: UsageSummary;
  limits: PlanLimits;
}
