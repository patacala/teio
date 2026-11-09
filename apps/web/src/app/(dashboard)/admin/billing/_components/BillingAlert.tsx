'use client';

import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { BillingAccessLevel, BillingRestrictionReason } from '@crm/shared';
import type { BillingAccess } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RESTRICTION_MESSAGES, isRestricted, needsAttention } from '@/components/billing/billing-labels';

const PAYMENT_REASONS = new Set<BillingRestrictionReason>([
  BillingRestrictionReason.PAYMENT_METHOD_MISSING,
  BillingRestrictionReason.PAYMENT_METHOD_EXPIRED,
  BillingRestrictionReason.PAYMENT_PAST_DUE,
  BillingRestrictionReason.SUBSCRIPTION_PAUSED,
]);
const PORTAL_REASONS = new Set<BillingRestrictionReason>([
  BillingRestrictionReason.SUBSCRIPTION_UNPAID,
  BillingRestrictionReason.GRACE_PERIOD_EXPIRED,
  BillingRestrictionReason.SUBSCRIPTION_INCOMPLETE,
]);
const SUBSCRIBE_REASONS = new Set<BillingRestrictionReason>([
  BillingRestrictionReason.SUBSCRIPTION_CANCELED,
  BillingRestrictionReason.DEMO_EXPIRED,
  BillingRestrictionReason.DEMO_ENDING_SOON,
]);

interface BillingAlertProps {
  access: BillingAccess;
  onConnectPaymentMethod: () => void;
  onOpenPortal: () => void;
  onChoosePlan: () => void;
  busy: boolean;
}

export function BillingAlert({ access, onConnectPaymentMethod, onOpenPortal, onChoosePlan, busy }: BillingAlertProps) {
  if (access.reasons.length === 0) return null;

  const tone = isRestricted(access) ? 'danger' : needsAttention(access) ? 'warning' : 'info';
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : Info;
  const showPaymentCta = access.reasons.some((r) => PAYMENT_REASONS.has(r));
  const showPortalCta = access.reasons.some((r) => PORTAL_REASONS.has(r));
  const showSubscribeCta = access.reasons.some((r) => SUBSCRIBE_REASONS.has(r));

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-start',
        tone === 'danger' && 'border-danger/25 bg-danger/10',
        tone === 'warning' && 'border-warning/25 bg-warning/10',
        tone === 'info' && 'border-info/25 bg-info/10',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-info',
        )}
      />
      <div className="flex-1 space-y-1">
        {access.reasons.map((reason) => (
          <p key={reason} className="text-xs text-primary">{RESTRICTION_MESSAGES[reason]}</p>
        ))}
        {access.grace_period_ends_at && access.level === BillingAccessLevel.FULL && (
          <p className="text-xs text-secondary">
            Access will be blocked on{' '}
            {new Date(access.grace_period_ends_at).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{' '}
            if no payment is received.
          </p>
        )}
      </div>
      {(showPaymentCta || showPortalCta || showSubscribeCta) && (
        <div className="flex shrink-0 gap-2">
          {showPaymentCta && (
            <Button size="sm" onClick={onConnectPaymentMethod} disabled={busy}>
              Update payment method
            </Button>
          )}
          {showPortalCta && (
            <Button size="sm" variant="secondary" onClick={onOpenPortal} disabled={busy}>
              Pay outstanding invoice
            </Button>
          )}
          {showSubscribeCta && (
            <Button size="sm" onClick={onChoosePlan}>
              Choose a plan
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
