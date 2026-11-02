import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PaymentSettingsService } from './payment-settings.service';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'payments/settings', version: '1' })
export class PaymentSettingsController {
  constructor(private readonly settingsService: PaymentSettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get the organization's Stripe payment settings (secrets masked)" })
  @ApiResponse({ status: 200, description: 'Masked payment settings' })
  get(@CurrentTenant() tenant: TenantContext) {
    return this.settingsService.getMasked(tenant.organization_id);
  }

  @Patch()
  @ApiOperation({ summary: "Update the organization's Stripe secret key / webhook secret / currency" })
  @ApiResponse({ status: 200, description: 'Updated masked payment settings' })
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdatePaymentSettingsDto) {
    return this.settingsService.update(tenant.organization_id, dto);
  }
}
