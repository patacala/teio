import { BillingAccessLevel, BillingRestrictionReason, PlanFeature } from '@crm/shared';
import type {
  BillingAccess,
  PlanLimitMetric,
  PlanLimits,
  SubscriptionStatus,
} from '@crm/shared';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Demos ending within this many days are flagged so the org can choose a plan in time. */
export const DEMO_ENDING_SOON_DAYS = 3;

export const NO_LIMITS: PlanLimits = {
  conversations: 0,
  messages: 0,
  ai_calls: 0,
  agents: 0,
  voice_minutes: 0,
};

export interface PolicyPlan {
  name: string;
  price_monthly: number;
  price_yearly: number;
  limits: Partial<PlanLimits>;
  features: string[];
}

export interface PolicyPaymentMethod {
  exp_month: number | null;
  exp_year: number | null;
}

export interface BillingAccessInput {
  organizationActive: boolean;
  status: SubscriptionStatus;
  plan: PolicyPlan;
  paymentMethod: PolicyPaymentMethod | null;
  currentPeriodEnd: Date;
  pastDueSince: Date | null;
  cancelAtPeriodEnd: boolean;
  gracePeriodHours: number;
  /** Platform-admin limits for this organization; applied only while it is a demo. */
  demoLimitOverrides?: Partial<PlanLimits>;
  /** When the demo ends; null = no end date. Only applies to demos. */
  demoEndsAt?: Date | null;
}

/**
 * A demo's end date: the one stored for the organization, or, before its
 * billing row exists, its creation date plus the current demo length.
 */
export function resolveDemoEndsAt(
  stored: { demo_ends_at: Date | null } | null,
  organizationCreatedAt: Date | null,
  demoDurationDays: number | null,
): Date | null {
  if (stored) return stored.demo_ends_at;
  if (!demoDurationDays || !organizationCreatedAt) return null;
  return new Date(organizationCreatedAt.getTime() + demoDurationDays * DAY_MS);
}

const ACTIONABLE_REASONS = new Set<BillingRestrictionReason>([
  BillingRestrictionReason.ORGANIZATION_INACTIVE,
  BillingRestrictionReason.PAYMENT_METHOD_MISSING,
  BillingRestrictionReason.PAYMENT_METHOD_EXPIRED,
  BillingRestrictionReason.PAYMENT_PAST_DUE,
  BillingRestrictionReason.GRACE_PERIOD_EXPIRED,
  BillingRestrictionReason.SUBSCRIPTION_UNPAID,
  BillingRestrictionReason.SUBSCRIPTION_INCOMPLETE,
  BillingRestrictionReason.SUBSCRIPTION_PAUSED,
  BillingRestrictionReason.SUBSCRIPTION_CANCELED,
  BillingRestrictionReason.DEMO_EXPIRED,
  BillingRestrictionReason.DEMO_ENDING_SOON,
]);

export function isPaidPlan(plan: Pick<PolicyPlan, 'price_monthly' | 'price_yearly'>): boolean {
  return plan.price_monthly > 0 || plan.price_yearly > 0;
}

/** A card expires at the end of its expiry month. Non-card methods carry no expiry. */
export function isPaymentMethodExpired(pm: PolicyPaymentMethod, now: Date): boolean {
  if (!pm.exp_month || !pm.exp_year) return false;
  const firstDayAfterExpiry = Date.UTC(pm.exp_year, pm.exp_month, 1);
  return now.getTime() >= firstDayAfterExpiry;
}

function normalizeLimits(limits: Partial<PlanLimits> | undefined): PlanLimits {
  return { ...NO_LIMITS, ...(limits ?? {}) };
}

/** Keeps only known metrics with a valid limit (integer >= -1). */
export function cleanOverrides(overrides: Partial<PlanLimits> | null | undefined): Partial<PlanLimits> {
  const out: Partial<PlanLimits> = {};
  for (const metric of Object.keys(NO_LIMITS) as Array<keyof PlanLimits>) {
    const value = overrides?.[metric];
    if (typeof value === 'number' && Number.isInteger(value) && value >= -1) out[metric] = value;
  }
  return out;
}

/**
 * Decides what an organization may do given its billing state.
 *
 *   Demo (free plan)   FULL, every feature, labeled `is_demo`
 *   Paid and paying    FULL with the plan's features; a failed payment keeps
 *                      access for the grace period (48h by default)
 *   Paid, not paying   BLOCKED until a payment is made
 *   Org deactivated    SUSPENDED
 */
export function resolveBillingAccess(input: BillingAccessInput, now: Date): BillingAccess {
  const reasons: BillingRestrictionReason[] = [];
  const paid = isPaidPlan(input.plan);
  const pm = input.paymentMethod;
  const hasValidPm = !!pm && !isPaymentMethodExpired(pm, now);
  let gracePeriodEndsAt: Date | null = null;

  const pmReason = (): void => {
    if (!paid || hasValidPm) return;
    reasons.push(
      pm
        ? BillingRestrictionReason.PAYMENT_METHOD_EXPIRED
        : BillingRestrictionReason.PAYMENT_METHOD_MISSING,
    );
  };

  let level: BillingAccessLevel;

  if (!input.organizationActive) {
    level = BillingAccessLevel.SUSPENDED;
    reasons.push(BillingRestrictionReason.ORGANIZATION_INACTIVE);
  } else if (!paid) {
    const endsAt = input.demoEndsAt ?? null;
    if (endsAt && now.getTime() >= endsAt.getTime()) {
      level = BillingAccessLevel.BLOCKED;
      reasons.push(BillingRestrictionReason.DEMO_EXPIRED);
    } else {
      level = BillingAccessLevel.FULL;
      if (endsAt && endsAt.getTime() - now.getTime() <= DEMO_ENDING_SOON_DAYS * DAY_MS) {
        reasons.push(BillingRestrictionReason.DEMO_ENDING_SOON);
      }
    }
  } else {
    switch (input.status) {
      case 'active':
        level = BillingAccessLevel.FULL;
        pmReason();
        // The current period is paid for; without a usable method nothing
        // will pay the next one.
        if (!hasValidPm && now.getTime() > input.currentPeriodEnd.getTime()) {
          level = BillingAccessLevel.BLOCKED;
        }
        break;
      case 'trialing':
        level = BillingAccessLevel.FULL;
        pmReason();
        break;
      case 'past_due': {
        const since = input.pastDueSince ?? input.currentPeriodEnd;
        gracePeriodEndsAt = new Date(since.getTime() + input.gracePeriodHours * HOUR_MS);
        reasons.push(BillingRestrictionReason.PAYMENT_PAST_DUE);
        if (now.getTime() < gracePeriodEndsAt.getTime()) {
          level = BillingAccessLevel.FULL;
        } else {
          level = BillingAccessLevel.BLOCKED;
          reasons.push(BillingRestrictionReason.GRACE_PERIOD_EXPIRED);
        }
        pmReason();
        break;
      }
      case 'unpaid':
        level = BillingAccessLevel.BLOCKED;
        reasons.push(BillingRestrictionReason.SUBSCRIPTION_UNPAID);
        pmReason();
        break;
      case 'incomplete':
      case 'incomplete_expired':
        level = BillingAccessLevel.BLOCKED;
        reasons.push(BillingRestrictionReason.SUBSCRIPTION_INCOMPLETE);
        break;
      case 'paused':
        level = BillingAccessLevel.BLOCKED;
        reasons.push(BillingRestrictionReason.SUBSCRIPTION_PAUSED);
        pmReason();
        break;
      case 'canceled':
        level = BillingAccessLevel.BLOCKED;
        reasons.push(BillingRestrictionReason.SUBSCRIPTION_CANCELED);
        break;
      default:
        level = BillingAccessLevel.BLOCKED;
        reasons.push(BillingRestrictionReason.SUBSCRIPTION_INCOMPLETE);
    }

    if (input.cancelAtPeriodEnd && level === BillingAccessLevel.FULL) {
      reasons.push(BillingRestrictionReason.CANCELLATION_SCHEDULED);
    }
  }

  const full = level === BillingAccessLevel.FULL;
  const isDemo = !paid && input.organizationActive;
  const overrides = isDemo ? cleanOverrides(input.demoLimitOverrides) : {};

  return {
    level,
    is_demo: isDemo,
    status: input.status,
    reasons,
    requires_action: reasons.some((r) => ACTIONABLE_REASONS.has(r)),
    is_paid_plan: paid,
    has_valid_payment_method: hasValidPm,
    grace_period_ends_at: gracePeriodEndsAt?.toISOString() ?? null,
    plan_name: input.plan.name,
    effective_plan_name: full ? input.plan.name : 'none',
    effective_limits: full ? { ...normalizeLimits(input.plan.limits), ...overrides } : { ...NO_LIMITS },
    effective_features: !full ? [] : isDemo ? [PlanFeature.ALL] : [...(input.plan.features ?? [])],
    has_custom_limits: Object.keys(overrides).length > 0,
    demo_ends_at: isDemo ? (input.demoEndsAt?.toISOString() ?? null) : null,
  };
}

/** Whether the org may use the product at all (requests and background work). */
export function isOperational(access: Pick<BillingAccess, 'level'>): boolean {
  return access.level === BillingAccessLevel.FULL;
}

export function hasFeature(
  access: Pick<BillingAccess, 'level' | 'effective_features'>,
  feature: PlanFeature,
): boolean {
  if (!isOperational(access)) return false;
  return (
    access.effective_features.includes(PlanFeature.ALL) ||
    access.effective_features.includes(feature)
  );
}

/** -1 means unlimited. */
export function limitFor(access: Pick<BillingAccess, 'effective_limits'>, metric: PlanLimitMetric): number {
  return access.effective_limits[metric] ?? 0;
}
