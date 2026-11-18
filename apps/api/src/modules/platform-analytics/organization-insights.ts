import { BillingAccessLevel, BillingRestrictionReason, DemoRequestStatus, METERED_METRICS, PLAN_LIMIT_METRICS } from '@crm/shared';
import type {
  BillingAccess,
  BillingPeriod,
  PlanLimitMetric,
  PlatformAttentionItem,
  PlatformOrganizationState,
  PlatformUsagePeak,
  SubscriptionStatus,
} from '@crm/shared';

/**
 * Pure rules behind the platform dashboard: how an organization is classified,
 * what it is worth, and what needs a super admin's attention. The billing
 * access (`BillingAccess`) comes from the same policy that grants or blocks
 * access, so the dashboard always agrees with what the organization sees.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Demos ending within this many days count as "ending soon". */
export const DEMO_ENDING_SOON_DAYS = 7;
/** A demo ending within this many days with this much usage is a likely buyer. */
export const HOT_DEMO_DAYS = 3;
export const HOT_DEMO_USAGE_PERCENT = 50;
/** A paying organization this close to a limit is an upgrade candidate. */
export const AT_LIMIT_PERCENT = 90;
/** A demo with nothing set up after this many days (and younger than the max) needs onboarding help. */
export const NOT_ACTIVATED_AFTER_DAYS = 3;
export const NOT_ACTIVATED_MAX_AGE_DAYS = 30;
/** A demo request still generating after this long is stuck (the demo generator never called back). */
export const DEMO_REQUEST_STUCK_MINUTES = 30;
/** Failed or stuck demo requests older than this are no longer surfaced. */
export const DEMO_REQUEST_ATTENTION_DAYS = 14;

/** Everything the dashboard knows about one organization, loaded in one query. */
export interface OrganizationFacts {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_internal: boolean;
  created_at: Date;
  owner_email: string | null;
  plan_id: string | null;
  plan_name: string;
  price_monthly: number;
  price_yearly: number;
  subscription_status: SubscriptionStatus;
  billing_period: BillingPeriod;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  payment_method_exp_month: number | null;
  payment_method_exp_year: number | null;
  /** When a paid subscription ended (status `canceled`). */
  canceled_at: Date | null;
  usage: Record<PlanLimitMetric, number>;
  members: number;
  channels: number;
  has_conversations: boolean;
  last_activity_at: Date | null;
  first_paid_at: Date | null;
  lifetime_revenue: number;
}

export interface OrganizationInsight extends OrganizationFacts {
  access: BillingAccess;
  state: PlatformOrganizationState;
  /** Monthly equivalent of the plan (cents) while paying, or what a blocked paid org would bring back. */
  mrr: number;
  usage_peak: PlatformUsagePeak | null;
  demo_ends_at: Date | null;
}

export function classifyOrganization(access: BillingAccess, organizationActive: boolean): PlatformOrganizationState {
  if (!organizationActive || access.level === BillingAccessLevel.SUSPENDED) return 'suspended';
  if (access.is_paid_plan) {
    if (access.level === BillingAccessLevel.FULL) return 'paying';
    return access.status === 'canceled' ? 'churned' : 'payment_failed';
  }
  return access.level === BillingAccessLevel.FULL ? 'demo' : 'demo_expired';
}

/** Monthly equivalent of a plan in cents; yearly plans count a twelfth of their price. */
export function monthlyRecurringRevenue(
  plan: { price_monthly: number; price_yearly: number },
  billingPeriod: BillingPeriod,
): number {
  if (billingPeriod === 'yearly' && plan.price_yearly > 0) return Math.round(plan.price_yearly / 12);
  if (plan.price_monthly > 0) return plan.price_monthly;
  return plan.price_yearly > 0 ? Math.round(plan.price_yearly / 12) : 0;
}

/** The metric closest to (or furthest over) its limit; null when nothing is limited or used. */
export function usagePeak(
  usage: Record<PlanLimitMetric, number>,
  limits: Record<PlanLimitMetric, number>,
  metrics: readonly PlanLimitMetric[] = PLAN_LIMIT_METRICS,
): PlatformUsagePeak | null {
  let peak: PlatformUsagePeak | null = null;
  for (const metric of metrics) {
    const limit = limits[metric] ?? 0;
    const used = usage[metric] ?? 0;
    if (limit <= 0 || used <= 0) continue; // -1 = unlimited, 0 = not included
    const percent = Math.round((used / limit) * 100);
    if (!peak || percent > peak.percent) peak = { metric, used, limit, percent };
  }
  return peak;
}

export function buildInsight(facts: OrganizationFacts, access: BillingAccess): OrganizationInsight {
  const state = classifyOrganization(access, facts.is_active);
  const paid = access.is_paid_plan;
  return {
    ...facts,
    access,
    state,
    mrr: paid && (state === 'paying' || state === 'payment_failed') ? monthlyRecurringRevenue(facts, facts.billing_period) : 0,
    usage_peak: access.level === BillingAccessLevel.FULL ? usagePeak(facts.usage, access.effective_limits) : null,
    demo_ends_at: access.demo_ends_at ? new Date(access.demo_ends_at) : null,
  };
}

// ── Revenue at risk ────────────────────────────────────────────────────────

/** First instant after the card's expiry month (cards expire at the end of that month). */
function cardExpiresAt(insight: Pick<OrganizationFacts, 'payment_method_exp_month' | 'payment_method_exp_year'>): Date | null {
  const { payment_method_exp_month: month, payment_method_exp_year: year } = insight;
  if (!month || !year) return null;
  return new Date(Date.UTC(year, month, 1));
}

/** The saved card stops working before the next renewal is charged. */
export function cardExpiresBeforeRenewal(insight: OrganizationInsight, now: Date): boolean {
  const expiresAt = cardExpiresAt(insight);
  if (!expiresAt || !insight.current_period_end || expiresAt.getTime() <= now.getTime()) return false;
  return expiresAt.getTime() <= insight.current_period_end.getTime();
}

export function hasPaymentMethodIssue(insight: OrganizationInsight, now: Date): boolean {
  return (
    insight.access.reasons.includes(BillingRestrictionReason.PAYMENT_METHOD_MISSING) ||
    insight.access.reasons.includes(BillingRestrictionReason.PAYMENT_METHOD_EXPIRED) ||
    cardExpiresBeforeRenewal(insight, now)
  );
}

export interface RiskFlags {
  past_due: boolean;
  cancel_scheduled: boolean;
  payment_method_issue: boolean;
  payment_failed: boolean;
}

/** Why this organization's revenue is at risk (all false = safe or not paying). */
export function riskFlags(insight: OrganizationInsight, now: Date): RiskFlags {
  const paying = insight.state === 'paying';
  return {
    past_due: paying && insight.subscription_status === 'past_due',
    cancel_scheduled: paying && insight.cancel_at_period_end,
    payment_method_issue: paying && hasPaymentMethodIssue(insight, now),
    payment_failed: insight.state === 'payment_failed',
  };
}

export function isAtRisk(flags: RiskFlags): boolean {
  return flags.past_due || flags.cancel_scheduled || flags.payment_method_issue || flags.payment_failed;
}

// ── Needs attention ────────────────────────────────────────────────────────

const METRIC_LABELS: Record<PlanLimitMetric, string> = {
  conversations: 'conversations',
  messages: 'messages',
  ai_calls: 'AI calls',
  voice_minutes: 'voice minutes',
  agents: 'team members',
};

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: dollars % 1 === 0 ? 0 : 2 })}`;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "6h", "2 days", "less than 1h". */
export function formatDuration(ms: number): string {
  if (ms < HOUR_MS) return 'less than 1h';
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)}h`;
  const days = Math.floor(ms / DAY_MS);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function planLine(insight: OrganizationInsight): string {
  const plan = insight.plan_name.charAt(0).toUpperCase() + insight.plan_name.slice(1);
  const parts = insight.mrr > 0 ? [plan, `${formatUsd(insight.mrr)}/mo`] : [plan];
  if (insight.owner_email) parts.push(insight.owner_email);
  return parts.join(' · ');
}

function demoLine(insight: OrganizationInsight): string {
  return ['Demo', insight.owner_email].filter(Boolean).join(' · ');
}

const FAILED_PAYMENT_REASONS: Array<[BillingRestrictionReason, string]> = [
  [BillingRestrictionReason.GRACE_PERIOD_EXPIRED, 'Blocked: payment failed'],
  [BillingRestrictionReason.SUBSCRIPTION_UNPAID, 'Blocked: unpaid'],
  [BillingRestrictionReason.SUBSCRIPTION_INCOMPLETE, 'Blocked: payment incomplete'],
  [BillingRestrictionReason.SUBSCRIPTION_PAUSED, 'Blocked: subscription paused'],
  [BillingRestrictionReason.PAYMENT_METHOD_EXPIRED, 'Blocked: card expired'],
  [BillingRestrictionReason.PAYMENT_METHOD_MISSING, 'Blocked: no payment method'],
];

function failedPaymentReason(insight: OrganizationInsight): string {
  return FAILED_PAYMENT_REASONS.find(([reason]) => insight.access.reasons.includes(reason))?.[1] ?? 'Blocked: payment required';
}

function paymentMethodReason(insight: OrganizationInsight): string {
  if (insight.access.reasons.includes(BillingRestrictionReason.PAYMENT_METHOD_MISSING)) return 'No payment method';
  if (insight.access.reasons.includes(BillingRestrictionReason.PAYMENT_METHOD_EXPIRED)) return 'Card expired';
  const month = String(insight.payment_method_exp_month).padStart(2, '0');
  const year = String(insight.payment_method_exp_year).slice(-2);
  return `Card expires ${month}/${year}`;
}

/** Every attention item for one organization (internal organizations have none). */
export function organizationAttention(insight: OrganizationInsight, now: Date): PlatformAttentionItem[] {
  if (insight.is_internal) return [];
  const items: PlatformAttentionItem[] = [];
  const target = {
    type: 'organization' as const,
    id: insight.id,
    name: insight.name,
    slug: insight.slug,
    email: insight.owner_email,
  };
  const add = (item: Omit<PlatformAttentionItem, 'id' | 'target'>) =>
    items.push({ id: `${item.kind}:${insight.id}`, target, ...item });
  const nowMs = now.getTime();

  if (insight.state === 'payment_failed') {
    add({
      kind: 'payment_failed',
      urgency: 'critical',
      reason: failedPaymentReason(insight),
      detail: planLine(insight),
      amount: insight.mrr,
      at: (insight.current_period_end ?? now).toISOString(),
    });
  }

  if (insight.state === 'paying') {
    if (insight.subscription_status === 'past_due' && insight.access.grace_period_ends_at) {
      const graceEnds = new Date(insight.access.grace_period_ends_at);
      add({
        kind: 'grace_ending',
        urgency: 'critical',
        reason: `Grace ends in ${formatDuration(graceEnds.getTime() - nowMs)}`,
        detail: planLine(insight),
        amount: insight.mrr,
        at: graceEnds.toISOString(),
      });
    }
    if (insight.cancel_at_period_end) {
      const ends = insight.current_period_end ?? now;
      add({
        kind: 'cancel_scheduled',
        urgency: 'warning',
        reason: `Cancels ${formatDay(ends)}`,
        detail: planLine(insight),
        amount: insight.mrr,
        at: ends.toISOString(),
      });
    }
    if (hasPaymentMethodIssue(insight, now)) {
      add({
        kind: 'payment_method_issue',
        urgency: 'warning',
        reason: paymentMethodReason(insight),
        detail: planLine(insight),
        amount: insight.mrr,
        at: (insight.current_period_end ?? now).toISOString(),
      });
    }
    if (insight.usage_peak && insight.usage_peak.percent >= AT_LIMIT_PERCENT) {
      add({
        kind: 'at_limit',
        urgency: 'warning',
        reason: `${insight.usage_peak.percent}% of ${METRIC_LABELS[insight.usage_peak.metric]}`,
        detail: `Upgrade candidate · ${planLine(insight)}`,
        amount: insight.mrr,
        at: now.toISOString(),
      });
    }
  }

  if (insight.state === 'demo') {
    const endsAt = insight.demo_ends_at;
    const left = endsAt ? endsAt.getTime() - nowMs : null;
    // Real use of the product, not seats: a one-person demo already fills half of 2 seats.
    const engagement = usagePeak(insight.usage, insight.access.effective_limits, METERED_METRICS);
    if (left !== null && left > 0 && left <= HOT_DEMO_DAYS * DAY_MS && engagement && engagement.percent >= HOT_DEMO_USAGE_PERCENT) {
      const peak = engagement;
      add({
        kind: 'hot_demo',
        urgency: 'warning',
        reason: `Demo ends in ${formatDuration(left)}`,
        detail: `${peak.percent}% of ${METRIC_LABELS[peak.metric]} used · ${demoLine(insight)}`,
        amount: null,
        at: endsAt!.toISOString(),
      });
    }

    const age = nowMs - insight.created_at.getTime();
    if (
      age >= NOT_ACTIVATED_AFTER_DAYS * DAY_MS &&
      age <= NOT_ACTIVATED_MAX_AGE_DAYS * DAY_MS &&
      insight.channels === 0 &&
      !insight.has_conversations
    ) {
      add({
        kind: 'not_activated',
        urgency: 'warning',
        reason: `No channel after ${formatDuration(age)}`,
        detail: `Signed up ${formatDay(insight.created_at)} · ${demoLine(insight)}`,
        amount: null,
        at: insight.created_at.toISOString(),
      });
    }
  }

  return items;
}

/** Critical first, then the most money at stake, then what is due (or started) first. */
export function compareAttention(a: PlatformAttentionItem, b: PlatformAttentionItem): number {
  if (a.urgency !== b.urgency) return a.urgency === 'critical' ? -1 : 1;
  const amountA = a.amount ?? -1;
  const amountB = b.amount ?? -1;
  if (amountA !== amountB) return amountB - amountA;
  return new Date(a.at).getTime() - new Date(b.at).getTime();
}

// ── Leads (public demo form) ───────────────────────────────────────────────

const DEMO_TYPE_LABELS: Record<string, string> = {
  live_chat: 'Live chat',
  ai_voice: 'AI voice',
  crm: 'CRM',
};

export function demoTypeLabel(type: string): string {
  return DEMO_TYPE_LABELS[type] ?? type;
}

export interface DemoRequestFacts {
  id: string;
  status: string;
  error_message: string | null;
  created_at: Date;
  demo_type: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
}

export function leadName(lead: Pick<DemoRequestFacts, 'first_name' | 'last_name' | 'email'>): string {
  const name = [lead.first_name, lead.last_name].map((part) => part?.trim()).filter(Boolean).join(' ');
  return name || lead.email || 'Unknown lead';
}

/** A lead whose personalized demo failed, or is still generating long after it should have finished. */
export function leadAttention(lead: DemoRequestFacts, now: Date): PlatformAttentionItem | null {
  const age = now.getTime() - lead.created_at.getTime();
  if (age > DEMO_REQUEST_ATTENTION_DAYS * DAY_MS) return null;

  const target = { type: 'lead' as const, id: lead.id, name: leadName(lead), email: lead.email, company: lead.company };
  const context = [`${demoTypeLabel(lead.demo_type)} demo`, lead.company].filter(Boolean).join(' · ');

  if (lead.status === DemoRequestStatus.FAILED) {
    return {
      id: `demo_request_failed:${lead.id}`,
      kind: 'demo_request_failed',
      urgency: 'critical',
      target,
      reason: 'Demo generation failed',
      detail: lead.error_message ? `${context} · ${lead.error_message}` : context,
      amount: null,
      at: lead.created_at.toISOString(),
    };
  }
  if (lead.status === DemoRequestStatus.PROCESSING && age >= DEMO_REQUEST_STUCK_MINUTES * 60 * 1000) {
    return {
      id: `demo_request_stuck:${lead.id}`,
      kind: 'demo_request_stuck',
      urgency: 'critical',
      target,
      reason: `Stuck for ${formatDuration(age)}`,
      detail: context,
      amount: null,
      at: lead.created_at.toISOString(),
    };
  }
  return null;
}
