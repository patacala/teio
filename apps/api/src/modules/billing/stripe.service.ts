import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Recurring price either from the Stripe catalog or built inline from DB amounts. */
export type RecurringPriceSpec =
  | { kind: 'catalog'; priceId: string }
  | {
      kind: 'inline';
      productId: string;
      unitAmount: number;
      currency: string;
      interval: 'month' | 'year';
    };

/**
 * Client for the PLATFORM's Stripe account (SaaS subscription billing).
 * Payments organizations collect from their own customers use their own keys
 * in the payments module and never go through this service.
 */
@Injectable()
export class StripeService {
  private _stripe: Stripe | null = null;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('STRIPE_SECRET_KEY', '');
    if (key) {
      this._stripe = new Stripe(key);
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not set — Stripe integration disabled');
    }
  }

  isConfigured(): boolean {
    return this._stripe !== null;
  }

  private get stripe(): Stripe {
    if (!this._stripe) {
      throw new ServiceUnavailableException('Billing is not configured on this server.');
    }
    return this._stripe;
  }

  /** Card errors are meant for the payer; anything else is logged and reported generically. */
  private async call<T>(operation: string, fn: (stripe: Stripe) => Promise<T>): Promise<T> {
    const stripe = this.stripe;
    try {
      return await fn(stripe);
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeError)) throw err;
      this.logger.error(`Stripe ${operation} failed: ${err.type} ${err.code ?? ''} ${err.message}`);
      if (err instanceof Stripe.errors.StripeCardError) {
        throw new HttpException(err.message, HttpStatus.PAYMENT_REQUIRED);
      }
      throw new BadGatewayException('The payment provider could not process the request. Try again later.');
    }
  }

  async createCustomer(
    email: string,
    name: string,
    orgId: string,
  ): Promise<Stripe.Customer> {
    return this.call('customers.create', (s) => s.customers.create(
      {
        email,
        name,
        metadata: { organization_id: orgId },
      },
      { idempotencyKey: `org-customer-${orgId}` },
    ));
  }

  async createProduct(name: string, planId: string): Promise<Stripe.Product> {
    return this.call('products.create', (s) => s.products.create(
      { name, metadata: { plan_id: planId } },
      { idempotencyKey: `plan-product-${planId}` },
    ));
  }

  async retrievePrice(priceId: string): Promise<Stripe.Price> {
    return this.call('prices.retrieve', (s) => s.prices.retrieve(priceId));
  }

  async createSubscriptionCheckoutSession(params: {
    customerId: string;
    price: RecurringPriceSpec;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.call('checkout.sessions.create', (s) => s.checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [
        params.price.kind === 'catalog'
          ? { price: params.price.priceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                product: params.price.productId,
                unit_amount: params.price.unitAmount,
                currency: params.price.currency,
                recurring: { interval: params.price.interval },
              },
            },
      ],
      payment_method_collection: 'always',
      client_reference_id: params.metadata.organization_id,
      metadata: params.metadata,
      subscription_data: { metadata: params.metadata },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    }));
  }

  async createSetupCheckoutSession(params: {
    customerId: string;
    currency: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.call('checkout.sessions.create', (s) => s.checkout.sessions.create({
      mode: 'setup',
      customer: params.customerId,
      currency: params.currency,
      client_reference_id: params.metadata.organization_id,
      metadata: params.metadata,
      setup_intent_data: { metadata: params.metadata },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    }));
  }

  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.call('checkout.sessions.retrieve', (s) => s.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent'] }));
  }

  async retrieveSubscription(stripeSubId: string): Promise<Stripe.Subscription> {
    return this.call('subscriptions.retrieve', (s) => s.subscriptions.retrieve(stripeSubId, {
      expand: ['default_payment_method'],
    }));
  }

  async changeSubscriptionPrice(
    stripeSubId: string,
    itemId: string,
    price: RecurringPriceSpec,
    metadata: Record<string, string>,
  ): Promise<Stripe.Subscription> {
    return this.call('subscriptions.update', (s) => s.subscriptions.update(stripeSubId, {
      items: [
        price.kind === 'catalog'
          ? { id: itemId, price: price.priceId }
          : {
              id: itemId,
              price_data: {
                product: price.productId,
                unit_amount: price.unitAmount,
                currency: price.currency,
                recurring: { interval: price.interval },
              },
            },
      ],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
      metadata,
      expand: ['default_payment_method'],
    }));
  }

  async retrieveCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.call('customers.retrieve', (s) => s.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    }));
  }

  async retrievePaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return this.call('paymentMethods.retrieve', (s) => s.paymentMethods.retrieve(paymentMethodId));
  }

  /** Makes the payment method the default for future invoices (customer + live subscription). */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
    stripeSubId: string | null,
  ): Promise<void> {
    await this.call('customers.update', (s) => s.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    }));
    if (stripeSubId) {
      await this.call('subscriptions.update', (s) => s.subscriptions.update(stripeSubId, {
        default_payment_method: paymentMethodId,
      }));
    }
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<string> {
    const session = await this.call('billingPortal.sessions.create', (s) => s.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    }));
    return session.url;
  }

  async cancelSubscription(stripeSubId: string): Promise<Stripe.Subscription> {
    return this.call('subscriptions.update', (s) => s.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    }));
  }

  async resumeSubscription(stripeSubId: string): Promise<Stripe.Subscription> {
    return this.call('subscriptions.update', (s) => s.subscriptions.update(stripeSubId, {
      cancel_at_period_end: false,
    }));
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
