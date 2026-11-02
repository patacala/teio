import {
  Controller, Post, Param, Req, ParseUUIDPipe,
  HttpCode, HttpStatus, Logger, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

/**
 * Each organization owns its own Stripe account (no Stripe Connect), so each
 * one registers its own webhook endpoint in ITS OWN Stripe dashboard pointing
 * here — the :organizationId segment is how we know whose settings to use to
 * verify the signature and process the event.
 */
@ApiExcludeController()
@Controller({ path: 'webhooks/payments/stripe', version: '1' })
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post(':organizationId')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const signature = req.headers['stripe-signature'] as string | undefined;
    if (!signature) {
      throw new UnauthorizedException('Missing Stripe signature');
    }

    const rawBody = req.rawBody ?? Buffer.from('');
    const event = await this.paymentsService
      .verifyWebhookSignature(organizationId, rawBody, signature)
      .catch((err: Error) => {
        this.logger.warn(`Stripe webhook signature failed for org ${organizationId}: ${err.message}`);
        throw new BadRequestException('Webhook signature verification failed');
      });

    await this.paymentsService.handleWebhookEvent(organizationId, event);
    return { received: true };
  }
}
