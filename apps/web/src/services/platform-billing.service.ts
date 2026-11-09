import { authClient } from '@/lib/auth-client';
import type { DemoLimitDefaults, DemoOrganization, PaginatedResponse, PlanLimitOverrides } from '@crm/shared';

export type DemoDefaultsBody = PlanLimitOverrides & {
  /** Length of new demos in days; null = no end date. */
  demo_duration_days?: number | null;
};

export interface DemoOrganizationsParams {
  search?: string;
  page?: number;
  limit?: number;
}

export const platformBillingService = {
  getDemoDefaults: () =>
    authClient.get<DemoLimitDefaults>('/platform/billing/demo/defaults'),

  updateDemoDefaults: (body: DemoDefaultsBody) =>
    authClient.patch<DemoLimitDefaults>('/platform/billing/demo/defaults', body),

  getDemoOrganizations: ({ search, page = 1, limit = 20 }: DemoOrganizationsParams = {}) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search?.trim()) qs.set('search', search.trim());
    return authClient.get<PaginatedResponse<DemoOrganization>>(`/platform/billing/demo/organizations?${qs}`);
  },

  setOrganizationLimits: (organizationId: string, limits: PlanLimitOverrides) =>
    authClient.put<void>(`/platform/billing/demo/organizations/${organizationId}/limits`, limits),

  /** `endsAt` null = no end date (free forever). */
  setOrganizationDemoPeriod: (organizationId: string, endsAt: string | null) =>
    authClient.put<void>(`/platform/billing/demo/organizations/${organizationId}/period`, { ends_at: endsAt }),

  resetOrganizationLimits: (organizationId: string) =>
    authClient.delete<void>(`/platform/billing/demo/organizations/${organizationId}/limits`),
};
