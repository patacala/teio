import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';

class SubscribeDto {
  planId: string;
  period: 'monthly' | 'yearly';
}

class PortalDto {
  returnUrl: string;
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
  ) {}

  // ── @Public endpoints ────────────────────────────────────────────────────

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'List all available billing plans (public)' })
  @ApiResponse({ status: 200, description: 'Array of plans with limits and pricing' })
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  // ── Authenticated endpoints ──────────────────────────────────────────────

  @Get('subscription')
  @ApiOperation({ summary: 'Get the current subscription overview for the organization' })
  @ApiResponse({ status: 200, description: 'Subscription details, plan info, and usage' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSubscription(@Req() req: Request) {
    return this.subscriptionService.getOverview(this.orgId(req));
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current month usage metrics for the organization' })
  @ApiResponse({ status: 200, description: 'Usage counters per metric (messages, contacts, etc.)' })
  async getUsage(@Req() req: Request) {
    const overview = await this.subscriptionService.getOverview(this.orgId(req));
    return overview.usage;
  }

  @Post('customer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or retrieve the Stripe customer for the organization' })
  @ApiResponse({ status: 200, description: 'Stripe customer ID' })
  createCustomer(@Req() req: Request) {
    return this.subscriptionService.createStripeCustomer(this.orgId(req));
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Stripe subscription for the organization' })
  @ApiResponse({ status: 200, description: 'Subscription created' })
  @ApiResponse({ status: 400, description: 'Invalid plan or period' })
  subscribe(@Req() req: Request, @Body() body: SubscribeDto) {
    return this.subscriptionService.createStripeSubscription(
      this.orgId(req),
      body.planId,
      body.period,
    );
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Stripe billing portal session URL' })
  @ApiResponse({ status: 200, description: 'Billing portal redirect URL' })
  async portal(@Req() req: Request, @Body() body: PortalDto) {
    const url = await this.subscriptionService.createPortalSession(
      this.orgId(req),
      body.returnUrl,
    );
    return { url };
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel the current subscription at period end' })
  @ApiResponse({ status: 200, description: 'Subscription scheduled for cancellation' })
  cancel(@Req() req: Request) {
    return this.subscriptionService.cancelSubscription(this.orgId(req));
  }

  // ── Stripe Webhook ───────────────────────────────────────────────────────

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
    if (!webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping verification');
      return { received: true };
    }

    const rawBody = req.rawBody ?? Buffer.from('');
    let event: import('stripe').default.Event;
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, sig);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature failed: ${(err as Error).message}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    await this.subscriptionService.handleStripeEvent(event);
    return { received: true };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private orgId(req: Request): string {
    const id = (req as any).tenant?.organization_id;
    if (!id) throw new BadRequestException('Tenant context missing');
    return id;
  }
}
