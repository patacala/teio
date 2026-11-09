/// <reference types="jest" />
import { BadGatewayException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';

function serviceWith(retrieve: jest.Mock): StripeService {
  const config = { get: (key: string, d: unknown) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_x' : d) };
  const service = new StripeService(config as unknown as ConfigService);
  (service as unknown as { _stripe: unknown })._stripe = { subscriptions: { retrieve } };
  return service;
}

describe('StripeService error handling', () => {
  it('reports a missing secret key as 503 instead of a raw 500', async () => {
    const service = new StripeService({ get: (_k: string, d: unknown) => d } as unknown as ConfigService);
    expect(service.isConfigured()).toBe(false);
    await expect(service.retrieveSubscription('sub_1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("passes card errors to the payer as 402 with Stripe's message", async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(
      new Stripe.errors.StripeCardError({ type: 'card_error', message: 'Your card was declined.' }),
    ));
    await expect(service.retrieveSubscription('sub_1')).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
      message: 'Your card was declined.',
    });
  });

  it('hides other Stripe errors behind a generic 502', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(
      new Stripe.errors.StripeAuthenticationError({ type: 'authentication_error', message: 'Invalid API Key provided: sk_test_***' }),
    ));
    const err = await service.retrieveSubscription('sub_1').catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(err.message).not.toContain('sk_test');
  });

  it('does not swallow non-Stripe errors', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(new TypeError('bug')));
    await expect(service.retrieveSubscription('sub_1')).rejects.toBeInstanceOf(TypeError);
  });
});
