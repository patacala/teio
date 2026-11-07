import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { billingService } from './billing.service';

describe('billingService', () => {
  itCallsEndpoints([
    { name: 'getPlans', call: () => billingService.getPlans(), method: 'get', path: '/billing/plans' },
    { name: 'getSubscription', call: () => billingService.getSubscription(), method: 'get', path: '/billing/subscription' },
    { name: 'getUsage', call: () => billingService.getUsage(), method: 'get', path: '/billing/usage' },
    {
      name: 'createPortalSession',
      call: () => billingService.createPortalSession('https://app.test/billing'),
      method: 'post',
      path: '/billing/portal',
      body: { returnUrl: 'https://app.test/billing' },
    },
    { name: 'cancelSubscription', call: () => billingService.cancelSubscription(), method: 'post', path: '/billing/cancel', body: {} },
  ]);

  it('returns the portal url from the response envelope', async () => {
    mockApi('post', '/billing/portal', { data: { url: 'https://billing.stripe.test/session' } });

    await expect(billingService.createPortalSession('https://app.test')).resolves.toEqual({
      url: 'https://billing.stripe.test/session',
    });
  });

  it('rejects with the API error message', async () => {
    mockApi('post', '/billing/cancel', { status: 409, message: 'No active subscription' });

    await expect(billingService.cancelSubscription()).rejects.toThrow('No active subscription');
  });
});
