'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { PlanFeature } from '@crm/shared';
import type { BillingPeriod, BillingPlan, BillingSubscription } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatMoney } from '@/lib/utils';
import { featureLabel, planLabel } from '@/components/billing/billing-labels';

const LIMIT_LABELS: Array<[keyof BillingPlan['limits'], string]> = [
  ['conversations', 'conversations / mo'],
  ['messages', 'messages / mo'],
  ['ai_calls', 'AI calls / mo'],
  ['voice_minutes', 'voice minutes / mo'],
  ['agents', 'team members'],
];

function formatLimit(value: number): string {
  return value === -1 ? 'Unlimited' : value.toLocaleString('en-US');
}

interface PlanPickerProps {
  plans: BillingPlan[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  subscription: BillingSubscription;
  hasLiveSubscription: boolean;
  onSubscribe: (planId: string, period: BillingPeriod) => void;
  onChangePlan: (planId: string, period: BillingPeriod) => Promise<unknown>;
  pendingPlanId: string | null;
  /** The demo period is over, so the demo plan is no longer usable. */
  demoEnded?: boolean;
}

export function PlanPicker({
  plans,
  isLoading,
  isError,
  onRetry,
  subscription,
  hasLiveSubscription,
  onSubscribe,
  onChangePlan,
  pendingPlanId,
  demoEnded = false,
}: PlanPickerProps) {
  const [period, setPeriod] = useState<BillingPeriod>(subscription.billing_period);
  const [switchTarget, setSwitchTarget] = useState<BillingPlan | null>(null);

  const isCurrent = (plan: BillingPlan) =>
    plan.id === subscription.plan.id && (!plan.is_paid || (hasLiveSubscription && period === subscription.billing_period));

  const confirmSwitch = async () => {
    if (!switchTarget) return;
    await onChangePlan(switchTarget.id, period);
    setSwitchTarget(null);
  };

  return (
    <Card id="plans">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Plans</CardTitle>
          <CardDescription>Prices and limits are set per plan. Changes are prorated.</CardDescription>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as BillingPeriod)}>
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-primary">Could not load plans.</p>
            <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
          </div>
        ) : !plans?.length ? (
          <p className="py-8 text-center text-sm text-muted">No plans are available right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const current = isCurrent(plan);
              const price = period === 'yearly' ? plan.price_yearly : plan.price_monthly;
              const purchasable = plan.is_paid && price > 0;
              const pending = pendingPlanId === plan.id;
              return (
                <div
                  key={plan.id}
                  data-testid={`plan-${plan.name}`}
                  className={cn('inset-surface flex flex-col gap-3 p-4', current && 'border border-accent/40')}
                >
                  <div>
                    <p className="text-sm font-semibold text-primary">{planLabel(plan)}</p>
                    <p className="mt-1 text-xl font-bold text-primary">
                      {plan.is_paid ? formatMoney(price, plan.currency) : 'Free'}
                      {plan.is_paid && (
                        <span className="text-xs font-normal text-muted"> / {period === 'yearly' ? 'year' : 'month'}</span>
                      )}
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {LIMIT_LABELS.map(([key, label]) => (
                      <li key={key} className="text-xs text-secondary">
                        <span className="font-medium text-primary">{formatLimit(plan.limits[key])}</span> {label}
                      </li>
                    ))}
                  </ul>
                  <ul className="flex-1 space-y-1">
                    {(plan.is_paid ? plan.features : [PlanFeature.ALL]).map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-secondary">
                        <Check className="h-3 w-3 shrink-0 text-accent" />
                        {featureLabel(f)}
                      </li>
                    ))}
                  </ul>
                  {current && !plan.is_paid && demoEnded ? (
                    <p className="text-center text-[11px] text-danger">Your demo has ended.</p>
                  ) : current ? (
                    <Button size="sm" variant="secondary" disabled>Current plan</Button>
                  ) : !purchasable ? (
                    <p className="text-center text-[11px] text-muted">
                      Only available before subscribing.
                    </p>
                  ) : hasLiveSubscription ? (
                    <Button size="sm" variant="secondary" onClick={() => setSwitchTarget(plan)} disabled={!!pendingPlanId}>
                      {pending ? 'Switching…' : 'Switch to this plan'}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onSubscribe(plan.id, period)} disabled={!!pendingPlanId}>
                      {pending ? 'Redirecting…' : 'Subscribe'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!switchTarget} onOpenChange={(open) => !open && setSwitchTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Switch to {switchTarget ? planLabel(switchTarget) : ''}?</DialogTitle>
            <DialogDescription className="text-xs">
              {switchTarget &&
                `${formatMoney(period === 'yearly' ? switchTarget.price_yearly : switchTarget.price_monthly, switchTarget.currency)} / ${period === 'yearly' ? 'year' : 'month'}. `}
              The difference for the current period is prorated on your next invoice, charged to your default payment method.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSwitchTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={confirmSwitch} disabled={!!pendingPlanId}>
              {pendingPlanId ? 'Switching…' : 'Confirm switch'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
