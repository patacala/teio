import {
  Controller, Get, Post, Patch, Delete, Query,
  Body, Param, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IntegrationsService, CreateWebhookDto, UpdateWebhookDto } from './integrations.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller({ path: 'webhooks', version: '1' })
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.service.findAll(tenant.organization_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Post()
  create(@Body() dto: CreateWebhookDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, dto);
  }

  // Static sub-routes BEFORE :id param routes
  @Post(':id/test')
  testWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.testWebhook(id, tenant.organization_id);
  }

  @Get(':id/logs')
  getLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.findDeliveries(id, tenant.organization_id, limit ? +limit : 50);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, tenant.organization_id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.delete(id, tenant.organization_id);
  }
}
