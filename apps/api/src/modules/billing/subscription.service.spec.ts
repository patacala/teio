/// <reference types="jest" />
import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { SubscriptionService } from './subscription.service';
import type { StripeService } from './stripe.service';
import type { BillingAccessService } from './billing-access.service';
import type { PlanEntity } from './entities/plan.entity';
import type { SubscriptionEntity } from './entities/subscription.entity';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

const FREE: PlanEntity = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'free', price_monthly: 0, price_yearly: 0,
  currency: 'usd', limits: {}, features: [], stripe_price_id_monthly: null,
  stripe_price_id_yearly: null, stripe_product_id: null, is_active: true, sort_order: 0,
  created_at: new Date(), updated_at: new Date(), demo_duration_days: 7,
};
const PRO: PlanEntity = {
  ...FREE, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'professional',
  price_monthly: 14900, price_yearly: 149000, stripe_product_id: 'prod_pro', sort_order: 2,
};

function baseSub(overrides: Partial<SubscriptionEntity> = {}): SubscriptionEntity {
  return {
    id: 'sub-row', organization_id: ORG, plan_id: FREE.id, plan: FREE,
    stripe_customer_id: 'cus_1', stripe_subscription_id: null, status: 'active',
    billing_period: 'monthly', current_period_start: new Date('2026-06-01'),
    current_period_end: new Date('2026-07-01'), trial_end: null, cancel_at_period_end: false,
    metadata: {}, past_due_since: null, payment_method_id: null, payment_method_type: null,
    payment_method_brand: null, payment_method_last4: null, payment_method_exp_month: null,
    payment_method_exp_year: null, demo_limit_overrides: {}, demo_limits_updated_at: null,
    demo_limits_updated_by: null, demo_ends_at: null, demo_period_updated_at: null,
    demo_period_updated_by: null, created_at: new Date(), updated_at: new Date(),
    organization: undefined as never,
    ...overrides,
  };
}

function stripeSub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_A', customer: 'cus_1', status: 'active', cancel_at_period_end: false, cancel_at: null,
    trial_end: null, metadata: {}, default_payment_method: null,
    items: { data: [{
      id: 'si_1', current_period_start: 1_780_000_000, current_period_end: 1_782_592_000,
      price: { id: 'price_inline', product: 'prod_pro', recurring: { interval: 'month' } },
    }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: unknown, id = 'evt_1'): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

function setup(initial: SubscriptionEntity = baseSub()) {
  let row = initial;
  const plans = [FREE, PRO];
  const claimed = new Set<string>();
  const invoices = new Map<string, { status: string }>();

  const matches = (where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);

  const subRepo = {
    findOne: jest.fn(async ({ where }) => (matches(where) ? row : null)),
    findOneOrFail: jest.fn(async () => row),
    save: jest.fn(async (s: SubscriptionEntity) => (row = s)),
    update: jest.fn(async (_c, patch) => (row = { ...row, ...patch })),
    insert: jest.fn(),
  };
  const planRepo = {
    findOne: jest.fn(async ({ where }) => {
      const conds = Array.isArray(where) ? where : [where];
      return plans.find((p) => conds.some((c: Record<string, unknown>) =>
        Object.entries(c).every(([k, v]) => (p as unknown as Record<string, unknown>)[k] === v))) ?? null;
    }),
    find: jest.fn(async () => plans),
    update: jest.fn(),
  };
  const invoiceRepo = {
    findOne: jest.fn(async ({ where }) => invoices.get(where.stripe_invoice_id) ?? null),
    upsert: jest.fn(async (v) => invoices.set(v.stripe_invoice_id, { status: v.status })),
    findAndCount: jest.fn(),
  };
  const insertChain = {
    insert: () => insertChain, into: () => insertChain, orIgnore: () => insertChain,
    returning: () => insertChain,
    values: (v: { stripe_event_id: string }) => {
      insertChain.current = v.stripe_event_id;
      return insertChain;
    },
    current: '',
    execute: async () => {
      if (claimed.has(insertChain.current)) return { raw: [] };
      claimed.add(insertChain.current);
      return { raw: [{ id: 'x' }] };
    },
  };
  const stripeEventRepo = {
    createQueryBuilder: () => insertChain,
    update: jest.fn(),
    delete: jest.fn(async ({ stripe_event_id }) => claimed.delete(stripe_event_id)),
  };
  const orgRepo = { update: jest.fn(), findOne: jest.fn(async () => ({ id: ORG })), findOneOrFail: jest.fn() };
  const userRepo = { findOne: jest.fn(async () => ({ email: 'owner@acme.test' })) };

  const stripe = {
    retrieveSubscription: jest.fn(async (id: string) => stripeSub({ id })),
    retrievePrice: jest.fn(),
    createProduct: jest.fn(async () => ({ id: 'prod_new' })),
    createSubscriptionCheckoutSession: jest.fn(async () => ({ url: 'https://checkout.stripe.test/s' })),
    createSetupCheckoutSession: jest.fn(),
    retrieveCheckoutSession: jest.fn(),
    setDefaultPaymentMethod: jest.fn(),
    retrievePaymentMethod: jest.fn(),
    changeSubscriptionPrice: jest.fn(),
    createCustomer: jest.fn(),
  };
  const billingAccess = {
    invalidate: jest.fn(),
    getAccess: jest.fn(async () => ({ effective_limits: {} })),
    getUsage: jest.fn(async () => ({})),
  };
  const config = { get: jest.fn((_k: string, d: unknown) => (_k === 'billing.webUrl' ? 'https://app.test' : d)) };
  const rabbit = { emit: jest.fn() };
  const dispatch = { dispatch: jest.fn(async (_arg: { eventType: string }) => undefined) };

  const service = new SubscriptionService(
    planRepo as never, subRepo as never, invoiceRepo as never, stripeEventRepo as never,
    orgRepo as never, userRepo as never, stripe as unknown as StripeService,
    billingAccess as unknown as BillingAccessService,
    config as unknown as ConfigService, rabbit as never, dispatch as never,
  );

  return { service, stripe, billingAccess, orgRepo, rabbit, dispatch, invoiceRepo, stripeEventRepo,
    get row() { return row; } };
}

describe('SubscriptionService — Stripe webhooks', () => {
  it('processes each Stripe event id once', async () => {
    const t = setup();
    const evt = event('customer.subscription.updated', stripeSub());
    await t.service.handleStripeEvent(evt);
    await t.service.handleStripeEvent(evt);
    expect(t.stripe.retrieveSubscription).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when processing fails so Stripe can retry', async () => {
    const t = setup();
    t.stripe.retrieveSubscription.mockRejectedValueOnce(new Error('boom'));
    const evt = event('checkout.session.completed', {
      mode: 'subscription', customer: 'cus_1', subscription: 'sub_A', metadata: {},
    });
    await expect(t.service.handleStripeEvent(evt)).rejects.toThrow('boom');
    expect(t.stripeEventRepo.delete).toHaveBeenCalledWith({ stripe_event_id: 'evt_1' });

    await t.service.handleStripeEvent(evt);
    expect(t.row.stripe_subscription_id).toBe('sub_A');
  });

  it('applies the current Stripe state: plan from product, period from item, status', async () => {
    const t = setup();
    t.stripe.retrieveSubscription.mockResolvedValueOnce(stripeSub({ status: 'past_due' }));
    await t.service.handleStripeEvent(event('customer.subscription.updated', stripeSub({ status: 'active' })));

    expect(t.row.plan_id).toBe(PRO.id);
    expect(t.row.plan).toBe(PRO);
    expect(t.row.status).toBe('past_due');
    expect(t.row.past_due_since).toBeInstanceOf(Date);
    expect(t.row.current_period_end).toEqual(new Date(1_782_592_000 * 1000));
    expect(t.orgRepo.update).toHaveBeenCalledWith({ id: ORG }, { plan: 'professional' });
    expect(t.billingAccess.invalidate).toHaveBeenCalledWith(ORG);
    expect(t.rabbit.emit).toHaveBeenCalledWith(
      'subscription.updated',
      expect.objectContaining({ organization_id: ORG, plan_name: 'professional', status: 'past_due' }),
    );
  });

  it('sends the "subscription created" email only when a new subscription starts', async () => {
    const t = setup();
    await t.service.handleStripeEvent(event('customer.subscription.created', stripeSub(), 'evt_1'));
    await t.service.handleStripeEvent(event('customer.subscription.updated', stripeSub(), 'evt_2'));
    const created = t.dispatch.dispatch.mock.calls.filter(
      ([arg]) => arg.eventType === 'subscription_created',
    );
    expect(created).toHaveLength(1);
  });

  it('stores unknown Stripe statuses safely instead of violating the DB constraint', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_A', plan: PRO, plan_id: PRO.id }));
    t.stripe.retrieveSubscription.mockResolvedValueOnce(stripeSub({ status: 'something_new' }));
    await t.service.handleStripeEvent(event('customer.subscription.updated', stripeSub()));
    expect(t.row.status).toBe('incomplete');
  });

  it('ignores a late deletion of a previous subscription', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_B', plan: PRO, plan_id: PRO.id }));
    await t.service.handleStripeEvent(event('customer.subscription.deleted', stripeSub({ id: 'sub_A' })));
    expect(t.row.status).toBe('active');
    expect(t.row.plan_id).toBe(PRO.id);
  });

  it('keeps the paid plan (blocked) instead of falling back to demo when the subscription ends', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_A', plan: PRO, plan_id: PRO.id, status: 'past_due', past_due_since: new Date() }));
    await t.service.handleStripeEvent(event('customer.subscription.deleted', stripeSub({ id: 'sub_A' })));
    expect(t.row).toMatchObject({ status: 'canceled', plan_id: PRO.id, past_due_since: null });
    expect(t.orgRepo.update).not.toHaveBeenCalledWith({ id: ORG }, { plan: 'free' });
    expect(t.rabbit.emit).toHaveBeenCalledWith(
      'subscription.canceled',
      expect.objectContaining({ organization_id: ORG, plan_name: 'professional' }),
    );
  });

  it('ignores a deletion when the org has no recorded subscription (demo stays demo)', async () => {
    const t = setup();
    await t.service.handleStripeEvent(event('customer.subscription.deleted', stripeSub({ id: 'sub_X' })));
    expect(t.row).toMatchObject({ status: 'active', plan_id: FREE.id });
  });

  it.each(['incomplete', 'incomplete_expired'])(
    'keeps a demo org as demo while its first payment is %s',
    async (status) => {
      const t = setup();
      t.stripe.retrieveSubscription.mockResolvedValueOnce(stripeSub({ status }));
      await t.service.handleStripeEvent(event('customer.subscription.created', stripeSub({ status })));
      expect(t.row).toMatchObject({ status: 'active', plan_id: FREE.id, stripe_subscription_id: null });
    },
  );

  it('does not let a stale subscription overwrite the live one', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_B', plan: PRO, plan_id: PRO.id }));
    t.stripe.retrieveSubscription.mockResolvedValueOnce(stripeSub({ id: 'sub_A', status: 'canceled' }));
    await t.service.handleStripeEvent(event('customer.subscription.updated', stripeSub({ id: 'sub_A' })));
    expect(t.row.stripe_subscription_id).toBe('sub_B');
    expect(t.row.status).toBe('active');
  });

  it('never moves a Stripe customer to the org named in metadata', async () => {
    const t = setup();
    await t.service.handleStripeEvent(
      event('customer.subscription.updated', stripeSub({ metadata: { organization_id: OTHER_ORG } })),
    );
    expect(t.row.organization_id).toBe(ORG);
    expect(t.billingAccess.invalidate).toHaveBeenCalledWith(ORG);
    expect(t.billingAccess.invalidate).not.toHaveBeenCalledWith(OTHER_ORG);
  });

  it('restores access as soon as an overdue invoice is paid, and notifies once', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_A', plan: PRO, plan_id: PRO.id, status: 'past_due', past_due_since: new Date() }));
    const invoice = { id: 'in_1', customer: 'cus_1', amount_due: 14900, amount_paid: 14900, currency: 'usd', status_transitions: {} };

    await t.service.handleStripeEvent(event('invoice.paid', invoice, 'evt_1'));
    await t.service.handleStripeEvent(event('invoice.payment_succeeded', invoice, 'evt_2'));

    expect(t.row.status).toBe('active');
    expect(t.row.past_due_since).toBeNull();
    const paidEmits = t.rabbit.emit.mock.calls.filter(([p]) => p === 'invoice.paid');
    expect(paidEmits).toHaveLength(1);
  });

  it('restores access on a paid invoice even when Stripe cannot be reached for a refresh', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_A', plan: PRO, plan_id: PRO.id, status: 'unpaid', past_due_since: new Date() }));
    t.stripe.retrieveSubscription.mockRejectedValueOnce(new Error('Stripe unreachable'));
    await t.service.handleStripeEvent(event('invoice.paid', {
      id: 'in_9', customer: 'cus_1', amount_due: 14900, amount_paid: 14900, currency: 'usd', status_transitions: {},
    }));
    expect(t.row).toMatchObject({ status: 'active', past_due_since: null });
    expect(t.billingAccess.invalidate).toHaveBeenCalledWith(ORG);
  });

  it('marks the subscription past due when a renewal payment fails', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_A', plan: PRO, plan_id: PRO.id }));
    t.stripe.retrieveSubscription.mockResolvedValueOnce(stripeSub({ status: 'past_due' }));
    await t.service.handleStripeEvent(event('invoice.payment_failed', {
      id: 'in_2', customer: 'cus_1', amount_due: 14900, amount_paid: 0, currency: 'usd',
    }));
    expect(t.row.status).toBe('past_due');
    expect(t.invoiceRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: ORG, stripe_invoice_id: 'in_2', status: 'open' }),
      ['stripe_invoice_id'],
    );
  });

  it('connects the payment method from a completed setup checkout', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_A', plan: PRO, plan_id: PRO.id }));
    t.stripe.retrievePaymentMethod.mockResolvedValueOnce({
      id: 'pm_1', type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
    });
    await t.service.handleStripeEvent(event('checkout.session.completed', {
      id: 'cs_1', mode: 'setup', customer: 'cus_1', metadata: { organization_id: ORG },
      setup_intent: { id: 'seti_1', payment_method: 'pm_1' },
    }));

    expect(t.stripe.setDefaultPaymentMethod).toHaveBeenCalledWith('cus_1', 'pm_1', 'sub_A');
    expect(t.row).toMatchObject({
      payment_method_id: 'pm_1', payment_method_brand: 'visa', payment_method_last4: '4242',
      payment_method_exp_month: 12, payment_method_exp_year: 2030,
    });
    expect(t.billingAccess.invalidate).toHaveBeenCalledWith(ORG);
  });
});

describe('SubscriptionService — billing actions', () => {
  it('refuses to open a second checkout while a subscription is live', async () => {
    const t = setup(baseSub({ stripe_subscription_id: 'sub_A', plan: PRO, plan_id: PRO.id }));
    await expect(
      t.service.startCheckout(ORG, { plan_id: PRO.id, period: 'monthly' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(t.stripe.createSubscriptionCheckoutSession).not.toHaveBeenCalled();
  });

  it('charges the DB amount when the Stripe catalog price does not match it', async () => {
    const t = setup();
    const pro = { ...PRO, stripe_price_id_monthly: 'price_old' };
    (t.service as unknown as { planRepo: { findOne: jest.Mock } }).planRepo.findOne
      .mockResolvedValueOnce(pro);
    t.stripe.retrievePrice.mockResolvedValueOnce({
      active: true, unit_amount: 9900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 },
    });

    const result = await t.service.startCheckout(ORG, { plan_id: PRO.id, period: 'monthly' });

    expect(result).toEqual({ url: 'https://checkout.stripe.test/s' });
    expect(t.stripe.createSubscriptionCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        price: { kind: 'inline', productId: 'prod_pro', unitAmount: 14900, currency: 'usd', interval: 'month' },
        metadata: { organization_id: ORG, plan_id: PRO.id, billing_period: 'monthly' },
        successUrl: 'https://app.test/admin/billing?checkout=success',
      }),
    );
  });

  it('uses the catalog price when it matches the DB amount', async () => {
    const t = setup();
    const pro = { ...PRO, stripe_price_id_yearly: 'price_y' };
    (t.service as unknown as { planRepo: { findOne: jest.Mock } }).planRepo.findOne
      .mockResolvedValueOnce(pro);
    t.stripe.retrievePrice.mockResolvedValueOnce({
      active: true, unit_amount: 149000, currency: 'usd', recurring: { interval: 'year', interval_count: 1 },
    });
    await t.service.startCheckout(ORG, { plan_id: PRO.id, period: 'yearly' });
    expect(t.stripe.createSubscriptionCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ price: { kind: 'catalog', priceId: 'price_y' } }),
    );
  });

  it('rejects checkout for the free plan', async () => {
    const t = setup();
    await expect(t.service.startCheckout(ORG, { plan_id: FREE.id, period: 'monthly' })).rejects.toThrow(
      /free plan/,
    );
  });

  it('requires a live subscription to change plans', async () => {
    const t = setup();
    await expect(t.service.changePlan(ORG, { plan_id: PRO.id, period: 'yearly' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
