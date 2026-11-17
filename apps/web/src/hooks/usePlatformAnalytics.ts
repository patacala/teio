'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlatformRange } from '@crm/shared';
import type { CustomDateRange } from '@/services/analytics.service';
import { organizationsService } from '@/services/organizations.service';
import {
  platformAnalyticsService,
  type PlatformLeadsParams,
  type PlatformOrganizationsParams,
} from '@/services/platform-analytics.service';

export const platformAnalyticsKeys = {
  all: ['platform-analytics'] as const,
  overview: (range: PlatformRange, custom: CustomDateRange | null) =>
    ['platform-analytics', 'overview', range, custom?.from ?? null, custom?.to ?? null] as const,
  attention: () => ['platform-analytics', 'attention'] as const,
  leads: (params: PlatformLeadsParams) => ['platform-analytics', 'leads', params] as const,
  organizations: (params: PlatformOrganizationsParams) => ['platform-analytics', 'organizations', params] as const,
};

const STALE_MS = 30_000;

export function usePlatformOverview(range: PlatformRange, custom: CustomDateRange | null) {
  return useQuery({
    queryKey: platformAnalyticsKeys.overview(range, custom),
    queryFn: () => platformAnalyticsService.getOverview(range, custom ?? undefined),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function usePlatformAttention() {
  return useQuery({
    queryKey: platformAnalyticsKeys.attention(),
    queryFn: () => platformAnalyticsService.getAttention(),
    staleTime: STALE_MS,
  });
}

export function usePlatformLeads(params: PlatformLeadsParams) {
  return useQuery({
    queryKey: platformAnalyticsKeys.leads(params),
    queryFn: () => platformAnalyticsService.getLeads(params),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function usePlatformOrganizations(params: PlatformOrganizationsParams) {
  return useQuery({
    queryKey: platformAnalyticsKeys.organizations(params),
    queryFn: () => platformAnalyticsService.getOrganizations(params),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/** Marks an organization internal (or not): every platform figure changes with it. */
export function useSetOrganizationInternal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, isInternal }: { organizationId: string; isInternal: boolean }) =>
      organizationsService.setInternal(organizationId, isInternal),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformAnalyticsKeys.all });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
