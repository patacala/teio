'use client';

import { useState } from 'react';
import { CreditCard, CheckCircle, Sparkles } from 'lucide-react';
import { BillingAccessLevel } from '@crm/shared';
import type { BillingAccess, BillingSubscription } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMoney } from '@/lib/utils';
import {
  ACCESS_LEVEL_META,
  SUBSCRIPTION_STATUS_META,
  demoTimeLeft,
  featureLabel,
  formatDemoEnd,
  planLabel,
} from '@/components/billing/billing-labels';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

interface CurrentPlanCardProps {
  subscription: BillingSubscription;
  access: BillingAccess;
  hasLiveSubscription: boolean;
  onCancel: () => Promise<unknown>;
  onResume: () => Promise<unknown>;
  cancelPending: boolean;
  resumePending: boolean;
}

export function CurrentPlanCard({
  subscription,
  access,
  hasLiveSubscription,
  onCancel,
  onResume,
  cancelPending,
  resumePending,
}: CurrentPlanCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { plan } = subscription;
  const status = SUBSCRIPTION_STATUS_META[subscription.status] ?? SUBSCRIPTION_STATUS_META.incomplete;
  const level = ACCESS_LEVEL_META[access.level];
  const yearly = subscription.billing_period === 'yearly';
  const amount = yearly ? plan.price_yearly : plan.price_monthly;

  const handleCancel = async () => {
    await onCancel();
    setConfirmOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-tile flex h-10 w-10 items-center justify-center">
            <CreditCard className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle>{access.is_demo ? 'Demo account' : `${planLabel(plan)} plan`}</CardTitle>
            <CardDescription>
              {plan.is_paid
                ? `${formatMoney(amount, plan.currency)} / ${yearly ? 'year' : 'month'}`
                : 'Every feature unlocked while you evaluate. No charge.'}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant={level.variant}>{level.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {plan.is_paid && hasLiveSubscription && (
          <p className="text-xs text-secondary">
            {subscription.cancel_at_period_end
              ? `Cancels on ${formatDate(subscription.current_period_end)}.`
              : subscription.status === 'trialing' && subscription.trial_end
                ? `Trial ends on ${formatDate(subscription.trial_end)}.`
                : `Renews on ${formatDate(subscription.current_period_end)}.`}
          </p>
        )}

        {access.level !== BillingAccessLevel.FULL && (
          <p className="text-xs text-danger">Access to the CRM is blocked until a payment is made.</p>
        )}

        {access.is_demo ? (
          <div className="space-y-1.5">
            <p className="text-xs text-secondary">
              {access.demo_ends_at
                ? new Date(access.demo_ends_at).getTime() > Date.now()
                  ? `Your demo ends on ${formatDemoEnd(access.demo_ends_at)} (${demoTimeLeft(access.demo_ends_at)}).`
                  : `Your demo ended on ${formatDemoEnd(access.demo_ends_at)}.`
                : 'Your demo has no end date.'}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-secondary">
              <Sparkles className="h-3 w-3 shrink-0 text-accent" />
              Choose a plan below to keep using the CRM after your evaluation.
            </p>
          </div>
        ) : plan.features.length > 0 && (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {plan.features.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-xs text-secondary">
                <CheckCircle className="h-3 w-3 shrink-0 text-accent/75" />
                {featureLabel(f)}
              </li>
            ))}
          </ul>
        )}

        {hasLiveSubscription && (
          <div className="flex justify-end border-t border-subtle pt-4">
            {subscription.cancel_at_period_end ? (
              <Button size="sm" onClick={onResume} disabled={resumePending}>
                {resumePending ? 'Resuming…' : 'Keep subscription'}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(true)}>
                Cancel subscription
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription className="text-xs">
              You keep {planLabel(plan)} until {formatDate(subscription.current_period_end)}. After that, access to
              the CRM is blocked until you subscribe again.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Keep plan
            </Button>
            <Button size="sm" variant="destructive" onClick={handleCancel} disabled={cancelPending}>
              {cancelPending ? 'Canceling…' : 'Cancel at period end'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
