import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService, CreateApiKeyDto } from './api-keys.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('api-keys')
@ApiBearerAuth()
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.service.findAllByOrg(tenant.organization_id);
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, tenant.user_id, dto);
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.revoke(id, tenant.organization_id);
  }
}
