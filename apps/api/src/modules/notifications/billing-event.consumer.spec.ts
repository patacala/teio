import { BillingEventConsumer } from './billing-event.consumer';

/** Billing events are tracked for analytics only; the single billing email (payment failed) is sent by SubscriptionService. */
describe('BillingEventConsumer', () => {
  const analytics = { track: jest.fn(async () => undefined) };
  const consumer = new BillingEventConsumer(analytics as never);
  beforeEach(() => analytics.track.mockReset().mockResolvedValue(undefined));

  it.each([
    ['handleSubscriptionUpdated', { organization_id: 'o', subscription_id: 's', plan_name: 'Pro', status: 'active' }, 'subscription.updated'],
    ['handleSubscriptionCanceled', { organization_id: 'o', subscription_id: 's', plan_name: 'Pro' }, 'subscription.canceled'],
    ['handleInvoicePaid', { organization_id: 'o', invoice_id: 'i', amount: 149, currency: 'usd' }, 'invoice.paid'],
    ['handleInvoicePaymentFailed', { organization_id: 'o', invoice_id: 'i', amount: 149, currency: 'usd' }, 'invoice.payment.failed'],
  ] as const)('%s tracks %s', async (method, payload, eventType) => {
    await (consumer[method] as (p: unknown) => Promise<void>)(payload);
    expect(analytics.track).toHaveBeenCalledWith('o', expect.objectContaining({ event_type: eventType }));
  });

  it('never throws (the message must not go to the dead-letter queue for an analytics failure)', async () => {
    analytics.track.mockRejectedValueOnce(new Error('db down'));
    await expect(consumer.handleInvoicePaid({ organization_id: 'o', invoice_id: 'i' })).resolves.toBeUndefined();
  });
});
