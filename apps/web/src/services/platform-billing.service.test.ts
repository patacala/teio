import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { platformBillingService } from './platform-billing.service';

const ORG = '0e6f2f3c-1c58-4c4f-9b2a-3d7c2b8f9a10';

describe('platformBillingService', () => {
  itCallsEndpoints([
    { name: 'getDemoDefaults', call: () => platformBillingService.getDemoDefaults(), method: 'get', path: '/platform/billing/demo/defaults' },
    {
      name: 'updateDemoDefaults',
      call: () => platformBillingService.updateDemoDefaults({ ai_calls: 50, messages: -1 }),
      method: 'patch',
      path: '/platform/billing/demo/defaults',
      body: { ai_calls: 50, messages: -1 },
    },
    {
      name: 'getDemoOrganizations (defaults)',
      call: () => platformBillingService.getDemoOrganizations(),
      method: 'get',
      path: '/platform/billing/demo/organizations',
      query: { page: '1', limit: '20' },
    },
    {
      name: 'getDemoOrganizations (search)',
      call: () => platformBillingService.getDemoOrganizations({ search: '  acme ', page: 3, limit: 10 }),
      method: 'get',
      path: '/platform/billing/demo/organizations',
      query: { page: '3', limit: '10', search: 'acme' },
    },
    {
      name: 'setOrganizationLimits',
      call: () => platformBillingService.setOrganizationLimits(ORG, { agents: 5 }),
      method: 'put',
      path: `/platform/billing/demo/organizations/${ORG}/limits`,
      body: { agents: 5 },
    },
    {
      name: 'updateDemoDefaults (demo length)',
      call: () => platformBillingService.updateDemoDefaults({ demo_duration_days: null }),
      method: 'patch',
      path: '/platform/billing/demo/defaults',
      body: { demo_duration_days: null },
    },
    {
      name: 'setOrganizationDemoPeriod (date)',
      call: () => platformBillingService.setOrganizationDemoPeriod(ORG, '2026-07-01T23:59:59.999Z'),
      method: 'put',
      path: `/platform/billing/demo/organizations/${ORG}/period`,
      body: { ends_at: '2026-07-01T23:59:59.999Z' },
    },
    {
      name: 'setOrganizationDemoPeriod (free forever)',
      call: () => platformBillingService.setOrganizationDemoPeriod(ORG, null),
      method: 'put',
      path: `/platform/billing/demo/organizations/${ORG}/period`,
      body: { ends_at: null },
    },
    {
      name: 'resetOrganizationLimits',
      call: () => platformBillingService.resetOrganizationLimits(ORG),
      method: 'delete',
      path: `/platform/billing/demo/organizations/${ORG}/limits`,
    },
  ]);
});
