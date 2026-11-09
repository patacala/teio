import { BillingAccessLevel, BillingRestrictionReason, PlanFeature } from '@crm/shared';
import type { BillingAccess, SubscriptionStatus } from '@crm/shared';
import type { BadgeProps } from '@/components/ui/badge';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

export const SUBSCRIPTION_STATUS_META: Record<SubscriptionStatus, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Active', variant: 'success' },
  trialing: { label: 'Trial', variant: 'info' },
  past_due: { label: 'Past due', variant: 'warning' },
  unpaid: { label: 'Unpaid', variant: 'destructive' },
  canceled: { label: 'Canceled', variant: 'default' },
  incomplete: { label: 'Incomplete', variant: 'warning' },
  incomplete_expired: { label: 'Expired', variant: 'default' },
  paused: { label: 'Paused', variant: 'warning' },
};

export const ACCESS_LEVEL_META: Record<BillingAccessLevel, { label: string; variant: BadgeVariant }> = {
  [BillingAccessLevel.FULL]: { label: 'Full access', variant: 'success' },
  [BillingAccessLevel.BLOCKED]: { label: 'Blocked', variant: 'destructive' },
  [BillingAccessLevel.SUSPENDED]: { label: 'Suspended', variant: 'destructive' },
};

export const RESTRICTION_MESSAGES: Record<BillingRestrictionReason, string> = {
  [BillingRestrictionReason.ORGANIZATION_INACTIVE]: 'This organization has been deactivated. Contact support to reactivate it.',
  [BillingRestrictionReason.PAYMENT_METHOD_MISSING]: 'No payment method is connected for your paid plan.',
  [BillingRestrictionReason.PAYMENT_METHOD_EXPIRED]: 'Your payment method has expired.',
  [BillingRestrictionReason.PAYMENT_PAST_DUE]: 'Your latest payment failed. Update your payment method to avoid losing access.',
  [BillingRestrictionReason.GRACE_PERIOD_EXPIRED]: 'The grace period is over. Access is blocked until the payment is made.',
  [BillingRestrictionReason.SUBSCRIPTION_UNPAID]: 'Your subscription is unpaid. Access is blocked until the balance is paid.',
  [BillingRestrictionReason.SUBSCRIPTION_INCOMPLETE]: 'Your subscription payment was not completed. Access is blocked until it is paid.',
  [BillingRestrictionReason.SUBSCRIPTION_PAUSED]: 'Your subscription is paused. Add a payment method to restore access.',
  [BillingRestrictionReason.SUBSCRIPTION_CANCELED]: 'Your subscription has ended. Subscribe to a plan to restore access.',
  [BillingRestrictionReason.CANCELLATION_SCHEDULED]: 'Your subscription is set to cancel at the end of the current period.',
  [BillingRestrictionReason.DEMO_EXPIRED]: 'Your demo has ended. Choose a plan to keep using the CRM.',
  [BillingRestrictionReason.DEMO_ENDING_SOON]: 'Your demo ends soon. Choose a plan to keep using the CRM without interruption.',
};

const FEATURE_LABELS: Record<string, string> = {
  [PlanFeature.BASIC_INBOX]: 'Shared inbox',
  [PlanFeature.CONTACTS]: 'Contacts',
  [PlanFeature.AI_RESPONSES]: 'AI responses',
  [PlanFeature.ANALYTICS]: 'Analytics',
  [PlanFeature.VOICE_CALLS]: 'Voice calls',
  [PlanFeature.AUTOMATION]: 'Automations',
  [PlanFeature.ALL]: 'Every feature included',
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export const DEMO_LABEL = 'Demo';

/** Free plans are presented as the demo account. */
export function planLabel(plan: { name: string; is_paid: boolean }): string {
  if (!plan.is_paid) return DEMO_LABEL;
  return plan.name.charAt(0).toUpperCase() + plan.name.slice(1);
}

export function isRestricted(access: Pick<BillingAccess, 'level'>): boolean {
  return access.level !== BillingAccessLevel.FULL;
}

/** Full access, but something must be fixed before it is lost. */
export function needsAttention(access: Pick<BillingAccess, 'level' | 'requires_action'>): boolean {
  return access.level === BillingAccessLevel.FULL && access.requires_action;
}

const SEVERITY: BillingRestrictionReason[] = [
  BillingRestrictionReason.ORGANIZATION_INACTIVE,
  BillingRestrictionReason.DEMO_EXPIRED,
  BillingRestrictionReason.SUBSCRIPTION_UNPAID,
  BillingRestrictionReason.GRACE_PERIOD_EXPIRED,
  BillingRestrictionReason.PAYMENT_PAST_DUE,
  BillingRestrictionReason.SUBSCRIPTION_INCOMPLETE,
  BillingRestrictionReason.SUBSCRIPTION_PAUSED,
  BillingRestrictionReason.PAYMENT_METHOD_EXPIRED,
  BillingRestrictionReason.PAYMENT_METHOD_MISSING,
  BillingRestrictionReason.SUBSCRIPTION_CANCELED,
  BillingRestrictionReason.DEMO_ENDING_SOON,
  BillingRestrictionReason.CANCELLATION_SCHEDULED,
];

export function primaryRestrictionMessage(access: Pick<BillingAccess, 'reasons'>): string | null {
  const reason = SEVERITY.find((r) => access.reasons.includes(r));
  return reason ? RESTRICTION_MESSAGES[reason] : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDemoEnd(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * "ends today", "1 day left", "5 days left", "ended" — counted in calendar
 * days in the viewer's time zone, the way people read a deadline.
 */
export function demoTimeLeft(iso: string, now: Date = new Date()): string {
  const end = new Date(iso);
  if (end.getTime() <= now.getTime()) return 'ended';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(end) - startOf(now)) / DAY_MS);
  if (days === 0) return 'ends today';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}
