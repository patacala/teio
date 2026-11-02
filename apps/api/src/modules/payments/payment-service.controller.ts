import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PaymentServiceService } from './payment-service.service';
import { CreatePaymentServiceDto, UpdatePaymentServiceDto } from './dto/payment-service.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'payments/services', version: '1' })
export class PaymentServiceController {
  constructor(private readonly serviceService: PaymentServiceService) {}

  @Get()
  @ApiOperation({ summary: 'List payment services (things the agent can charge contacts for)' })
  findAll(@CurrentTenant() tenant: TenantContext, @Query('active_only') activeOnly?: string) {
    return this.serviceService.findAll(tenant.organization_id, activeOnly === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Create a payment service' })
  @ApiResponse({ status: 201, description: 'Service created' })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePaymentServiceDto) {
    return this.serviceService.create(tenant.organization_id, dto);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Payment service UUID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.serviceService.findById(id, tenant.organization_id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Payment service UUID' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentServiceDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.serviceService.update(id, tenant.organization_id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Payment service UUID' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.serviceService.remove(id, tenant.organization_id);
  }
}
