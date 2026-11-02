import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TemplatesService, CreateTemplateDto } from './templates.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('templates')
@ApiBearerAuth()
@Controller({ path: 'templates', version: '1' })
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  getTemplates(
    @Query('channel') channel: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.getTemplates(tenant.organization_id, channel);
  }

  @Post()
  createTemplate(
    @Body() dto: CreateTemplateDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.createTemplate(tenant.organization_id, dto);
  }

  @Patch(':id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: Partial<CreateTemplateDto>,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateTemplate(id, tenant.organization_id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTemplate(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.deleteTemplate(id, tenant.organization_id);
  }
}
