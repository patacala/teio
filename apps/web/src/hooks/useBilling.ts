'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { billingService } from '@/services/billing.service';

export function useBillingPlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => billingService.getPlans(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useBillingSubscription() {
  return useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => billingService.getSubscription(),
    staleTime: 60_000,
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: (returnUrl: string) => billingService.createPortalSession(returnUrl),
  });
}

export function useCancelSubscription() {
  return useMutation({
    mutationFn: () => billingService.cancelSubscription(),
  });
}
