'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BillingRestrictionReason } from '@crm/shared';
import type { BillingPeriod } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBillingPlans,
  useBillingSubscription,
  useCancelSubscription,
  useChangePlan,
  useConnectPaymentMethod,
  useCreatePortalSession,
  useResumeSubscription,
  useStartCheckout,
} from '@/hooks/useBilling';
import { toast } from '@/hooks/useToast';
import { BillingAlert } from './_components/BillingAlert';
import { CurrentPlanCard } from './_components/CurrentPlanCard';
import { PaymentMethodCard } from './_components/PaymentMethodCard';
import { PlanPicker } from './_components/PlanPicker';
import { UsageCard } from './_components/UsageCard';
import { InvoicesCard } from './_components/InvoicesCard';

const RETURN_POLL_MS = 3_000;
const RETURN_POLL_WINDOW_MS = 30_000;

const RETURN_MESSAGES: Record<string, { title: string; description?: string; variant: 'default' | 'info' }> = {
  'checkout=success': {
    title: 'Payment received',
    description: 'Your subscription will update in a few seconds.',
    variant: 'default',
  },
  'checkout=canceled': { title: 'Checkout canceled. No charge was made.', variant: 'info' },
  'payment_method=success': {
    title: 'Payment method saved',
    description: 'It will be used for your next invoices.',
    variant: 'default',
  },
  'payment_method=canceled': { title: 'Payment method was not changed.', variant: 'info' },
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function BillingPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

function useStripeReturn(): boolean {
  const params = useSearchParams();
  const router = useRouter();
  const handledKey = useRef<string | null>(null);
  const [pollUntil, setPollUntil] = useState<number | null>(null);

  const key = ['checkout', 'payment_method']
    .map((k) => (params.get(k) ? `${k}=${params.get(k)}` : null))
    .find(Boolean);

  useEffect(() => {
    if (!key || handledKey.current === key) return;
    handledKey.current = key;
    const message = RETURN_MESSAGES[key];
    if (message) toast(message);
    if (key.endsWith('=success')) setPollUntil(Date.now() + RETURN_POLL_WINDOW_MS);
    router.replace('/admin/billing');
  }, [key, router]);

  useEffect(() => {
    if (pollUntil === null) return;
    const timer = setTimeout(() => setPollUntil(null), Math.max(0, pollUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [pollUntil]);

  return pollUntil !== null;
}

function BillingPageContent() {
  const awaitingWebhook = useStripeReturn();
  const overview = useBillingSubscription(awaitingWebhook ? RETURN_POLL_MS : false);
  const plans = useBillingPlans();
  const startCheckout = useStartCheckout();
  const changePlan = useChangePlan();
  const connectPaymentMethod = useConnectPaymentMethod();
  const portal = useCreatePortalSession();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const redirectBusy = connectPaymentMethod.isPending || portal.isPending || startCheckout.isPending;

  const handleSubscribe = (planId: string, period: BillingPeriod) => {
    setPendingPlanId(planId);
    startCheckout.mutate(
      { plan_id: planId, period },
      {
        onError: (err) => {
          setPendingPlanId(null);
          toast({ title: 'Could not start checkout', description: errorMessage(err, 'Try again later.'), variant: 'error' });
        },
      },
    );
  };

  const handleChangePlan = async (planId: string, period: BillingPeriod) => {
    setPendingPlanId(planId);
    try {
      await changePlan.mutateAsync({ plan_id: planId, period });
      toast({ title: 'Plan updated' });
    } catch (err) {
      toast({ title: 'Could not change the plan', description: errorMessage(err, 'Try again later.'), variant: 'error' });
    } finally {
      setPendingPlanId(null);
    }
  };

  const handleConnectPaymentMethod = () =>
    connectPaymentMethod.mutate(undefined, {
      onError: (err) =>
        toast({ title: 'Could not open the payment form', description: errorMessage(err, 'Try again later.'), variant: 'error' }),
    });

  const handleOpenPortal = () =>
    portal.mutate(undefined, {
      onError: (err) =>
        toast({ title: 'Could not open the billing portal', description: errorMessage(err, 'Try again later.'), variant: 'error' }),
    });

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync();
      toast({ title: 'Subscription will cancel at the end of the period' });
    } catch (err) {
      toast({ title: 'Could not cancel the subscription', description: errorMessage(err, 'Try again later.'), variant: 'error' });
    }
  };

  const handleResume = async () => {
    try {
      await resume.mutateAsync();
      toast({ title: 'Subscription resumed' });
    } catch (err) {
      toast({ title: 'Could not resume the subscription', description: errorMessage(err, 'Try again later.'), variant: 'error' });
    }
  };

  if (overview.isLoading) return <BillingPageSkeleton />;

  if (overview.isError || !overview.data) {
    return (
      <div className="panel-card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm font-medium text-primary">Could not load billing information.</p>
        <p className="text-xs text-muted">{errorMessage(overview.error, 'Please try again.')}</p>
        <Button size="sm" variant="secondary" onClick={() => overview.refetch()}>Try again</Button>
      </div>
    );
  }

  const { subscription, access, usage, limits, has_live_subscription } = overview.data;
  const paymentMethodRequired = access.reasons.some(
    (r) => r === BillingRestrictionReason.PAYMENT_METHOD_MISSING || r === BillingRestrictionReason.PAYMENT_METHOD_EXPIRED,
  );

  return (
    <div className="space-y-4">
      {awaitingWebhook && (
        <p className="text-xs text-muted" aria-live="polite">Syncing with Stripe…</p>
      )}

      <BillingAlert
        access={access}
        onConnectPaymentMethod={handleConnectPaymentMethod}
        onOpenPortal={handleOpenPortal}
        onChoosePlan={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}
        busy={redirectBusy}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CurrentPlanCard
          subscription={subscription}
          access={access}
          hasLiveSubscription={has_live_subscription}
          onCancel={handleCancel}
          onResume={handleResume}
          cancelPending={cancel.isPending}
          resumePending={resume.isPending}
        />
        <PaymentMethodCard
          paymentMethod={subscription.payment_method}
          required={paymentMethodRequired}
          hasCustomer={!!subscription.stripe_customer_id}
          onConnect={handleConnectPaymentMethod}
          onOpenPortal={handleOpenPortal}
          connectPending={connectPaymentMethod.isPending}
          portalPending={portal.isPending}
        />
      </div>

      <PlanPicker
        plans={plans.data}
        isLoading={plans.isLoading}
        isError={plans.isError}
        onRetry={() => plans.refetch()}
        subscription={subscription}
        hasLiveSubscription={has_live_subscription}
        onSubscribe={handleSubscribe}
        onChangePlan={handleChangePlan}
        pendingPlanId={pendingPlanId}
        demoEnded={access.reasons.includes(BillingRestrictionReason.DEMO_EXPIRED)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UsageCard usage={usage} limits={limits} customLimits={access.has_custom_limits} />
        <InvoicesCard />
      </div>
    </div>
  );
}

export default function AdminBillingPage() {
  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Billing</h1>
        <p className="mt-0.5 text-xs text-secondary">
          Your CRM subscription, payment method and invoices. Payments you collect from your own customers are managed in
          Settings → Payments.
        </p>
      </div>
      <Suspense fallback={<BillingPageSkeleton />}>
        <BillingPageContent />
      </Suspense>
    </div>
  );
}
