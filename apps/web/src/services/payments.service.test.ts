import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { paymentsService } from './payments.service';

describe('paymentsService', () => {
  itCallsEndpoints([
    { name: 'getSettings', call: () => paymentsService.getSettings(), method: 'get', path: '/payments/settings' },
    {
      name: 'updateSettings',
      call: () => paymentsService.updateSettings({ stripe_secret_key: 'sk_test_123', currency: 'mxn' }),
      method: 'patch',
      path: '/payments/settings',
      body: { stripe_secret_key: 'sk_test_123', currency: 'mxn' },
    },
    { name: 'getServices', call: () => paymentsService.getServices(), method: 'get', path: '/payments/services' },
    {
      name: 'createService sends the amount in cents',
      call: () => paymentsService.createService({ name: 'Consultation', amount: 50000, is_active: true }),
      method: 'post',
      path: '/payments/services',
      body: { name: 'Consultation', amount: 50000, is_active: true },
    },
    {
      name: 'updateService',
      call: () => paymentsService.updateService('svc-1', { amount: 45000 }),
      method: 'patch',
      path: '/payments/services/svc-1',
      body: { amount: 45000 },
    },
    { name: 'deleteService', call: () => paymentsService.deleteService('svc-1'), method: 'delete', path: '/payments/services/svc-1' },
    { name: 'getPayments for the org', call: () => paymentsService.getPayments(), method: 'get', path: '/payments' },
    {
      name: 'getPayments for one contact',
      call: () => paymentsService.getPayments('contact-1'),
      method: 'get',
      path: '/payments',
      query: { contact_id: 'contact-1' },
    },
    {
      name: 'createPayment with a booking',
      call: () =>
        paymentsService.createPayment({
          contact_id: 'contact-1',
          service_id: 'svc-1',
          booking: { calendar_id: 'cal-1', starts_at: '2026-03-20T15:00:00Z', duration_minutes: 30 },
        }),
      method: 'post',
      path: '/payments',
      body: {
        contact_id: 'contact-1',
        service_id: 'svc-1',
        booking: { calendar_id: 'cal-1', starts_at: '2026-03-20T15:00:00Z', duration_minutes: 30 },
      },
    },
  ]);

  it('returns the checkout link of a created payment', async () => {
    const link = {
      payment_id: 'pay-1',
      url: 'https://checkout.stripe.test/pay-1',
      amount: 50000,
      currency: 'mxn',
      service_name: 'Consultation',
      appointment_id: null,
      booking: null,
    };
    mockApi('post', '/payments', { data: link });

    await expect(paymentsService.createPayment({ contact_id: 'contact-1', service_id: 'svc-1' })).resolves.toEqual(link);
  });

  it('rejects when Stripe is not connected', async () => {
    mockApi('post', '/payments', { status: 400, message: 'Stripe is not connected' });

    await expect(paymentsService.createPayment({ contact_id: 'contact-1', service_id: 'svc-1' })).rejects.toThrow(
      'Stripe is not connected',
    );
  });
});
