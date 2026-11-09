'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanLimitOverrides } from '@crm/shared';
import {
  platformBillingService,
  type DemoDefaultsBody,
  type DemoOrganizationsParams,
} from '@/services/platform-billing.service';

export const platformBillingKeys = {
  all: ['platform-billing'] as const,
  demoDefaults: () => ['platform-billing', 'demo-defaults'] as const,
  demoOrganizations: (params: DemoOrganizationsParams) => ['platform-billing', 'demo-organizations', params] as const,
};

export function useDemoDefaults() {
  return useQuery({
    queryKey: platformBillingKeys.demoDefaults(),
    queryFn: () => platformBillingService.getDemoDefaults(),
    staleTime: 30_000,
  });
}

export function useDemoOrganizations(params: DemoOrganizationsParams) {
  return useQuery({
    queryKey: platformBillingKeys.demoOrganizations(params),
    queryFn: () => platformBillingService.getDemoOrganizations(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useUpdateDemoDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DemoDefaultsBody) => platformBillingService.updateDemoDefaults(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformBillingKeys.all }),
  });
}

export function useSetOrganizationDemoLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, limits }: { organizationId: string; limits: PlanLimitOverrides }) =>
      platformBillingService.setOrganizationLimits(organizationId, limits),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformBillingKeys.all }),
  });
}

export function useSetOrganizationDemoPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, endsAt }: { organizationId: string; endsAt: string | null }) =>
      platformBillingService.setOrganizationDemoPeriod(organizationId, endsAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformBillingKeys.all }),
  });
}

export function useResetOrganizationDemoLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (organizationId: string) => platformBillingService.resetOrganizationLimits(organizationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformBillingKeys.all }),
  });
}
