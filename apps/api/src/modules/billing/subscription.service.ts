import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ClientProxy } from '@nestjs/microservices';
import type Stripe from 'stripe';
import {
  CommunicationEventType,
  ChannelType,
  UserRole,
  SUBSCRIPTION_STATUSES,
  buildPaginationMeta,
} from '@crm/shared';
import type {
  BillingAccess,
  BillingInvoice,
  BillingOverview,
  BillingPaymentMethod,
  BillingPeriod,
  BillingPlan,
  BillingRedirect,
  BillingSubscription,
  InvoiceStatus,
  PaginatedResponse,
  PlanLimits,
  SubscriptionStatus,
  UsageSummary,
} from '@crm/shared';
import { PlanEntity } from './entities/plan.entity';
import { SubscriptionEntity } from './entities/subscription.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { StripeEventEntity } from './entities/stripe-event.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { StripeService } from './stripe.service';
import type { RecurringPriceSpec } from './stripe.service';
import { BillingAccessService, FREE_PLAN_NAME } from './billing-access.service';
import { isPaidPlan, isPaymentMethodExpired, NO_LIMITS, resolveDemoEndsAt } from './billing-access.policy';
import { CommunicationDispatchService } from '../communications/communication-dispatch.service';
import { RABBITMQ_QUEUES, RABBITMQ_SERVICE } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import type { ChangePlanDto, StartCheckoutDto } from './dto/billing.dto';

/** Subscriptions Stripe still bills (or is trying to). A second one must never be created. */
const LIVE_STATUSES = new Set<SubscriptionStatus>(['active', 'trialing', 'past_due', 'unpaid', 'paused']);
const NOT_STARTED_STATUSES = new Set<SubscriptionStatus>(['incomplete', 'incomplete_expired']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PG_UNIQUE_VIOLATION = '23505';

type StripeRef = string | { id: string } | null | undefined;

function refId(ref: StripeRef): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

function fromUnix(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

function normalizeStatus(status: string): SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
    ? (status as SubscriptionStatus)
    : 'incomplete';
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subRepo: Repository<SubscriptionEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(StripeEventEntity)
    private readonly stripeEventRepo: Repository<StripeEventEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly stripeService: StripeService,
    private readonly billingAccess: BillingAccessService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(RABBITMQ_SERVICE)
    private readonly rabbitMQ: ClientProxy | null,
    @Optional()
    private readonly dispatchService: CommunicationDispatchService,
  ) {}

  // ── Read API ──────────────────────────────────────────────────────────────

  async getPlans(): Promise<BillingPlan[]> {
    const plans = await this.planRepo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC' },
    });
    return plans.map((p) => this.toBillingPlan(p));
  }

  async getOrCreateForOrg(orgId: string): Promise<SubscriptionEntity> {
    const existing = await this.subRepo.findOne({
      where: { organization_id: orgId },
      relations: ['plan'],
    });
    if (existing) return existing;

    const freePlan = await this.planRepo.findOne({ where: { name: FREE_PLAN_NAME } });
    if (!freePlan) {
      throw new ServiceUnavailableException('Billing plans are not configured.');
    }
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const org = await this.orgRepo.findOne({ where: { id: orgId }, select: ['id', 'created_at'] });

    try {
      await this.subRepo.insert({
        organization_id: orgId,
        plan_id: freePlan.id,
        status: 'active',
        billing_period: 'monthly',
        current_period_start: now,
        current_period_end: periodEnd,
        // The demo starts when the organization is created.
        demo_ends_at: resolveDemoEndsAt(null, org?.created_at ?? now, freePlan.demo_duration_days),
      });
    } catch (err) {
      // Concurrent first request for the org already created the row.
      if ((err as { code?: string }).code !== PG_UNIQUE_VIOLATION) throw err;
    }
    return this.subRepo.findOneOrFail({
      where: { organization_id: orgId },
      relations: ['plan'],
    });
  }

  async getAccess(orgId: string): Promise<BillingAccess> {
    return this.billingAccess.getAccess(orgId);
  }

  async getOverview(orgId: string): Promise<BillingOverview> {
    const sub = await this.getOrCreateForOrg(orgId);
    const [usage, access] = await Promise.all([
      this.billingAccess.getUsage(orgId),
      this.billingAccess.getAccess(orgId),
    ]);

    const usageSummary: UsageSummary = {
      organization_id: orgId,
      period_start: sub.current_period_start.toISOString(),
      period_end: sub.current_period_end.toISOString(),
      conversations: usage.conversations,
      messages: usage.messages,
      ai_calls: usage.ai_calls,
      voice_minutes: usage.voice_minutes,
      agents: usage.agents,
    };

    return {
      subscription: this.toBillingSubscription(sub),
      usage: usageSummary,
      limits: access.effective_limits,
      access,
      has_live_subscription: this.isLive(sub),
    };
  }

  async listInvoices(
    orgId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<BillingInvoice>> {
    const [rows, total] = await this.invoiceRepo.findAndCount({
      where: { organization_id: orgId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((inv) => ({
        id: inv.id,
        stripe_invoice_id: inv.stripe_invoice_id,
        amount_due: inv.amount_due,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        status: inv.status as InvoiceStatus,
        invoice_url: inv.invoice_url,
        invoice_pdf: inv.invoice_pdf,
        period_start: inv.period_start?.toISOString() ?? null,
        period_end: inv.period_end?.toISOString() ?? null,
        paid_at: inv.paid_at?.toISOString() ?? null,
        created_at: inv.created_at.toISOString(),
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  // ── Billing actions (owner/admin only — enforced in the controller) ───────

  async createStripeCustomer(orgId: string): Promise<SubscriptionEntity> {
    const sub = await this.getOrCreateForOrg(orgId);
    if (sub.stripe_customer_id) return sub;

    const org = await this.orgRepo.findOneOrFail({ where: { id: orgId } });
    const billingContact = await this.findBillingContact(orgId);
    const customer = await this.stripeService.createCustomer(
      billingContact?.email ?? `${org.slug}@noreply.local`,
      org.name,
      orgId,
    );

    await this.subRepo.update({ id: sub.id }, { stripe_customer_id: customer.id });
    sub.stripe_customer_id = customer.id;
    return sub;
  }

  async startCheckout(orgId: string, dto: StartCheckoutDto): Promise<BillingRedirect> {
    const plan = await this.findPurchasablePlan(dto.plan_id);
    const sub = await this.createStripeCustomer(orgId);
    if (this.isLive(sub)) {
      throw new ConflictException(
        'The organization already has a subscription. Change the plan instead.',
      );
    }

    const price = await this.resolvePrice(plan, dto.period);
    const session = await this.stripeService.createSubscriptionCheckoutSession({
      customerId: sub.stripe_customer_id!,
      price,
      metadata: { organization_id: orgId, plan_id: plan.id, billing_period: dto.period },
      successUrl: this.billingUrl('checkout=success'),
      cancelUrl: this.billingUrl('checkout=canceled'),
    });
    if (!session.url) throw new ServiceUnavailableException('Stripe did not return a checkout URL.');
    return { url: session.url };
  }

  async changePlan(orgId: string, dto: ChangePlanDto): Promise<BillingOverview> {
    const sub = await this.getOrCreateForOrg(orgId);
    if (!this.isLive(sub)) {
      throw new ConflictException('There is no active subscription to change. Start a checkout instead.');
    }
    const plan = await this.findPurchasablePlan(dto.plan_id);
    if (plan.id === sub.plan_id && dto.period === sub.billing_period) {
      throw new BadRequestException('The organization is already on this plan.');
    }

    const current = await this.stripeService.retrieveSubscription(sub.stripe_subscription_id!);
    const item = current.items.data[0];
    if (!item) throw new ConflictException('The Stripe subscription has no items to update.');

    const price = await this.resolvePrice(plan, dto.period);
    const updated = await this.stripeService.changeSubscriptionPrice(current.id, item.id, price, {
      organization_id: orgId,
      plan_id: plan.id,
      billing_period: dto.period,
    });
    await this.applyStripeSubscription(sub, updated);
    return this.getOverview(orgId);
  }

  async createPaymentMethodSession(orgId: string): Promise<BillingRedirect> {
    const sub = await this.createStripeCustomer(orgId);
    const session = await this.stripeService.createSetupCheckoutSession({
      customerId: sub.stripe_customer_id!,
      currency: (sub.plan?.currency ?? 'usd').toLowerCase(),
      metadata: { organization_id: orgId, purpose: 'payment_method' },
      successUrl: this.billingUrl('payment_method=success'),
      cancelUrl: this.billingUrl('payment_method=canceled'),
    });
    if (!session.url) throw new ServiceUnavailableException('Stripe did not return a setup URL.');
    return { url: session.url };
  }

  async createPortalSession(orgId: string): Promise<BillingRedirect> {
    const sub = await this.createStripeCustomer(orgId);
    const url = await this.stripeService.createPortalSession(
      sub.stripe_customer_id!,
      this.billingUrl(),
    );
    return { url };
  }

  async cancelSubscription(orgId: string): Promise<BillingOverview> {
    const sub = await this.getOrCreateForOrg(orgId);
    if (!this.isLive(sub)) {
      throw new NotFoundException('No active subscription found.');
    }
    const updated = await this.stripeService.cancelSubscription(sub.stripe_subscription_id!);
    await this.applyStripeSubscription(sub, updated);
    return this.getOverview(orgId);
  }

  async resumeSubscription(orgId: string): Promise<BillingOverview> {
    const sub = await this.getOrCreateForOrg(orgId);
    if (!this.isLive(sub) || !sub.cancel_at_period_end) {
      throw new BadRequestException('The subscription is not scheduled for cancellation.');
    }
    const updated = await this.stripeService.resumeSubscription(sub.stripe_subscription_id!);
    await this.applyStripeSubscription(sub, updated);
    return this.getOverview(orgId);
  }

  async syncOrgPlan(orgId: string, planName: string): Promise<void> {
    await this.orgRepo.update({ id: orgId }, { plan: planName });
  }

  // ── Stripe webhooks ───────────────────────────────────────────────────────

  /**
   * Idempotent: each Stripe event id is claimed once. If processing fails the
   * claim is released so Stripe's retry can process it again.
   */
  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    const claimed = await this.claimEvent(event);
    if (!claimed) {
      this.logger.debug(`Stripe event ${event.id} (${event.type}) already processed — skipping`);
      return;
    }

    try {
      const orgId = await this.dispatchStripeEvent(event);
      await this.stripeEventRepo.update(
        { stripe_event_id: event.id },
        { processed_at: new Date(), organization_id: orgId },
      );
    } catch (err) {
      await this.stripeEventRepo.delete({ stripe_event_id: event.id }).catch(() => undefined);
      throw err;
    }
  }

  private async dispatchStripeEvent(event: Stripe.Event): Promise<string | null> {
    this.logger.log(`Stripe event: ${event.type} (${event.id})`);
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(event.data.object);
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        return this.handleSubscriptionUpsert(event.data.object);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(event.data.object);
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        return this.handleInvoicePaid(event.data.object);
      case 'invoice.payment_failed':
        return this.handleInvoicePaymentFailed(event.data.object);
      case 'invoice.voided':
        return this.handleInvoiceStatus(event.data.object, 'void');
      case 'invoice.marked_uncollectible':
        return this.handleInvoiceStatus(event.data.object, 'uncollectible');
      case 'customer.updated':
        return this.syncPaymentMethodForCustomer(event.data.object.id);
      case 'payment_method.attached':
      case 'payment_method.updated':
      case 'payment_method.automatically_updated':
      case 'payment_method.detached':
        return this.handlePaymentMethodEvent(event.data.object);
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
        return null;
    }
  }

  private async claimEvent(event: Stripe.Event): Promise<boolean> {
    const result = await this.stripeEventRepo
      .createQueryBuilder()
      .insert()
      .into(StripeEventEntity)
      .values({ stripe_event_id: event.id, type: event.type })
      .orIgnore()
      .returning(['id'])
      .execute();
    return Array.isArray(result.raw) && result.raw.length > 0;
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<string | null> {
    const customerId = refId(session.customer);
    if (!customerId) return null;

    const sub = await this.findSubscriptionForStripe(
      customerId,
      session.metadata?.organization_id ?? session.client_reference_id,
    );
    if (!sub) return null;

    if (session.mode === 'subscription') {
      const stripeSubId = refId(session.subscription);
      if (stripeSubId) {
        const stripeSub = await this.stripeService.retrieveSubscription(stripeSubId);
        await this.applyIfCurrent(sub, stripeSub);
      }
    } else if (session.mode === 'setup') {
      await this.applySetupSession(sub, session);
    }
    return sub.organization_id;
  }

  private async applySetupSession(
    sub: SubscriptionEntity,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    let setupIntent = session.setup_intent;
    if (typeof setupIntent === 'string') {
      const full = await this.stripeService.retrieveCheckoutSession(session.id);
      setupIntent = full.setup_intent;
    }
    const pmId = setupIntent && typeof setupIntent === 'object' ? refId(setupIntent.payment_method) : null;
    if (!pmId || !sub.stripe_customer_id) return;

    await this.stripeService.setDefaultPaymentMethod(
      sub.stripe_customer_id,
      pmId,
      this.isLive(sub) ? sub.stripe_subscription_id : null,
    );
    const pm = await this.stripeService.retrievePaymentMethod(pmId);
    this.applyPaymentMethod(sub, pm);
    await this.persist(sub);
  }

  private async handleSubscriptionUpsert(payload: Stripe.Subscription): Promise<string | null> {
    const customerId = refId(payload.customer);
    if (!customerId) return null;
    const sub = await this.findSubscriptionForStripe(customerId, payload.metadata?.organization_id);
    if (!sub) return null;

    // Events can arrive out of order: always apply Stripe's current state.
    const fresh = await this.stripeService.retrieveSubscription(payload.id).catch((err) => {
      this.logger.warn(`Could not refresh subscription ${payload.id}: ${(err as Error).message}`);
      return payload;
    });
    await this.applyIfCurrent(sub, fresh);
    return sub.organization_id;
  }

  private async handleSubscriptionDeleted(payload: Stripe.Subscription): Promise<string | null> {
    const customerId = refId(payload.customer);
    if (!customerId) return null;
    const sub = await this.findSubscriptionForStripe(customerId, payload.metadata?.organization_id);
    if (!sub) return null;

    if (sub.stripe_subscription_id !== payload.id) {
      this.logger.log(
        `Ignoring deletion of ${payload.id}: org ${sub.organization_id} is on ${sub.stripe_subscription_id ?? 'no subscription'}`,
      );
      return sub.organization_id;
    }

    // The org keeps its paid plan and is blocked until it subscribes again;
    // it does not fall back to the demo plan.
    sub.status = 'canceled';
    sub.cancel_at_period_end = false;
    sub.past_due_since = null;
    await this.persist(sub);

    this.emit(RABBITMQ_QUEUES.SUBSCRIPTION_CANCELED, {
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      plan_id: sub.plan_id,
      plan_name: sub.plan?.name,
    });
    void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.SUBSCRIPTION_CANCELLED, {
      plan_name: sub.plan?.name ?? '',
    });
    return sub.organization_id;
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<string | null> {
    const sub = await this.findSubscriptionForInvoice(invoice);
    if (!sub) return null;

    const previous = await this.invoiceRepo.findOne({
      where: { stripe_invoice_id: invoice.id, organization_id: sub.organization_id },
    });
    await this.upsertInvoice(sub.organization_id, invoice, 'paid', {
      paid_at: fromUnix(invoice.status_transitions?.paid_at) ?? new Date(),
    });

    // A payment was received: restore access now instead of waiting for
    // subscription.updated. If Stripe cannot be reached, trust the paid invoice.
    if (sub.stripe_subscription_id && (sub.status === 'past_due' || sub.status === 'unpaid')) {
      const refreshed = await this.refreshFromStripe(sub);
      if (!refreshed) {
        sub.status = 'active';
        sub.past_due_since = null;
        await this.persist(sub);
      }
    }

    if (previous?.status !== 'paid') {
      this.emit(RABBITMQ_QUEUES.INVOICE_PAID, {
        organization_id: sub.organization_id,
        invoice_id: invoice.id,
        amount: (invoice.amount_paid ?? 0) / 100,
        currency: invoice.currency,
      });
      void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.PAYMENT_SUCCEEDED, {
        amount: String((invoice.amount_paid ?? 0) / 100),
        invoice_id: invoice.id,
      });
    }
    return sub.organization_id;
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<string | null> {
    const sub = await this.findSubscriptionForInvoice(invoice);
    if (!sub) return null;

    await this.upsertInvoice(sub.organization_id, invoice, 'open');

    if (sub.stripe_subscription_id && this.isLive(sub)) {
      const refreshed = await this.refreshFromStripe(sub);
      if (!refreshed && sub.status !== 'past_due' && sub.status !== 'unpaid') {
        sub.status = 'past_due';
        sub.past_due_since = sub.past_due_since ?? new Date();
        await this.persist(sub);
      }
    }

    this.emit(RABBITMQ_QUEUES.INVOICE_PAYMENT_FAILED, {
      organization_id: sub.organization_id,
      invoice_id: invoice.id,
      amount: (invoice.amount_due ?? 0) / 100,
      currency: invoice.currency,
      status: sub.status,
    });
    void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.PAYMENT_FAILED, {
      amount: String((invoice.amount_due ?? 0) / 100),
      invoice_id: invoice.id,
    });
    return sub.organization_id;
  }

  private async handleInvoiceStatus(
    invoice: Stripe.Invoice,
    status: InvoiceStatus,
  ): Promise<string | null> {
    const sub = await this.findSubscriptionForInvoice(invoice);
    if (!sub) return null;
    await this.upsertInvoice(sub.organization_id, invoice, status);
    return sub.organization_id;
  }

  private async handlePaymentMethodEvent(pm: Stripe.PaymentMethod): Promise<string | null> {
    let customerId = refId(pm.customer);
    if (!customerId) {
      // Detached methods no longer reference the customer.
      const owner = await this.subRepo.findOne({ where: { payment_method_id: pm.id } });
      customerId = owner?.stripe_customer_id ?? null;
    }
    if (!customerId) return null;
    return this.syncPaymentMethodForCustomer(customerId);
  }

  private async syncPaymentMethodForCustomer(customerId: string): Promise<string | null> {
    const sub = await this.subRepo.findOne({
      where: { stripe_customer_id: customerId },
      relations: ['plan'],
    });
    if (!sub) return null;

    const customer = await this.stripeService.retrieveCustomer(customerId);
    let pm: string | Stripe.PaymentMethod | null = null;
    if (!('deleted' in customer && customer.deleted)) {
      pm = (customer as Stripe.Customer).invoice_settings?.default_payment_method ?? null;
    }
    if (!pm && sub.stripe_subscription_id && this.isLive(sub)) {
      const stripeSub = await this.stripeService.retrieveSubscription(sub.stripe_subscription_id);
      pm = stripeSub.default_payment_method;
    }
    if (typeof pm === 'string') {
      pm = await this.stripeService.retrievePaymentMethod(pm);
    }

    if (pm) this.applyPaymentMethod(sub, pm);
    else this.clearPaymentMethod(sub);
    await this.persist(sub);
    return sub.organization_id;
  }

  // ── Sync helpers ──────────────────────────────────────────────────────────

  /**
   * Resolves the org's billing row for a Stripe customer. Stripe metadata is
   * only used to link a customer we have not recorded yet, and never to move
   * a customer between organizations.
   */
  private async findSubscriptionForStripe(
    customerId: string,
    metadataOrgId?: string | null,
  ): Promise<SubscriptionEntity | null> {
    const byCustomer = await this.subRepo.findOne({
      where: { stripe_customer_id: customerId },
      relations: ['plan'],
    });
    if (byCustomer) {
      if (metadataOrgId && metadataOrgId !== byCustomer.organization_id) {
        this.logger.error(
          `Stripe customer ${customerId} belongs to org ${byCustomer.organization_id} but metadata says ${metadataOrgId} — ignoring metadata`,
        );
      }
      return byCustomer;
    }

    if (metadataOrgId && UUID_RE.test(metadataOrgId)) {
      const org = await this.orgRepo.findOne({ where: { id: metadataOrgId }, select: ['id'] });
      if (org) {
        const sub = await this.getOrCreateForOrg(org.id);
        if (!sub.stripe_customer_id) {
          sub.stripe_customer_id = customerId;
          await this.subRepo.update({ id: sub.id }, { stripe_customer_id: customerId });
          return sub;
        }
      }
    }

    this.logger.warn(`No organization found for Stripe customer ${customerId}`);
    return null;
  }

  private async findSubscriptionForInvoice(invoice: Stripe.Invoice): Promise<SubscriptionEntity | null> {
    const customerId = refId(invoice.customer);
    if (!customerId) return null;
    return this.findSubscriptionForStripe(customerId);
  }

  /** Applies a Stripe subscription unless it is a stale one replaced by another live subscription. */
  private async applyIfCurrent(sub: SubscriptionEntity, stripeSub: Stripe.Subscription): Promise<void> {
    if (
      sub.stripe_subscription_id &&
      sub.stripe_subscription_id !== stripeSub.id &&
      this.isLive(sub)
    ) {
      const incomingLive = LIVE_STATUSES.has(normalizeStatus(stripeSub.status));
      const log = incomingLive ? this.logger.error.bind(this.logger) : this.logger.log.bind(this.logger);
      log(
        `Org ${sub.organization_id} is on ${sub.stripe_subscription_id}; ignoring ${stripeSub.id} (${stripeSub.status})` +
          (incomingLive ? ' — multiple live subscriptions, manual review required' : ''),
      );
      return;
    }
    await this.applyStripeSubscription(sub, stripeSub);
  }

  private async refreshFromStripe(sub: SubscriptionEntity): Promise<boolean> {
    if (!sub.stripe_subscription_id) return false;
    try {
      const fresh = await this.stripeService.retrieveSubscription(sub.stripe_subscription_id);
      await this.applyStripeSubscription(sub, fresh);
      return true;
    } catch (err) {
      this.logger.warn(`Could not refresh subscription ${sub.stripe_subscription_id}: ${(err as Error).message}`);
      return false;
    }
  }

  private async applyStripeSubscription(
    sub: SubscriptionEntity,
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    if (NOT_STARTED_STATUSES.has(normalizeStatus(stripeSub.status)) && !this.isLive(sub)) {
      // First payment not made yet: the org stays as it is (e.g. demo) until it is.
      this.logger.log(
        `Subscription ${stripeSub.id} is ${stripeSub.status}; org ${sub.organization_id} keeps its current plan`,
      );
      return;
    }
    const previousStripeSubId = sub.stripe_subscription_id;
    const item = stripeSub.items?.data?.[0];

    const plan = await this.resolvePlanForStripeSubscription(stripeSub);
    if (plan) {
      sub.plan = plan;
      sub.plan_id = plan.id;
    }

    const interval = item?.price?.recurring?.interval;
    if (interval === 'year') sub.billing_period = 'yearly';
    else if (interval === 'month') sub.billing_period = 'monthly';

    sub.stripe_subscription_id = stripeSub.id;
    sub.status = normalizeStatus(stripeSub.status);
    sub.cancel_at_period_end = stripeSub.cancel_at_period_end || stripeSub.cancel_at != null;
    sub.trial_end = fromUnix(stripeSub.trial_end);

    const periodStart = fromUnix(item?.current_period_start);
    const periodEnd = fromUnix(item?.current_period_end);
    if (periodStart) sub.current_period_start = periodStart;
    if (periodEnd) sub.current_period_end = periodEnd;

    if (sub.status === 'past_due' || sub.status === 'unpaid') {
      sub.past_due_since = sub.past_due_since ?? new Date();
    } else {
      sub.past_due_since = null;
    }

    if (stripeSub.default_payment_method && typeof stripeSub.default_payment_method === 'object') {
      this.applyPaymentMethod(sub, stripeSub.default_payment_method);
    }

    await this.persist(sub);
    if (plan) await this.syncOrgPlan(sub.organization_id, plan.name);

    this.emit(RABBITMQ_QUEUES.SUBSCRIPTION_UPDATED, {
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      plan_id: sub.plan_id,
      plan_name: sub.plan?.name,
      status: sub.status,
    });

    if (previousStripeSubId !== stripeSub.id && LIVE_STATUSES.has(sub.status)) {
      void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.SUBSCRIPTION_CREATED, {
        plan_name: sub.plan?.name ?? '',
      });
    }
  }

  /** Catalog price id → plan product → our own metadata (can be stale after a portal plan switch). */
  private async resolvePlanForStripeSubscription(stripeSub: Stripe.Subscription): Promise<PlanEntity | null> {
    const price = stripeSub.items?.data?.[0]?.price;
    if (price?.id) {
      const byPrice = await this.planRepo.findOne({
        where: [{ stripe_price_id_monthly: price.id }, { stripe_price_id_yearly: price.id }],
      });
      if (byPrice) return byPrice;
    }
    const productId = refId(price?.product as StripeRef);
    if (productId) {
      const byProduct = await this.planRepo.findOne({ where: { stripe_product_id: productId } });
      if (byProduct) return byProduct;
    }
    const planId = stripeSub.metadata?.plan_id;
    if (planId && UUID_RE.test(planId)) {
      return this.planRepo.findOne({ where: { id: planId } });
    }
    return null;
  }

  private applyPaymentMethod(sub: SubscriptionEntity, pm: Stripe.PaymentMethod): void {
    const card = pm.card;
    sub.payment_method_id = pm.id;
    sub.payment_method_type = pm.type;
    sub.payment_method_brand = card?.brand ?? null;
    sub.payment_method_last4 =
      card?.last4 ?? pm.sepa_debit?.last4 ?? pm.us_bank_account?.last4 ?? null;
    sub.payment_method_exp_month = card?.exp_month ?? null;
    sub.payment_method_exp_year = card?.exp_year ?? null;
  }

  private clearPaymentMethod(sub: SubscriptionEntity): void {
    sub.payment_method_id = null;
    sub.payment_method_type = null;
    sub.payment_method_brand = null;
    sub.payment_method_last4 = null;
    sub.payment_method_exp_month = null;
    sub.payment_method_exp_year = null;
  }

  private async persist(sub: SubscriptionEntity): Promise<void> {
    await this.subRepo.save(sub);
    await this.billingAccess.invalidate(sub.organization_id);
  }

  private async upsertInvoice(
    orgId: string,
    invoice: Stripe.Invoice,
    status: InvoiceStatus,
    extra: Partial<Pick<InvoiceEntity, 'paid_at'>> = {},
  ): Promise<void> {
    await this.invoiceRepo.upsert(
      {
        organization_id: orgId,
        stripe_invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status,
        invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_pdf: invoice.invoice_pdf ?? null,
        period_start: fromUnix(invoice.period_start),
        period_end: fromUnix(invoice.period_end),
        ...extra,
      },
      ['stripe_invoice_id'],
    );
  }

  // ── Pricing ───────────────────────────────────────────────────────────────

  private async findPurchasablePlan(planId: string): Promise<PlanEntity> {
    const plan = await this.planRepo.findOne({ where: { id: planId, is_active: true } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!isPaidPlan(plan)) {
      throw new BadRequestException(
        'The free plan needs no payment. Cancel the current subscription to move to it.',
      );
    }
    return plan;
  }

  /**
   * The DB amount is the price. A configured Stripe catalog price is only used
   * when it matches it exactly; otherwise the DB amount is charged inline.
   */
  private async resolvePrice(plan: PlanEntity, period: BillingPeriod): Promise<RecurringPriceSpec> {
    const amount = period === 'yearly' ? plan.price_yearly : plan.price_monthly;
    if (!amount || amount <= 0) {
      throw new BadRequestException(`Plan ${plan.name} has no ${period} price.`);
    }
    const interval = period === 'yearly' ? 'year' : 'month';
    const currency = (plan.currency ?? 'usd').toLowerCase();
    const catalogPriceId =
      period === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;

    if (catalogPriceId) {
      const price = await this.stripeService.retrievePrice(catalogPriceId);
      const matches =
        price.active &&
        price.unit_amount === amount &&
        price.currency === currency &&
        price.recurring?.interval === interval &&
        (price.recurring?.interval_count ?? 1) === 1;
      if (matches) return { kind: 'catalog', priceId: catalogPriceId };
      this.logger.warn(
        `Stripe price ${catalogPriceId} does not match plan ${plan.name}/${period} in the DB — charging the DB amount`,
      );
    }

    return {
      kind: 'inline',
      productId: await this.ensureStripeProduct(plan),
      unitAmount: amount,
      currency,
      interval,
    };
  }

  private async ensureStripeProduct(plan: PlanEntity): Promise<string> {
    if (plan.stripe_product_id) return plan.stripe_product_id;
    const product = await this.stripeService.createProduct(`Plan: ${plan.name}`, plan.id);
    await this.planRepo.update({ id: plan.id }, { stripe_product_id: product.id });
    plan.stripe_product_id = product.id;
    return product.id;
  }

  // ── Mapping ───────────────────────────────────────────────────────────────

  private isLive(sub: SubscriptionEntity): boolean {
    return !!sub.stripe_subscription_id && LIVE_STATUSES.has(sub.status);
  }

  private billingUrl(query?: string): string {
    const base = this.config.get<string>('billing.webUrl', 'http://localhost:3000');
    return `${base}/admin/billing${query ? `?${query}` : ''}`;
  }

  private toBillingPlan(plan: PlanEntity): BillingPlan {
    return {
      id: plan.id,
      name: plan.name,
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly,
      currency: plan.currency ?? 'usd',
      limits: { ...NO_LIMITS, ...(plan.limits ?? {}) } as PlanLimits,
      features: plan.features ?? [],
      sort_order: plan.sort_order,
      is_paid: isPaidPlan(plan),
    };
  }

  private toPaymentMethod(sub: SubscriptionEntity): BillingPaymentMethod | null {
    if (!sub.payment_method_id) return null;
    return {
      type: sub.payment_method_type ?? 'card',
      brand: sub.payment_method_brand,
      last4: sub.payment_method_last4,
      exp_month: sub.payment_method_exp_month,
      exp_year: sub.payment_method_exp_year,
      is_expired: isPaymentMethodExpired(
        { exp_month: sub.payment_method_exp_month, exp_year: sub.payment_method_exp_year },
        new Date(),
      ),
    };
  }

  private toBillingSubscription(sub: SubscriptionEntity): BillingSubscription {
    return {
      id: sub.id,
      organization_id: sub.organization_id,
      plan: this.toBillingPlan(sub.plan),
      stripe_customer_id: sub.stripe_customer_id,
      stripe_subscription_id: sub.stripe_subscription_id,
      status: sub.status,
      billing_period: sub.billing_period,
      current_period_start: sub.current_period_start.toISOString(),
      current_period_end: sub.current_period_end.toISOString(),
      trial_end: sub.trial_end?.toISOString() ?? null,
      cancel_at_period_end: sub.cancel_at_period_end,
      past_due_since: sub.past_due_since?.toISOString() ?? null,
      payment_method: this.toPaymentMethod(sub),
    };
  }

  // ── Side effects ──────────────────────────────────────────────────────────

  private async findBillingContact(orgId: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({
      where: [
        { organization_id: orgId, role: UserRole.OWNER },
        { organization_id: orgId, role: UserRole.ADMIN },
      ],
      order: { role: 'DESC' }, // 'owner' sorts after 'admin' alphabetically
    });
  }

  private emit(pattern: string, data: unknown): void {
    if (!this.rabbitMQ) return;
    try {
      this.rabbitMQ.emit(pattern, data);
    } catch (err) {
      this.logger.warn(`RabbitMQ emit failed for ${pattern}: ${(err as Error)?.message}`);
    }
  }

  private async dispatchBillingEmail(
    orgId: string,
    eventType: CommunicationEventType,
    variables: Record<string, string>,
  ): Promise<void> {
    if (!this.dispatchService) return;
    try {
      const admin = await this.findBillingContact(orgId);
      if (!admin) return;

      void this.dispatchService.dispatch({
        organizationId: orgId,
        eventType,
        channelType: ChannelType.EMAIL,
        recipient: admin.email,
        variables,
      }).catch(() => { /* non-critical */ });
    } catch {
      /* non-critical */
    }
  }
}
