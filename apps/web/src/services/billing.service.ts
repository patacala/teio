import { authClient } from '@/lib/auth-client';
import type { BillingOverview, BillingPlan } from '@crm/shared';

export const billingService = {
  getPlans: () =>
    authClient.get<BillingPlan[]>('/billing/plans'),

  getSubscription: () =>
    authClient.get<BillingOverview>('/billing/subscription'),

  getUsage: () =>
    authClient.get<BillingOverview['usage']>('/billing/usage'),

  createPortalSession: (returnUrl: string) =>
    authClient.post<{ url: string }>('/billing/portal', { returnUrl }),

  cancelSubscription: () =>
    authClient.post<void>('/billing/cancel', {}),
};
