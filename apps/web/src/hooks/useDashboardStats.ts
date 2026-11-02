'use client';

import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/services/analytics.service';
import type { DashboardRange, CustomDateRange } from '@/services/analytics.service';

export function useDashboardStats(range: DashboardRange = '30d', custom?: CustomDateRange) {
  return useQuery({
    queryKey: ['dashboard-stats', range, custom?.from, custom?.to],
    queryFn: () => analyticsService.getDashboardStats(range, custom),
    staleTime: 30_000,
  });
}
