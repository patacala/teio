import { Controller, Get, Post, Patch, Body, Param, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  getMe(@Req() req: Request, @CurrentTenant() tenant: TenantContext) {
    // Platform admins may be impersonating another org, so look up by ID only
    if (req.user?.is_platform_admin) {
      return this.service.findByIdUnscoped(tenant.user_id);
    }
    return this.service.findById(tenant.user_id, tenant.organization_id);
  }

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.service.findAllByOrg(tenant.organization_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, tenant.organization_id, dto);
  }
}
