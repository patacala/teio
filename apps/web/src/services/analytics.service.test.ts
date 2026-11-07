import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { analyticsService } from './analytics.service';

describe('analyticsService', () => {
  itCallsEndpoints([
    {
      name: 'getDashboardStats defaults to the last 30 days',
      call: () => analyticsService.getDashboardStats(),
      method: 'get',
      path: '/analytics/dashboard',
      query: { range: '30d' },
    },
    {
      name: 'getDashboardStats with a preset range',
      call: () => analyticsService.getDashboardStats('7d'),
      method: 'get',
      path: '/analytics/dashboard',
      query: { range: '7d' },
    },
    {
      name: 'getDashboardStats with a custom date range',
      call: () => analyticsService.getDashboardStats('90d', { from: '2026-01-01', to: '2026-01-31' }),
      method: 'get',
      path: '/analytics/dashboard',
      query: { range: '90d', from: '2026-01-01', to: '2026-01-31' },
    },
  ]);
});
