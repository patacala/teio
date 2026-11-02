import { Injectable, Logger, NotFoundException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import type { ClientProxy } from '@nestjs/microservices';
import type Stripe from 'stripe';
import { PlanEntity } from './entities/plan.entity';
import { SubscriptionEntity } from './entities/subscription.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { StripeService } from './stripe.service';
import { UsageTrackingService } from './usage-tracking.service';
import { CommunicationDispatchService } from '../communications/communication-dispatch.service';
import { CommunicationEventType, ChannelType, UserRole } from '@crm/shared';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { RABBITMQ_SERVICE } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import type { BillingOverview, BillingSubscription, UsageSummary } from '@crm/shared';

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
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly stripeService: StripeService,
    private readonly usageTrackingService: UsageTrackingService,
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(RABBITMQ_SERVICE)
    private readonly rabbitMQ: ClientProxy | null,
    @Optional()
    private readonly dispatchService: CommunicationDispatchService,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async getPlans(): Promise<PlanEntity[]> {
    return this.planRepo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC' },
    });
  }

  async getOrCreateForOrg(orgId: string): Promise<SubscriptionEntity> {
    const existing = await this.subRepo.findOne({
      where: { organization_id: orgId },
      relations: ['plan'],
    });
    if (existing) return existing;

    const freePlan = await this.planRepo.findOneOrFail({ where: { name: 'free' } });
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const sub = this.subRepo.create({
      organization_id: orgId,
      plan_id: freePlan.id,
      status: 'active',
      billing_period: 'monthly',
      current_period_start: now,
      current_period_end: periodEnd,
    });
    return this.subRepo.save(sub);
  }

  async getOverview(orgId: string): Promise<BillingOverview> {
    const sub = await this.getOrCreateForOrg(orgId);
    const usage = await this.usageTrackingService.getCurrentUsage(orgId);

    const subscription: BillingSubscription = {
      id: sub.id,
      organization_id: sub.organization_id,
      plan: {
        id: sub.plan.id,
        name: sub.plan.name,
        price_monthly: sub.plan.price_monthly,
        price_yearly: sub.plan.price_yearly,
        limits: sub.plan.limits as any,
        features: sub.plan.features,
        sort_order: sub.plan.sort_order,
      },
      stripe_customer_id: sub.stripe_customer_id,
      stripe_subscription_id: sub.stripe_subscription_id,
      status: sub.status as any,
      billing_period: sub.billing_period as any,
      current_period_start: sub.current_period_start.toISOString(),
      current_period_end: sub.current_period_end.toISOString(),
      trial_end: sub.trial_end?.toISOString() ?? null,
      cancel_at_period_end: sub.cancel_at_period_end,
    };

    const usageSummary: UsageSummary = {
      organization_id: orgId,
      period_start: sub.current_period_start.toISOString(),
      period_end: sub.current_period_end.toISOString(),
      conversations: usage.conversations,
      messages: usage.messages,
      ai_calls: usage.ai_calls,
      voice_minutes: usage.voice_minutes,
    };

    return {
      subscription,
      usage: usageSummary,
      limits: sub.plan.limits as any,
    };
  }

  async createStripeCustomer(orgId: string): Promise<SubscriptionEntity> {
    const sub = await this.getOrCreateForOrg(orgId);
    if (sub.stripe_customer_id) return sub;

    const org = await this.orgRepo.findOneOrFail({ where: { id: orgId } });
    const customer = await this.stripeService.createCustomer(
      `${org.slug}@noreply.local`,
      org.name,
      orgId,
    );

    sub.stripe_customer_id = customer.id;
    return this.subRepo.save(sub);
  }

  async createStripeSubscription(
    orgId: string,
    planId: string,
    period: 'monthly' | 'yearly',
  ): Promise<{ subscription: SubscriptionEntity; clientSecret: string | null }> {
    let sub = await this.createStripeCustomer(orgId);

    const plan = await this.planRepo.findOneOrFail({ where: { id: planId } });
    const priceId =
      period === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;

    if (!priceId) {
      throw new NotFoundException(`No Stripe price configured for plan ${plan.name}/${period}`);
    }

    const stripeSub = await this.stripeService.createSubscription(
      sub.stripe_customer_id!,
      priceId,
    );

    sub.stripe_subscription_id = stripeSub.id;
    sub.plan_id = planId;
    sub.billing_period = period;
    sub.status = stripeSub.status as any;
    sub = await this.subRepo.save(sub);

    // In Stripe v20, client_secret is on confirmation_secret, not payment_intent
    const latestInvoice = stripeSub.latest_invoice as Stripe.Invoice | null;
    const clientSecret =
      (latestInvoice as any)?.confirmation_secret?.client_secret ??
      (latestInvoice as any)?.payment_intent?.client_secret ??
      null;

    return { subscription: sub, clientSecret };
  }

  async createPortalSession(orgId: string, returnUrl: string): Promise<string> {
    const sub = await this.getOrCreateForOrg(orgId);
    if (!sub.stripe_customer_id) {
      throw new NotFoundException('No Stripe customer found. Create one first.');
    }
    return this.stripeService.createPortalSession(sub.stripe_customer_id, returnUrl);
  }

  async cancelSubscription(orgId: string): Promise<SubscriptionEntity> {
    const sub = await this.getOrCreateForOrg(orgId);
    if (!sub.stripe_subscription_id) {
      throw new NotFoundException('No active Stripe subscription found.');
    }
    await this.stripeService.cancelSubscription(sub.stripe_subscription_id);
    sub.cancel_at_period_end = true;
    return this.subRepo.save(sub);
  }

  // ── Stripe Webhook Handlers ───────────────────────────────────────────────

  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Stripe event: ${event.type}`);
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  // ── Private Stripe event handlers ─────────────────────────────────────────

  private async handleSubscriptionUpsert(stripeSub: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;

    const sub = await this.subRepo.findOne({ where: { stripe_customer_id: customerId } });
    if (!sub) {
      this.logger.warn(`No subscription found for Stripe customer ${customerId}`);
      return;
    }

    const priceId = stripeSub.items.data[0]?.price?.id;
    if (priceId) {
      const plan = await this.planRepo.findOne({
        where: [
          { stripe_price_id_monthly: priceId },
          { stripe_price_id_yearly: priceId },
        ],
      });
      if (plan) {
        sub.plan_id = plan.id;
        await this.syncOrgPlan(sub.organization_id, plan.name);
      }
    }

    sub.stripe_subscription_id = stripeSub.id;
    sub.status = stripeSub.status as any;
    sub.cancel_at_period_end = stripeSub.cancel_at_period_end;
    // Stripe v20 removed current_period_start/end; use billing_cycle_anchor as period start
    const periodStart = new Date(stripeSub.billing_cycle_anchor * 1000);
    sub.current_period_start = periodStart;
    const periodEnd = new Date(periodStart);
    if (sub.billing_period === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    sub.current_period_end = periodEnd;
    if (stripeSub.trial_end) {
      sub.trial_end = new Date(stripeSub.trial_end * 1000);
    }

    await this.subRepo.save(sub);
    this.emit(RABBITMQ_QUEUES.SUBSCRIPTION_UPDATED, { subscription_id: sub.id });

    // Dispatch subscription created email for new subscriptions
    const plan = sub.plan_id ? await this.planRepo.findOne({ where: { id: sub.plan_id } }) : null;
    if (plan) {
      void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.SUBSCRIPTION_CREATED, {
        plan_name: plan.name,
      });
    }
  }

  private async handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;

    const sub = await this.subRepo.findOne({ where: { stripe_customer_id: customerId } });
    if (!sub) return;

    sub.status = 'canceled';
    sub.cancel_at_period_end = false;
    await this.subRepo.save(sub);

    const freePlan = await this.planRepo.findOne({ where: { name: 'free' } });
    if (freePlan) {
      sub.plan_id = freePlan.id;
      await this.subRepo.save(sub);
      await this.syncOrgPlan(sub.organization_id, 'free');
    }

    this.emit(RABBITMQ_QUEUES.SUBSCRIPTION_CANCELED, { subscription_id: sub.id });

    void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.SUBSCRIPTION_CANCELLED, {
      plan_name: 'free',
    });
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;

    const sub = await this.subRepo.findOne({ where: { stripe_customer_id: customerId } });
    if (!sub) return;

    await this.invoiceRepo.upsert(
      {
        organization_id: sub.organization_id,
        stripe_invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status: 'paid',
        invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_pdf: invoice.invoice_pdf ?? null,
        period_start: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        period_end: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        paid_at: new Date(),
      },
      ['stripe_invoice_id'],
    );

    this.emit(RABBITMQ_QUEUES.INVOICE_PAID, {
      organization_id: sub.organization_id,
      invoice_id: invoice.id,
    });

    void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.PAYMENT_SUCCEEDED, {
      amount: String((invoice.amount_paid ?? 0) / 100),
      invoice_id: invoice.id,
    });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;

    const sub = await this.subRepo.findOne({ where: { stripe_customer_id: customerId } });
    if (!sub) return;

    await this.invoiceRepo.upsert(
      {
        organization_id: sub.organization_id,
        stripe_invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status: 'open',
        invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_pdf: invoice.invoice_pdf ?? null,
        period_start: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        period_end: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      },
      ['stripe_invoice_id'],
    );

    sub.status = 'past_due';
    await this.subRepo.save(sub);

    this.emit(RABBITMQ_QUEUES.INVOICE_PAYMENT_FAILED, {
      organization_id: sub.organization_id,
      invoice_id: invoice.id,
    });

    void this.dispatchBillingEmail(sub.organization_id, CommunicationEventType.PAYMENT_FAILED, {
      amount: String((invoice.amount_due ?? 0) / 100),
      invoice_id: invoice.id,
    });
  }

  async syncOrgPlan(orgId: string, planName: string): Promise<void> {
    await this.orgRepo.update({ id: orgId }, { plan: planName });
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
      const admin = await this.userRepo.findOne({
        where: [
          { organization_id: orgId, role: UserRole.OWNER },
          { organization_id: orgId, role: UserRole.ADMIN },
        ],
        order: { role: 'ASC' }, // owner sorts before admin
      });
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
