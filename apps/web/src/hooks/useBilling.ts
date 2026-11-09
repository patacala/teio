'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingOverview, BillingRedirect } from '@crm/shared';
import { billingService, type PlanSelectionBody } from '@/services/billing.service';
import { navigateToExternal } from '@/lib/navigation';

export const billingKeys = {
  all: ['billing'] as const,
  plans: () => ['billing', 'plans'] as const,
  status: () => ['billing', 'status'] as const,
  subscription: () => ['billing', 'subscription'] as const,
  invoices: (page: number) => ['billing', 'invoices', page] as const,
};

function redirectTo({ url }: BillingRedirect) {
  navigateToExternal(url);
}

export function useBillingPlans() {
  return useQuery({
    queryKey: billingKeys.plans(),
    queryFn: () => billingService.getPlans(),
    staleTime: 5 * 60 * 1000,
  });
}

/** Access level for the current org — readable by every member. */
export function useBillingStatus(enabled = true) {
  return useQuery({
    queryKey: billingKeys.status(),
    queryFn: () => billingService.getStatus(),
    staleTime: 60_000,
    enabled,
  });
}

/** Owner/admin overview. `pollMs` is used right after returning from Stripe, before webhooks land. */
export function useBillingSubscription(pollMs: number | false = false) {
  return useQuery({
    queryKey: billingKeys.subscription(),
    queryFn: () => billingService.getSubscription(),
    staleTime: 60_000,
    refetchInterval: pollMs,
  });
}

export function useBillingInvoices(page = 1) {
  return useQuery({
    queryKey: billingKeys.invoices(page),
    queryFn: () => billingService.getInvoices(page),
    staleTime: 60_000,
  });
}

export function useStartCheckout() {
  return useMutation({
    mutationFn: (body: PlanSelectionBody) => billingService.startCheckout(body),
    onSuccess: redirectTo,
  });
}

export function useConnectPaymentMethod() {
  return useMutation({
    mutationFn: () => billingService.createPaymentMethodSession(),
    onSuccess: redirectTo,
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: () => billingService.createPortalSession(),
    onSuccess: redirectTo,
  });
}

function useOverviewMutation<TVariables>(mutationFn: (vars: TVariables) => Promise<BillingOverview>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (overview) => {
      qc.setQueryData(billingKeys.subscription(), overview);
      return qc.invalidateQueries({ queryKey: billingKeys.all });
    },
  });
}

export function useChangePlan() {
  return useOverviewMutation((body: PlanSelectionBody) => billingService.changePlan(body));
}

export function useCancelSubscription() {
  return useOverviewMutation(() => billingService.cancelSubscription());
}

export function useResumeSubscription() {
  return useOverviewMutation(() => billingService.resumeSubscription());
}
