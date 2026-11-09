import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { billingService } from './billing.service';

const PLAN_ID = '6f1f0c3e-2d4b-4a8e-9a55-0f5f3f0a1b2c';

describe('billingService', () => {
  itCallsEndpoints([
    { name: 'getPlans', call: () => billingService.getPlans(), method: 'get', path: '/billing/plans' },
    { name: 'getStatus', call: () => billingService.getStatus(), method: 'get', path: '/billing/status' },
    { name: 'getSubscription', call: () => billingService.getSubscription(), method: 'get', path: '/billing/subscription' },
    { name: 'getUsage', call: () => billingService.getUsage(), method: 'get', path: '/billing/usage' },
    {
      name: 'getInvoices',
      call: () => billingService.getInvoices(2, 10),
      method: 'get',
      path: '/billing/invoices',
      query: { page: '2', limit: '10' },
    },
    {
      name: 'startCheckout',
      call: () => billingService.startCheckout({ plan_id: PLAN_ID, period: 'yearly' }),
      method: 'post',
      path: '/billing/checkout',
      body: { plan_id: PLAN_ID, period: 'yearly' },
    },
    {
      name: 'changePlan',
      call: () => billingService.changePlan({ plan_id: PLAN_ID, period: 'monthly' }),
      method: 'post',
      path: '/billing/change-plan',
      body: { plan_id: PLAN_ID, period: 'monthly' },
    },
    {
      name: 'createPaymentMethodSession',
      call: () => billingService.createPaymentMethodSession(),
      method: 'post',
      path: '/billing/payment-method',
      body: {},
    },
    { name: 'createPortalSession', call: () => billingService.createPortalSession(), method: 'post', path: '/billing/portal', body: {} },
    { name: 'cancelSubscription', call: () => billingService.cancelSubscription(), method: 'post', path: '/billing/cancel', body: {} },
    { name: 'resumeSubscription', call: () => billingService.resumeSubscription(), method: 'post', path: '/billing/resume', body: {} },
  ]);

  it('returns the portal url from the response envelope', async () => {
    mockApi('post', '/billing/portal', { data: { url: 'https://billing.stripe.test/session' } });

    await expect(billingService.createPortalSession()).resolves.toEqual({
      url: 'https://billing.stripe.test/session',
    });
  });

  it('rejects with the API error message', async () => {
    mockApi('post', '/billing/cancel', { status: 404, message: 'No active subscription found.' });

    await expect(billingService.cancelSubscription()).rejects.toThrow('No active subscription found.');
  });

  it('surfaces conflict errors to the caller', async () => {
    mockApi('post', '/billing/checkout', { status: 409, message: 'The organization already has a subscription. Change the plan instead.' });

    await expect(billingService.startCheckout({ plan_id: PLAN_ID, period: 'monthly' })).rejects.toThrow(
      'already has a subscription',
    );
  });
});
