import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { platformAnalyticsService } from './platform-analytics.service';

describe('platformAnalyticsService', () => {
  itCallsEndpoints([
    {
      name: 'getOverview (default range)',
      call: () => platformAnalyticsService.getOverview(),
      method: 'get',
      path: '/platform/analytics/overview',
      query: { range: '30d' },
    },
    {
      name: 'getOverview (custom period replaces the range)',
      call: () => platformAnalyticsService.getOverview('7d', { from: '2026-05-01', to: '2026-05-31' }),
      method: 'get',
      path: '/platform/analytics/overview',
      query: { from: '2026-05-01', to: '2026-05-31' },
    },
    { name: 'getAttention', call: () => platformAnalyticsService.getAttention(), method: 'get', path: '/platform/analytics/attention' },
    {
      name: 'getLeads (defaults)',
      call: () => platformAnalyticsService.getLeads(),
      method: 'get',
      path: '/platform/analytics/leads',
      query: { page: '1', limit: '10' },
    },
    {
      name: 'getLeads (source and search)',
      call: () => platformAnalyticsService.getLeads({ source: 'demo_request', search: '  acme ', page: 2, limit: 5 }),
      method: 'get',
      path: '/platform/analytics/leads',
      query: { page: '2', limit: '5', search: 'acme', source: 'demo_request' },
    },
    {
      name: 'getOrganizations (defaults)',
      call: () => platformAnalyticsService.getOrganizations(),
      method: 'get',
      path: '/platform/analytics/organizations',
      query: { page: '1', limit: '10' },
    },
    {
      name: 'getOrganizations (filter, sort, search)',
      call: () => platformAnalyticsService.getOrganizations({ filter: 'ending_soon', sort: 'demo_end', search: 'gale', page: 3 }),
      method: 'get',
      path: '/platform/analytics/organizations',
      query: { page: '3', limit: '10', search: 'gale', filter: 'ending_soon', sort: 'demo_end' },
    },
  ]);
});
