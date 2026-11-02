import { Controller, Get, Post, Body, Query, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

function confirmationPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 40px; max-width: 420px; text-align: center; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

@ApiTags('payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List payments for the organization (optionally filtered by contact)' })
  findAll(@CurrentTenant() tenant: TenantContext, @Query('contact_id') contactId?: string) {
    return this.paymentsService.findAll(tenant.organization_id, contactId);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually generate a Stripe Checkout link for a contact (same as the agent tool)' })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createCheckoutLink(tenant.organization_id, dto);
  }

  /**
   * Stripe Checkout success/cancel redirect target. Public, unauthenticated —
   * the contact who just paid has no CRM session. Payment status itself is
   * only ever confirmed via the webhook, never from this redirect.
   */
  @Public()
  @Get('return')
  @ApiExcludeEndpoint()
  returnPage(@Query('status') status: string, @Res() res: Response): void {
    const html =
      status === 'success'
        ? confirmationPage('¡Gracias por tu pago!', 'Ya registramos tu pago. Puedes cerrar esta ventana.')
        : confirmationPage('Pago cancelado', 'No se realizó ningún cargo. Puedes cerrar esta ventana.');
    res.status(HttpStatus.OK).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
  }
}
