import { authClient } from '@/lib/auth-client';
import type {
  BillingAccess,
  BillingInvoice,
  BillingOverview,
  BillingPeriod,
  BillingPlan,
  BillingRedirect,
  PaginatedResponse,
} from '@crm/shared';

export interface PlanSelectionBody {
  plan_id: string;
  period: BillingPeriod;
}

export const billingService = {
  getPlans: () =>
    authClient.get<BillingPlan[]>('/billing/plans'),

  getStatus: () =>
    authClient.get<BillingAccess>('/billing/status'),

  getSubscription: () =>
    authClient.get<BillingOverview>('/billing/subscription'),

  getUsage: () =>
    authClient.get<BillingOverview['usage']>('/billing/usage'),

  getInvoices: (page = 1, limit = 10) =>
    authClient.get<PaginatedResponse<BillingInvoice>>(`/billing/invoices?page=${page}&limit=${limit}`),

  startCheckout: (body: PlanSelectionBody) =>
    authClient.post<BillingRedirect>('/billing/checkout', body),

  changePlan: (body: PlanSelectionBody) =>
    authClient.post<BillingOverview>('/billing/change-plan', body),

  createPaymentMethodSession: () =>
    authClient.post<BillingRedirect>('/billing/payment-method', {}),

  createPortalSession: () =>
    authClient.post<BillingRedirect>('/billing/portal', {}),

  cancelSubscription: () =>
    authClient.post<BillingOverview>('/billing/cancel', {}),

  resumeSubscription: () =>
    authClient.post<BillingOverview>('/billing/resume', {}),
};
