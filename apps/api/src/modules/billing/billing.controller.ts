import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { UserRole } from '@crm/shared';
import type { TenantContext } from '@crm/shared';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { SkipBillingCheck } from './billing-access.decorators';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';
import { ChangePlanDto, ListInvoicesQueryDto, StartCheckoutDto } from './dto/billing.dto';

const BILLING_MANAGERS = [UserRole.OWNER, UserRole.ADMIN];

/**
 * Platform subscription billing for the organization itself. Every route must
 * keep working while the org is restricted so it can always fix its billing.
 */
@ApiTags('billing')
@ApiBearerAuth()
@SkipBillingCheck()
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('plans')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'List all available billing plans (public)' })
  @ApiResponse({ status: 200, description: 'Plans with DB-defined pricing, limits and features' })
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  @Get('status')
  @ApiOperation({ summary: 'Billing access status of the organization (any member)' })
  @ApiResponse({ status: 200, description: 'Access level, restriction reasons and effective limits' })
  getStatus(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.getAccess(tenant.organization_id);
  }

  @Get('subscription')
  @Roles(...BILLING_MANAGERS)
  @ApiOperation({ summary: 'Subscription overview: plan, status, payment method, usage, access' })
  @ApiResponse({ status: 403, description: 'Only owners and admins' })
  getSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.getOverview(tenant.organization_id);
  }

  @Get('usage')
  @Roles(...BILLING_MANAGERS)
  @ApiOperation({ summary: 'Current month usage metrics for the organization' })
  async getUsage(@CurrentTenant() tenant: TenantContext) {
    const overview = await this.subscriptionService.getOverview(tenant.organization_id);
    return overview.usage;
  }

  @Get('invoices')
  @Roles(...BILLING_MANAGERS)
  @ApiOperation({ summary: 'Paginated subscription invoices of the organization' })
  listInvoices(@CurrentTenant() tenant: TenantContext, @Query() query: ListInvoicesQueryDto) {
    return this.subscriptionService.listInvoices(
      tenant.organization_id,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Post('customer')
  @Roles(...BILLING_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or retrieve the Stripe customer for the organization' })
  async createCustomer(@CurrentTenant() tenant: TenantContext) {
    const sub = await this.subscriptionService.createStripeCustomer(tenant.organization_id);
    return { stripe_customer_id: sub.stripe_customer_id };
  }

  @Post('checkout')
  @Roles(...BILLING_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a Stripe Checkout session to subscribe to a paid plan' })
  @ApiResponse({ status: 200, description: '{ url } to redirect the browser to' })
  @ApiResponse({ status: 409, description: 'Organization already has a live subscription' })
  startCheckout(@CurrentTenant() tenant: TenantContext, @Body() dto: StartCheckoutDto) {
    return this.subscriptionService.startCheckout(tenant.organization_id, dto);
  }

  @Post('change-plan')
  @Roles(...BILLING_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch the live subscription to another paid plan/period (prorated)' })
  changePlan(@CurrentTenant() tenant: TenantContext, @Body() dto: ChangePlanDto) {
    return this.subscriptionService.changePlan(tenant.organization_id, dto);
  }

  @Post('payment-method')
  @Roles(...BILLING_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a Stripe Checkout setup session to connect or replace the payment method' })
  createPaymentMethodSession(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.createPaymentMethodSession(tenant.organization_id);
  }

  @Post('portal')
  @Roles(...BILLING_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Stripe billing portal session URL' })
  portal(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.createPortalSession(tenant.organization_id);
  }

  @Post('cancel')
  @Roles(...BILLING_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel the current subscription at period end' })
  cancel(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.cancelSubscription(tenant.organization_id);
  }

  @Post('resume')
  @Roles(...BILLING_MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a scheduled cancellation' })
  resume(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.resumeSubscription(tenant.organization_id);
  }

  @Public()
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      throw new UnauthorizedException('Missing Stripe signature');
    }

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    if (!webhookSecret || !this.stripeService.isConfigured()) {
      // Acknowledging would silently drop the event; a 5xx makes Stripe retry.
      this.logger.error('STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY not set — cannot process Stripe webhooks');
      throw new ServiceUnavailableException('Billing webhooks are not configured');
    }

    const rawBody = req.rawBody ?? Buffer.from('');
    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, sig);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature failed: ${(err as Error).message}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    await this.subscriptionService.handleStripeEvent(event);
    return { received: true };
  }
}
